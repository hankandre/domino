import { fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { DEMO_CLAIM_IDS } from "$lib/demo";
import {
  isHouseholdManager,
  loadAccessManagement,
  setActorDisabled,
  updateActorClaimAccess,
  updateServiceAccountPermissions,
} from "$lib/server/auth/access-management";
import {
  claimAuthority,
  requirePagePermission,
} from "$lib/server/auth/authorization";
import { createInvitation, createPasswordReset } from "$lib/server/auth/local";
import {
  agentPermissionPresets,
  permissions,
} from "$lib/server/auth/permissions";
import { requireDb } from "$lib/server/db";
import { actors } from "$lib/server/db/schema";
import { consumeRateLimit } from "$lib/server/rate-limit";

export const load: PageServerLoad = async ({ locals }) => {
  requirePagePermission(locals.actor, "household:manage");
  if (process.env.DOMINO_DEMO_MODE === "true") {
    return {
      accounts: [
        {
          id: "demo-owner",
          userId: "demo-user",
          kind: "user" as const,
          name: "Alex Morgan",
          email: "alex@example.test",
          disabled: false,
          roleId: "demo-owner-role",
          roleName: "Owner",
          permissions: ["*"],
          roleSystem: true,
          claimAccessScope: "all" as const,
          selectedClaimIds: [],
          canReset: true,
          canToggle: false,
          canEditClaimAccess: true,
          canEditPermissions: false,
        },
        {
          id: "demo-hermes",
          userId: null,
          kind: "service" as const,
          name: "Hermes",
          email: null,
          disabled: false,
          roleId: "demo-agent-role",
          roleName: "Claim assistant",
          permissions: ["warranties:read", "claims:read"],
          roleSystem: false,
          claimAccessScope: "selected" as const,
          selectedClaimIds: [DEMO_CLAIM_IDS.dishwasherLeak],
          canReset: false,
          canToggle: true,
          canEditClaimAccess: true,
          canEditPermissions: true,
        },
      ],
      roles: [
        {
          id: "demo-member",
          name: "Member",
          description: "Household member",
          permissions: ["products:read"],
        },
      ],
      claims: [
        {
          id: DEMO_CLAIM_IDS.dishwasherLeak,
          reference: "CLM-2026-A1B2C3D4",
          issue: "Dishwasher leaking",
          status: "needs_evidence" as const,
          productName: "800 Series Dishwasher",
        },
      ],
      grantablePermissions: [...permissions],
      permissionPresets: agentPermissionPresets,
      canGrantAllClaims: true,
      defaultInvitationClaimScope: "all" as const,
      defaultInvitationClaimIds: [],
      canManage: true,
    };
  }
  return loadAccessManagement(requireDb(), locals.actor!);
};

export const actions: Actions = {
  invite: async ({ locals, request, url }) => {
    if (!isHouseholdManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    if (
      !consumeRateLimit("invitation-create", locals.actor.id, 30, 60 * 60_000)
        .allowed
    ) {
      return fail(429, { error: "Too many invitations. Try again later." });
    }
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const displayName = String(form.get("displayName") ?? "").trim();
    const roleId = String(form.get("roleId") ?? "");
    const requestedScope = String(
      form.get("claimAccessScope") ?? locals.actor.claimAccessScope,
    );
    if (!email || !roleId)
      return fail(400, { error: "Email and role are required." });
    if (requestedScope !== "all" && requestedScope !== "selected") {
      return fail(400, { error: "Choose all claims or selected claims." });
    }
    const requestedClaimIds = [
      ...new Set(form.getAll("claimId").map(String).filter(Boolean)),
    ];
    const result = await createInvitation(
      locals.actor.householdId,
      locals.actor.id,
      {
        email,
        displayName,
        roleId,
        claimAccess: claimAuthority(requestedScope, requestedClaimIds),
      },
    );
    if (!result)
      return fail(400, { error: "The selected role is unavailable." });
    return {
      invitationUrl: new URL(
        `/invite/${result.token}`,
        process.env.ORIGIN ?? url.origin,
      ).toString(),
    };
  },

  toggle: async ({ locals, request }) => {
    if (!isHouseholdManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const disabled = String(form.get("disabled")) === "true";
    if (actorId === locals.actor.id && disabled) {
      return fail(400, { error: "You cannot disable your own account." });
    }
    const result = await setActorDisabled(
      requireDb(),
      locals.actor,
      actorId,
      disabled,
    );
    if (result === "not-found")
      return fail(404, { error: "Account not found." });
    if (result === "forbidden") {
      return fail(403, {
        error: "You cannot manage an account with permissions you do not hold.",
      });
    }
    return { accountUpdated: true };
  },

  permissions: async ({ locals, request }) => {
    if (!isHouseholdManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const requested = form
      .getAll("permission")
      .map(String)
      .filter((permission): permission is (typeof permissions)[number] =>
        permissions.includes(permission as (typeof permissions)[number]),
      );
    const result = await updateServiceAccountPermissions(
      requireDb(),
      locals.actor,
      actorId,
      requested,
    );
    if (result === "not-found")
      return fail(404, { error: "Service account not found." });
    if (result === "forbidden") {
      return fail(403, {
        error: "You cannot manage an account with permissions you do not hold.",
      });
    }
    return { permissionsSaved: true };
  },

  claims: async ({ locals, request }) => {
    if (!isHouseholdManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const scope = String(form.get("claimAccessScope") ?? "");
    if (scope !== "all" && scope !== "selected") {
      return fail(400, { error: "Choose all claims or selected claims." });
    }
    const requestedClaimIds = [
      ...new Set(form.getAll("claimId").map(String).filter(Boolean)),
    ];
    const result = await updateActorClaimAccess(
      requireDb(),
      locals.actor,
      actorId,
      scope,
      requestedClaimIds,
    );
    if (result === "not-found")
      return fail(404, { error: "Account not found." });
    if (result === "invalid-claims") {
      return fail(400, {
        error: "One or more selected claims are unavailable.",
      });
    }
    if (result === "forbidden") {
      return fail(403, {
        error: "You cannot delegate authority beyond your own access.",
      });
    }
    return { claimAccessSaved: true };
  },

  reset: async ({ locals, request, url }) => {
    if (!isHouseholdManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    if (
      !consumeRateLimit(
        "password-reset-create",
        locals.actor.id,
        20,
        60 * 60_000,
      ).allowed
    ) {
      return fail(429, {
        error: "Too many password resets. Try again later.",
      });
    }
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const [target] = await requireDb()
      .select({ userId: actors.userId })
      .from(actors)
      .where(
        and(
          eq(actors.id, actorId),
          eq(actors.householdId, locals.actor.householdId),
          eq(actors.kind, "user"),
        ),
      )
      .limit(1);
    if (!target?.userId) return fail(404, { error: "Person not found." });
    const token = await createPasswordReset(
      target.userId,
      locals.actor.id,
      locals.actor.householdId,
    );
    if (!token) {
      return fail(403, {
        error: "This identity cannot be reset by a household administrator.",
      });
    }
    return {
      resetUrl: new URL(
        `/reset/${token}`,
        process.env.ORIGIN ?? url.origin,
      ).toString(),
    };
  },
};
