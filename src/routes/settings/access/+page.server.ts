import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createInvitation, createPasswordReset } from "$lib/server/auth/local";
import {
  canAdministerPermissions,
  canAdministerUserIdentity,
  requirePagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import {
  actorClaimAccess,
  actorRoles,
  actors,
  apiCredentials,
  auditEvents,
  claims,
  roles,
  users,
  webSessions,
} from "$lib/server/db/schema";
import { permissions } from "$lib/server/auth/permissions";

function requireManager(actor: App.Locals["actor"]) {
  return Boolean(
    actor?.permissions.includes("*") ||
    actor?.permissions.includes("household:manage"),
  );
}

async function accountAuthority(
  actorId: string,
  householdId: string,
  kind?: "user" | "service",
) {
  const rows = await requireDb()
    .select({
      userId: actors.userId,
      permissions: roles.permissions,
    })
    .from(actors)
    .leftJoin(actorRoles, eq(actorRoles.actorId, actors.id))
    .leftJoin(
      roles,
      and(eq(actorRoles.roleId, roles.id), eq(roles.householdId, householdId)),
    )
    .where(
      and(
        eq(actors.id, actorId),
        eq(actors.householdId, householdId),
        kind ? eq(actors.kind, kind) : undefined,
      ),
    );
  if (rows.length === 0) return null;
  return {
    userId: rows[0].userId,
    permissions: [...new Set(rows.flatMap((row) => row.permissions ?? []))],
  };
}

export const load: PageServerLoad = async ({ locals }) => {
  requirePagePermission(locals.actor, "household:manage");
  if (process.env.DOMINO_DEMO_MODE === "true") {
    return {
      accounts: [
        {
          id: "demo-owner",
          userId: "demo-user",
          kind: "user",
          name: "Alex Morgan",
          email: "alex@example.test",
          disabled: false,
          roleId: "demo-owner-role",
          roleName: "Owner",
          permissions: ["*"],
          claimAccessScope: "all",
          selectedClaimIds: [],
          canReset: true,
          canToggle: false,
          canEditClaimAccess: true,
          canEditPermissions: false,
        },
        {
          id: "demo-hermes",
          userId: null,
          kind: "service",
          name: "Hermes",
          email: null,
          disabled: false,
          roleId: "demo-agent-role",
          roleName: "Claim assistant",
          permissions: ["warranties:read", "claims:read"],
          claimAccessScope: "selected",
          selectedClaimIds: ["demo-claim-1"],
          canReset: false,
          canToggle: true,
          canEditClaimAccess: true,
          canEditPermissions: true,
        },
      ],
      roles: [{ id: "demo-member", name: "Member" }],
      claims: [
        {
          id: "demo-claim-1",
          reference: "CLM-2026-A1B2C3D4",
          issue: "Dishwasher leaking",
        },
      ],
      grantablePermissions: [...permissions],
      canManage: true,
    };
  }
  const actor = locals.actor!;
  const database = requireDb();
  const [accounts, householdRoles, householdClaims, claimGrants] =
    await Promise.all([
      database
        .select({
          id: actors.id,
          userId: actors.userId,
          kind: actors.kind,
          name: actors.name,
          email: users.email,
          disabled: actors.disabled,
          roleId: roles.id,
          roleName: roles.name,
          permissions: roles.permissions,
          roleSystem: roles.system,
          claimAccessScope: actors.claimAccessScope,
        })
        .from(actors)
        .leftJoin(users, eq(actors.userId, users.id))
        .leftJoin(actorRoles, eq(actorRoles.actorId, actors.id))
        .leftJoin(roles, eq(actorRoles.roleId, roles.id))
        .where(eq(actors.householdId, actor.householdId)),
      database
        .select({
          id: roles.id,
          name: roles.name,
          description: roles.description,
          permissions: roles.permissions,
        })
        .from(roles)
        .where(eq(roles.householdId, actor.householdId)),
      database
        .select({
          id: claims.id,
          reference: claims.reference,
          issue: claims.issue,
        })
        .from(claims)
        .where(
          and(
            eq(claims.householdId, actor.householdId),
            actor.claimIds === undefined
              ? undefined
              : actor.claimIds.length
                ? inArray(claims.id, actor.claimIds)
                : sql`false`,
          ),
        ),
      database
        .select({
          actorId: actorClaimAccess.actorId,
          claimId: actorClaimAccess.claimId,
        })
        .from(actorClaimAccess)
        .innerJoin(
          actors,
          and(
            eq(actorClaimAccess.actorId, actors.id),
            eq(actors.householdId, actor.householdId),
          ),
        )
        .where(
          actor.claimIds === undefined
            ? undefined
            : actor.claimIds.length
              ? inArray(actorClaimAccess.claimId, actor.claimIds)
              : sql`false`,
        ),
    ]);
  const actorPermissionMap = new Map<string, string[]>();
  const actorRoleCount = new Map<string, number>();
  for (const account of accounts) {
    actorPermissionMap.set(account.id, [
      ...new Set([
        ...(actorPermissionMap.get(account.id) ?? []),
        ...(account.permissions ?? []),
      ]),
    ]);
    if (account.roleId) {
      actorRoleCount.set(account.id, (actorRoleCount.get(account.id) ?? 0) + 1);
    }
  }
  const userIds = [
    ...new Set(
      accounts
        .map((account) => account.userId)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  ];
  const identityMemberships =
    userIds.length === 0
      ? []
      : await database
          .select({
            userId: actors.userId,
            householdId: actors.householdId,
            permissions: roles.permissions,
          })
          .from(actors)
          .leftJoin(actorRoles, eq(actorRoles.actorId, actors.id))
          .leftJoin(roles, eq(actorRoles.roleId, roles.id))
          .where(inArray(actors.userId, userIds));
  const identityAuthority = new Map<
    string,
    { households: Set<string>; permissions: string[] }
  >();
  for (const membership of identityMemberships) {
    if (!membership.userId) continue;
    const authority = identityAuthority.get(membership.userId) ?? {
      households: new Set<string>(),
      permissions: [],
    };
    authority.households.add(membership.householdId);
    authority.permissions = [
      ...new Set([...authority.permissions, ...(membership.permissions ?? [])]),
    ];
    identityAuthority.set(membership.userId, authority);
  }
  return {
    accounts: accounts.map((account) => {
      const targetPermissions = actorPermissionMap.get(account.id) ?? [];
      const canAdminister = canAdministerPermissions(
        actor.permissions,
        targetPermissions,
      );
      const identity = account.userId
        ? identityAuthority.get(account.userId)
        : undefined;
      const resetWithinAuthority =
        account.kind === "user" &&
        Boolean(identity) &&
        canAdministerUserIdentity(
          actor.permissions,
          actor.householdId,
          identity
            ? [...identity.households].map((householdId) => ({
                householdId,
                permissions: identity.permissions,
              }))
            : [],
        );
      return {
        ...account,
        selectedClaimIds: claimGrants
          .filter((grant) => grant.actorId === account.id)
          .map((grant) => grant.claimId),
        canReset: resetWithinAuthority,
        canToggle: account.id !== actor.id && canAdminister,
        canEditClaimAccess:
          canAdminister && locals.actor!.claimIds === undefined,
        canEditPermissions:
          account.kind === "service" &&
          account.roleSystem === false &&
          actorRoleCount.get(account.id) === 1 &&
          canAdminister,
      };
    }),
    roles: householdRoles.filter((role) =>
      canAdministerPermissions(actor.permissions, role.permissions),
    ),
    claims: householdClaims,
    grantablePermissions: permissions.filter(
      (permission) =>
        actor.permissions.includes("*") ||
        actor.permissions.includes(permission),
    ),
    canManage: requireManager(locals.actor),
  };
};

export const actions: Actions = {
  invite: async ({ locals, request, url }) => {
    if (!locals.actor || !requireManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const displayName = String(form.get("displayName") ?? "").trim();
    const roleId = String(form.get("roleId") ?? "");
    if (!email || !roleId)
      return fail(400, { error: "Email and role are required." });
    const [selectedRole] = await requireDb()
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(
        and(
          eq(roles.id, roleId),
          eq(roles.householdId, locals.actor.householdId),
        ),
      )
      .limit(1);
    if (!selectedRole)
      return fail(400, { error: "The selected role is unavailable." });
    if (
      !canAdministerPermissions(
        locals.actor.permissions,
        selectedRole.permissions,
      )
    ) {
      return fail(403, {
        error: "You cannot assign a role with permissions you do not hold.",
      });
    }
    const result = await createInvitation(
      locals.actor.householdId,
      locals.actor.id,
      {
        email,
        displayName,
        roleId,
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
    if (!locals.actor || !requireManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const disabled = String(form.get("disabled")) === "true";
    if (actorId === locals.actor.id && disabled) {
      return fail(400, { error: "You cannot disable your own account." });
    }
    const updated = await requireDb().transaction(async (tx) => {
      const managerRoles = await tx
        .select({ permissions: roles.permissions })
        .from(actors)
        .innerJoin(actorRoles, eq(actorRoles.actorId, actors.id))
        .innerJoin(roles, eq(actorRoles.roleId, roles.id))
        .where(
          and(
            eq(actors.id, locals.actor!.id),
            eq(actors.householdId, locals.actor!.householdId),
            eq(actors.disabled, false),
            eq(roles.householdId, locals.actor!.householdId),
          ),
        );
      const managerPermissions = [
        ...new Set(managerRoles.flatMap((role) => role.permissions)),
      ];
      if (
        !managerPermissions.includes("*") &&
        !managerPermissions.includes("household:manage")
      ) {
        return "forbidden" as const;
      }
      const [account] = await tx
        .select({ id: actors.id, name: actors.name })
        .from(actors)
        .where(
          and(
            eq(actors.id, actorId),
            eq(actors.householdId, locals.actor!.householdId),
          ),
        )
        .for("update")
        .limit(1);
      if (!account) return null;
      const targetRoles = await tx
        .select({ permissions: roles.permissions })
        .from(actorRoles)
        .innerJoin(roles, eq(actorRoles.roleId, roles.id))
        .where(
          and(
            eq(actorRoles.actorId, account.id),
            eq(roles.householdId, locals.actor!.householdId),
          ),
        )
        .for("update");
      const targetPermissions = [
        ...new Set(targetRoles.flatMap((role) => role.permissions)),
      ];
      if (!canAdministerPermissions(managerPermissions, targetPermissions)) {
        return "forbidden" as const;
      }
      await tx
        .update(actors)
        .set({ disabled, updatedAt: new Date() })
        .where(eq(actors.id, account.id));
      if (disabled) {
        const revokedAt = new Date();
        await tx
          .update(webSessions)
          .set({ revokedAt })
          .where(eq(webSessions.actorId, account.id));
        await tx
          .update(apiCredentials)
          .set({ revokedAt, updatedAt: revokedAt })
          .where(eq(apiCredentials.actorId, account.id));
      }
      await tx.insert(auditEvents).values({
        householdId: locals.actor!.householdId,
        actorId: locals.actor!.id,
        action: disabled ? "account.disable" : "account.enable",
        resourceType: "actor",
        resourceId: account.id,
        summary: `${disabled ? "Disabled" : "Enabled"} ${account.name}`,
      });
      return account;
    });
    if (updated === "forbidden") {
      return fail(403, {
        error: "You cannot manage an account with permissions you do not hold.",
      });
    }
    return updated
      ? { accountUpdated: true }
      : fail(404, { error: "Account not found." });
  },
  permissions: async ({ locals, request }) => {
    if (!locals.actor || !requireManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const requested = form
      .getAll("permission")
      .map(String)
      .filter((permission): permission is (typeof permissions)[number] =>
        permissions.includes(permission as (typeof permissions)[number]),
      );
    if (
      !locals.actor.permissions.includes("*") &&
      requested.some(
        (permission) => !locals.actor!.permissions.includes(permission),
      )
    ) {
      return fail(403, {
        error: "You cannot grant permissions you do not hold.",
      });
    }
    const result = await requireDb().transaction(async (tx) => {
      const managerRoles = await tx
        .select({ permissions: roles.permissions })
        .from(actors)
        .innerJoin(actorRoles, eq(actorRoles.actorId, actors.id))
        .innerJoin(roles, eq(actorRoles.roleId, roles.id))
        .where(
          and(
            eq(actors.id, locals.actor!.id),
            eq(actors.householdId, locals.actor!.householdId),
            eq(actors.disabled, false),
            eq(roles.householdId, locals.actor!.householdId),
          ),
        );
      const managerPermissions = [
        ...new Set(managerRoles.flatMap((role) => role.permissions)),
      ];
      if (
        !managerPermissions.includes("*") &&
        !managerPermissions.includes("household:manage")
      ) {
        return "forbidden" as const;
      }
      if (!canAdministerPermissions(managerPermissions, requested)) {
        return "forbidden" as const;
      }
      const targetRoles = await tx
        .select({
          roleId: roles.id,
          permissions: roles.permissions,
          system: roles.system,
        })
        .from(actors)
        .innerJoin(actorRoles, eq(actorRoles.actorId, actors.id))
        .innerJoin(roles, eq(actorRoles.roleId, roles.id))
        .where(
          and(
            eq(actors.id, actorId),
            eq(actors.kind, "service"),
            eq(actors.householdId, locals.actor!.householdId),
            eq(roles.householdId, locals.actor!.householdId),
          ),
        )
        .for("update");
      if (targetRoles.length !== 1 || targetRoles[0].system)
        return "not-found" as const;
      const target = targetRoles[0];
      const currentPermissions = [
        ...new Set(targetRoles.flatMap((role) => role.permissions)),
      ];
      if (!canAdministerPermissions(managerPermissions, currentPermissions)) {
        return "forbidden" as const;
      }
      await tx
        .update(roles)
        .set({ permissions: requested, updatedAt: new Date() })
        .where(eq(roles.id, target.roleId));
      await tx.insert(auditEvents).values({
        householdId: locals.actor!.householdId,
        actorId: locals.actor!.id,
        action: "service_account.permissions.update",
        resourceType: "actor",
        resourceId: actorId,
        summary: "Updated service-account permissions",
        metadata: { permissions: requested },
      });
      return "updated" as const;
    });
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
    if (!locals.actor || !requireManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    if (locals.actor.claimIds !== undefined) {
      return fail(403, {
        error:
          "Only an administrator with access to all claims can change claim access.",
      });
    }
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const scope = String(form.get("claimAccessScope") ?? "");
    if (scope !== "all" && scope !== "selected") {
      return fail(400, { error: "Choose all claims or selected claims." });
    }
    const requestedClaimIds = [
      ...new Set(form.getAll("claimId").map(String).filter(Boolean)),
    ];
    const target = await accountAuthority(actorId, locals.actor.householdId);
    if (!target) return fail(404, { error: "Account not found." });
    if (
      !canAdministerPermissions(locals.actor.permissions, target.permissions)
    ) {
      return fail(403, {
        error: "You cannot manage an account with permissions you do not hold.",
      });
    }
    const database = requireDb();
    if (scope === "selected" && requestedClaimIds.length) {
      const validClaims = await database
        .select({ id: claims.id })
        .from(claims)
        .where(
          and(
            eq(claims.householdId, locals.actor.householdId),
            inArray(claims.id, requestedClaimIds),
          ),
        );
      if (validClaims.length !== requestedClaimIds.length) {
        return fail(400, {
          error: "One or more selected claims are unavailable.",
        });
      }
    }
    await database.transaction(async (tx) => {
      await tx
        .update(actors)
        .set({
          claimAccessScope: scope,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(actors.id, actorId),
            eq(actors.householdId, locals.actor!.householdId),
          ),
        );
      await tx
        .delete(actorClaimAccess)
        .where(eq(actorClaimAccess.actorId, actorId));
      if (scope === "selected" && requestedClaimIds.length) {
        await tx.insert(actorClaimAccess).values(
          requestedClaimIds.map((claimId) => ({
            actorId,
            claimId,
            grantedByActorId: locals.actor!.id,
          })),
        );
      }
      await tx.insert(auditEvents).values({
        householdId: locals.actor!.householdId,
        actorId: locals.actor!.id,
        action: "account.claim_access.update",
        resourceType: "actor",
        resourceId: actorId,
        summary:
          scope === "all"
            ? "Granted access to all claims"
            : `Limited claim access to ${requestedClaimIds.length} selected claim${requestedClaimIds.length === 1 ? "" : "s"}`,
        metadata: {
          scope,
          claimIds: scope === "selected" ? requestedClaimIds : [],
        },
      });
    });
    return { claimAccessSaved: true };
  },
  reset: async ({ locals, request, url }) => {
    if (!locals.actor || !requireManager(locals.actor))
      return fail(403, { error: "Not authorized." });
    const form = await request.formData();
    const actorId = String(form.get("actorId") ?? "");
    const target = await accountAuthority(
      actorId,
      locals.actor.householdId,
      "user",
    );
    if (!target?.userId) return fail(404, { error: "Person not found." });
    if (
      !canAdministerPermissions(locals.actor.permissions, target.permissions)
    ) {
      return fail(403, {
        error: "You cannot reset an account with permissions you do not hold.",
      });
    }
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
