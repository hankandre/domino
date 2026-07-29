import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { and, eq } from "drizzle-orm";
import { createInvitation, createPasswordReset } from "$lib/server/auth/local";
import {
  canAdministerPermissions,
  requirePagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import {
  actorRoles,
  actors,
  apiCredentials,
  auditEvents,
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
        },
      ],
      roles: [{ id: "demo-member", name: "Member" }],
      canManage: true,
    };
  }
  const actor = locals.actor!;
  const database = requireDb();
  const [accounts, householdRoles] = await Promise.all([
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
  ]);
  return {
    accounts,
    roles: householdRoles.filter((role) =>
      canAdministerPermissions(actor.permissions, role.permissions),
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
    const targetAuthority = await accountAuthority(
      actorId,
      locals.actor.householdId,
    );
    if (!targetAuthority) return fail(404, { error: "Account not found." });
    if (
      !canAdministerPermissions(
        locals.actor.permissions,
        targetAuthority.permissions,
      )
    ) {
      return fail(403, {
        error: "You cannot manage an account with permissions you do not hold.",
      });
    }
    const updated = await requireDb().transaction(async (tx) => {
      const [account] = await tx
        .update(actors)
        .set({ disabled, updatedAt: new Date() })
        .where(
          and(
            eq(actors.id, actorId),
            eq(actors.householdId, locals.actor!.householdId),
          ),
        )
        .returning({ id: actors.id, name: actors.name });
      if (!account) return null;
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
    const [target] = await requireDb()
      .select({ roleId: roles.id })
      .from(actors)
      .innerJoin(actorRoles, eq(actorRoles.actorId, actors.id))
      .innerJoin(roles, eq(actorRoles.roleId, roles.id))
      .where(
        and(
          eq(actors.id, actorId),
          eq(actors.kind, "service"),
          eq(actors.householdId, locals.actor.householdId),
          eq(roles.householdId, locals.actor.householdId),
          eq(roles.system, false),
        ),
      )
      .limit(1);
    if (!target) return fail(404, { error: "Service account not found." });
    await requireDb().transaction(async (tx) => {
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
    });
    return { permissionsSaved: true };
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
    const token = await createPasswordReset(target.userId, locals.actor.id);
    return {
      resetUrl: new URL(
        `/reset/${token}`,
        process.env.ORIGIN ?? url.origin,
      ).toString(),
    };
  },
};
