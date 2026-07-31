import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  canAdministerActorAuthority,
  canAdministerPermissions,
  canAdministerUserIdentity,
  claimAuthority,
  loadActorAuthority,
  type ClaimAuthority,
} from "./authorization";
import { agentPermissionPresets, permissions } from "./permissions";
import * as schema from "../db/schema";

type Database = NodePgDatabase<typeof schema>;
type ManagerActor = NonNullable<App.Locals["actor"]>;

function hasHouseholdManagement(actor: { permissions: readonly string[] }) {
  return (
    actor.permissions.includes("*") ||
    actor.permissions.includes("household:manage")
  );
}

export function isHouseholdManager(
  actor: App.Locals["actor"],
): actor is ManagerActor {
  return Boolean(actor && hasHouseholdManagement(actor));
}

export async function loadAccessManagement(
  database: Database,
  actor: ManagerActor,
) {
  const [accounts, householdRoles, householdClaims, claimGrants] =
    await Promise.all([
      database
        .select({
          id: schema.actors.id,
          userId: schema.actors.userId,
          kind: schema.actors.kind,
          name: schema.actors.name,
          email: schema.users.email,
          disabled: schema.actors.disabled,
          roleId: schema.roles.id,
          roleName: schema.roles.name,
          permissions: schema.roles.permissions,
          roleSystem: schema.roles.system,
          claimAccessScope: schema.actors.claimAccessScope,
        })
        .from(schema.actors)
        .leftJoin(schema.users, eq(schema.actors.userId, schema.users.id))
        .leftJoin(
          schema.actorRoles,
          eq(schema.actorRoles.actorId, schema.actors.id),
        )
        .leftJoin(schema.roles, eq(schema.actorRoles.roleId, schema.roles.id))
        .where(eq(schema.actors.householdId, actor.householdId)),
      database
        .select({
          id: schema.roles.id,
          name: schema.roles.name,
          description: schema.roles.description,
          permissions: schema.roles.permissions,
          system: schema.roles.system,
        })
        .from(schema.roles)
        .where(eq(schema.roles.householdId, actor.householdId)),
      database
        .select({
          id: schema.claims.id,
          reference: schema.claims.reference,
          issue: schema.claims.issue,
          status: schema.claims.status,
          productName: schema.products.name,
        })
        .from(schema.claims)
        .innerJoin(
          schema.products,
          eq(schema.claims.productId, schema.products.id),
        )
        .where(
          and(
            eq(schema.claims.householdId, actor.householdId),
            actor.claimIds === undefined
              ? undefined
              : actor.claimIds.length
                ? inArray(schema.claims.id, actor.claimIds)
                : sql`false`,
          ),
        ),
      database
        .select({
          actorId: schema.actorClaimAccess.actorId,
          claimId: schema.actorClaimAccess.claimId,
        })
        .from(schema.actorClaimAccess)
        .innerJoin(
          schema.actors,
          and(
            eq(schema.actorClaimAccess.actorId, schema.actors.id),
            eq(schema.actors.householdId, actor.householdId),
          ),
        ),
    ]);
  const actorPermissionMap = new Map<string, string[]>();
  const actorRoleCount = new Map<string, number>();
  const roleAssigneeCount = new Map<string, number>();
  for (const account of accounts) {
    actorPermissionMap.set(account.id, [
      ...new Set([
        ...(actorPermissionMap.get(account.id) ?? []),
        ...(account.permissions ?? []),
      ]),
    ]);
    if (account.roleId) {
      actorRoleCount.set(account.id, (actorRoleCount.get(account.id) ?? 0) + 1);
      roleAssigneeCount.set(
        account.roleId,
        (roleAssigneeCount.get(account.roleId) ?? 0) + 1,
      );
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
            actorId: schema.actors.id,
            userId: schema.actors.userId,
            householdId: schema.actors.householdId,
            permissions: schema.roles.permissions,
            claimAccessScope: schema.actors.claimAccessScope,
          })
          .from(schema.actors)
          .leftJoin(
            schema.actorRoles,
            eq(schema.actorRoles.actorId, schema.actors.id),
          )
          .leftJoin(schema.roles, eq(schema.actorRoles.roleId, schema.roles.id))
          .where(inArray(schema.actors.userId, userIds));
  const identityActorIds = [
    ...new Set(identityMemberships.map((membership) => membership.actorId)),
  ];
  const identityClaimGrants = identityActorIds.length
    ? await database
        .select({
          actorId: schema.actorClaimAccess.actorId,
          claimId: schema.actorClaimAccess.claimId,
        })
        .from(schema.actorClaimAccess)
        .where(inArray(schema.actorClaimAccess.actorId, identityActorIds))
    : [];
  const identityAuthority = new Map<
    string,
    Map<
      string,
      {
        householdId: string;
        permissions: string[];
      } & ClaimAuthority
    >
  >();
  const grantsByActor = new Map<string, string[]>();
  for (const grant of identityClaimGrants) {
    const grants = grantsByActor.get(grant.actorId);
    if (grants) grants.push(grant.claimId);
    else grantsByActor.set(grant.actorId, [grant.claimId]);
  }
  for (const membership of identityMemberships) {
    if (!membership.userId) continue;
    const memberships = identityAuthority.get(membership.userId) ?? new Map();
    const authority = memberships.get(membership.actorId) ?? {
      householdId: membership.householdId,
      permissions: [],
      ...claimAuthority(
        membership.claimAccessScope,
        grantsByActor.get(membership.actorId) ?? [],
      ),
    };
    authority.permissions = [
      ...new Set([...authority.permissions, ...(membership.permissions ?? [])]),
    ];
    memberships.set(membership.actorId, authority);
    identityAuthority.set(membership.userId, memberships);
  }
  const grantsByTarget = new Map<string, string[]>();
  for (const grant of claimGrants) {
    const grants = grantsByTarget.get(grant.actorId);
    if (grants) grants.push(grant.claimId);
    else grantsByTarget.set(grant.actorId, [grant.claimId]);
  }
  const administratorAuthority = {
    permissions: actor.permissions,
    ...claimAuthority(actor.claimAccessScope, actor.claimIds),
  };
  return {
    accounts: accounts.map((account) => {
      const targetPermissions = actorPermissionMap.get(account.id) ?? [];
      const targetClaimIds = grantsByTarget.get(account.id) ?? [];
      const canAdminister = canAdministerActorAuthority(
        administratorAuthority,
        {
          permissions: targetPermissions,
          ...claimAuthority(account.claimAccessScope, targetClaimIds),
        },
      );
      const identity = account.userId
        ? identityAuthority.get(account.userId)
        : undefined;
      const resetWithinAuthority =
        account.kind === "user" &&
        Boolean(identity) &&
        canAdministerUserIdentity(
          administratorAuthority,
          actor.householdId,
          identity ? [...identity.values()] : [],
        );
      return {
        ...account,
        permissions: targetPermissions,
        selectedClaimIds:
          actor.claimIds === undefined
            ? targetClaimIds
            : targetClaimIds.filter((claimId) =>
                actor.claimIds!.includes(claimId),
              ),
        canReset: resetWithinAuthority,
        canToggle: account.id !== actor.id && canAdminister,
        canEditClaimAccess: canAdminister,
        canEditPermissions:
          account.kind === "service" &&
          account.roleSystem === false &&
          actorRoleCount.get(account.id) === 1 &&
          Boolean(account.roleId) &&
          roleAssigneeCount.get(account.roleId!) === 1 &&
          canAdminister,
      };
    }),
    roles: householdRoles.filter(
      (role) =>
        role.system &&
        canAdministerPermissions(actor.permissions, role.permissions),
    ),
    claims: householdClaims,
    grantablePermissions: permissions.filter(
      (permission) =>
        actor.permissions.includes("*") ||
        actor.permissions.includes(permission),
    ),
    permissionPresets: agentPermissionPresets.filter((preset) =>
      preset.permissions.every(
        (permission) =>
          actor.permissions.includes("*") ||
          actor.permissions.includes(permission),
      ),
    ),
    canGrantAllClaims: actor.claimAccessScope === "all",
    defaultInvitationClaimScope: actor.claimAccessScope,
    defaultInvitationClaimIds: actor.claimIds ?? [],
    canManage: true,
  };
}

export type AccessMutationResult =
  "updated" | "not-found" | "invalid-claims" | "forbidden";

export async function setActorDisabled(
  database: Database,
  managerActor: ManagerActor,
  actorId: string,
  disabled: boolean,
): Promise<AccessMutationResult> {
  return database.transaction(async (tx) => {
    const manager = await loadActorAuthority(
      tx,
      managerActor.id,
      managerActor.householdId,
      { lock: true },
    );
    if (!manager || !hasHouseholdManagement(manager)) return "forbidden";
    const account = await loadActorAuthority(
      tx,
      actorId,
      managerActor.householdId,
      { lock: true, includeDisabled: true },
    );
    if (!account) return "not-found";
    if (!canAdministerActorAuthority(manager, account)) return "forbidden";
    await tx
      .update(schema.actors)
      .set({ disabled, updatedAt: new Date() })
      .where(eq(schema.actors.id, account.id));
    if (disabled) {
      const revokedAt = new Date();
      await tx
        .update(schema.webSessions)
        .set({ revokedAt })
        .where(eq(schema.webSessions.actorId, account.id));
      await tx
        .update(schema.apiCredentials)
        .set({ revokedAt, updatedAt: revokedAt })
        .where(eq(schema.apiCredentials.actorId, account.id));
      await tx
        .update(schema.userInvitations)
        .set({ revokedAt })
        .where(
          and(
            eq(schema.userInvitations.invitedByActorId, account.id),
            sql`${schema.userInvitations.acceptedAt} is null`,
            sql`${schema.userInvitations.revokedAt} is null`,
          ),
        );
      await tx
        .update(schema.passwordResetTokens)
        .set({ consumedAt: revokedAt })
        .where(
          and(
            eq(schema.passwordResetTokens.createdByActorId, account.id),
            sql`${schema.passwordResetTokens.consumedAt} is null`,
          ),
        );
    }
    await tx.insert(schema.auditEvents).values({
      householdId: managerActor.householdId,
      actorId: managerActor.id,
      action: disabled ? "account.disable" : "account.enable",
      resourceType: "actor",
      resourceId: account.id,
      summary: `${disabled ? "Disabled" : "Enabled"} ${account.name}`,
    });
    return "updated";
  });
}

export async function updateServiceAccountPermissions(
  database: Database,
  managerActor: ManagerActor,
  actorId: string,
  requested: readonly (typeof permissions)[number][],
): Promise<AccessMutationResult> {
  return database.transaction(async (tx) => {
    const manager = await loadActorAuthority(
      tx,
      managerActor.id,
      managerActor.householdId,
      { lock: true },
    );
    if (!manager || !hasHouseholdManagement(manager)) return "forbidden";
    if (!canAdministerPermissions(manager.permissions, requested))
      return "forbidden";
    const targetAuthority = await loadActorAuthority(
      tx,
      actorId,
      managerActor.householdId,
      { kind: "service", lock: true },
    );
    if (!targetAuthority) return "not-found";
    const targetRoles = await tx
      .select({ roleId: schema.roles.id, system: schema.roles.system })
      .from(schema.actorRoles)
      .innerJoin(schema.roles, eq(schema.actorRoles.roleId, schema.roles.id))
      .where(
        and(
          eq(schema.actorRoles.actorId, actorId),
          eq(schema.roles.householdId, managerActor.householdId),
        ),
      )
      .for("update", { of: schema.roles });
    if (targetRoles.length !== 1 || targetRoles[0].system) return "not-found";
    const target = targetRoles[0];
    const roleAssignments = await tx
      .select({ actorId: schema.actorRoles.actorId })
      .from(schema.actorRoles)
      .where(eq(schema.actorRoles.roleId, target.roleId));
    if (
      roleAssignments.length !== 1 ||
      roleAssignments[0].actorId !== actorId
    ) {
      return "not-found";
    }
    const [pendingInvitation] = await tx
      .select({ id: schema.userInvitations.id })
      .from(schema.userInvitations)
      .where(
        and(
          eq(schema.userInvitations.roleId, target.roleId),
          sql`${schema.userInvitations.acceptedAt} is null`,
          sql`${schema.userInvitations.revokedAt} is null`,
        ),
      )
      .limit(1);
    if (pendingInvitation) return "not-found";
    if (
      !canAdministerActorAuthority(manager, targetAuthority) ||
      !canAdministerActorAuthority(manager, {
        permissions: requested,
        ...claimAuthority(
          targetAuthority.claimAccessScope,
          targetAuthority.claimIds,
        ),
      })
    ) {
      return "forbidden";
    }
    await tx
      .update(schema.roles)
      .set({ permissions: [...requested], updatedAt: new Date() })
      .where(eq(schema.roles.id, target.roleId));
    await tx.insert(schema.auditEvents).values({
      householdId: managerActor.householdId,
      actorId: managerActor.id,
      action: "service_account.permissions.update",
      resourceType: "actor",
      resourceId: actorId,
      summary: "Updated service-account permissions",
      metadata: { permissions: requested },
    });
    return "updated";
  });
}

export async function updateActorClaimAccess(
  database: Database,
  managerActor: ManagerActor,
  actorId: string,
  scope: "all" | "selected",
  requestedClaimIds: readonly string[],
): Promise<AccessMutationResult> {
  return database.transaction(async (tx) => {
    const manager = await loadActorAuthority(
      tx,
      managerActor.id,
      managerActor.householdId,
      { lock: true },
    );
    if (!manager || !hasHouseholdManagement(manager)) return "forbidden";
    const target = await loadActorAuthority(
      tx,
      actorId,
      managerActor.householdId,
      { lock: true, includeDisabled: true },
    );
    if (!target) return "not-found";
    const requestedAuthority = {
      permissions: target.permissions,
      ...claimAuthority(scope, requestedClaimIds),
    };
    if (
      !canAdministerActorAuthority(manager, target) ||
      !canAdministerActorAuthority(manager, requestedAuthority)
    ) {
      return "forbidden";
    }
    if (scope === "selected" && requestedClaimIds.length) {
      const validClaims = await tx
        .select({ id: schema.claims.id })
        .from(schema.claims)
        .where(
          and(
            eq(schema.claims.householdId, managerActor.householdId),
            inArray(schema.claims.id, requestedClaimIds),
          ),
        )
        .for("share");
      if (validClaims.length !== requestedClaimIds.length)
        return "invalid-claims";
    }
    await tx
      .update(schema.actors)
      .set({ claimAccessScope: scope, updatedAt: new Date() })
      .where(
        and(
          eq(schema.actors.id, actorId),
          eq(schema.actors.householdId, managerActor.householdId),
        ),
      );
    await tx
      .delete(schema.actorClaimAccess)
      .where(eq(schema.actorClaimAccess.actorId, actorId));
    if (scope === "selected" && requestedClaimIds.length) {
      await tx.insert(schema.actorClaimAccess).values(
        requestedClaimIds.map((claimId) => ({
          actorId,
          claimId,
          grantedByActorId: managerActor.id,
        })),
      );
    }
    await tx.insert(schema.auditEvents).values({
      householdId: managerActor.householdId,
      actorId: managerActor.id,
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
    return "updated";
  });
}
