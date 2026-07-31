import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import type { requireDb } from "../db";
import { actorClaimAccess, actorRoles, actors, roles } from "../db/schema";
import type { Permission } from "./permissions";

export type ClaimAuthority =
  | { claimAccessScope: "all"; claimIds: undefined }
  | { claimAccessScope: "selected"; claimIds: string[] };

export type ActorAuthority = ClaimAuthority & {
  permissions: readonly string[];
};

type AuthorityDatabase = Pick<ReturnType<typeof requireDb>, "select">;

export type LoadedActorAuthority = ActorAuthority & {
  id: string;
  userId: string | null;
  kind: "user" | "service";
  name: string;
};

export function claimAuthority(
  scope: "all" | "selected",
  claimIds: readonly string[] = [],
): ClaimAuthority {
  return scope === "all"
    ? { claimAccessScope: "all", claimIds: undefined }
    : { claimAccessScope: "selected", claimIds: [...new Set(claimIds)] };
}

/**
 * Load one actor's complete authority using the supplied database executor.
 * Authority-changing callers pass their active transaction so the actor, role,
 * and claim-grant rows are locked and checked in the same transaction as the
 * mutation.
 */
export async function loadActorAuthority(
  database: AuthorityDatabase,
  actorId: string,
  householdId: string,
  options: {
    kind?: "user" | "service";
    lock?: boolean;
    includeDisabled?: boolean;
  } = {},
): Promise<LoadedActorAuthority | null> {
  const actorQuery = database
    .select({
      id: actors.id,
      userId: actors.userId,
      kind: actors.kind,
      name: actors.name,
      claimAccessScope: actors.claimAccessScope,
    })
    .from(actors)
    .where(
      and(
        eq(actors.id, actorId),
        eq(actors.householdId, householdId),
        options.includeDisabled ? undefined : eq(actors.disabled, false),
        options.kind ? eq(actors.kind, options.kind) : undefined,
      ),
    )
    .limit(1);
  const [actor] = options.lock
    ? await actorQuery.for("update", { of: actors })
    : await actorQuery;
  if (!actor) return null;

  const roleQuery = database
    .select({ permissions: roles.permissions })
    .from(actorRoles)
    .innerJoin(roles, eq(actorRoles.roleId, roles.id))
    .where(
      and(eq(actorRoles.actorId, actor.id), eq(roles.householdId, householdId)),
    );
  const roleRows = options.lock
    ? await roleQuery.for("update", { of: roles })
    : await roleQuery;
  let claimIds: string[] = [];
  if (actor.claimAccessScope === "selected") {
    const claimQuery = database
      .select({ claimId: actorClaimAccess.claimId })
      .from(actorClaimAccess)
      .where(eq(actorClaimAccess.actorId, actor.id));
    const grants = options.lock
      ? await claimQuery.for("update", { of: actorClaimAccess })
      : await claimQuery;
    claimIds = grants.map((grant) => grant.claimId);
  }

  return {
    id: actor.id,
    userId: actor.userId,
    kind: actor.kind,
    name: actor.name,
    permissions: [...new Set(roleRows.flatMap((row) => row.permissions ?? []))],
    ...claimAuthority(actor.claimAccessScope, claimIds),
  };
}

export function hasPermission(
  actor: { permissions: readonly string[] } | null | undefined,
  permission: Permission,
) {
  return Boolean(
    actor?.permissions.includes("*") || actor?.permissions.includes(permission),
  );
}

export function relatedReadAccess(
  actor:
    ({ permissions: readonly string[] } & ClaimAuthority) | null | undefined,
) {
  return {
    claims: hasPermission(actor, "claims:read"),
    claimIds: actor?.claimIds,
    documents: hasPermission(actor, "documents:read"),
    notes: hasPermission(actor, "notes:read"),
  };
}

export function canAdministerPermissions(
  administrator: readonly string[],
  target: readonly string[],
) {
  return (
    administrator.includes("*") ||
    target.every((permission) => administrator.includes(permission))
  );
}

export function canAdministerClaimScope(
  administrator: ClaimAuthority,
  target: ClaimAuthority,
) {
  if (administrator.claimAccessScope === "all") return true;
  if (target.claimAccessScope === "all") return false;
  const administratorClaimIds = administrator.claimIds ?? [];
  return (target.claimIds ?? []).every((claimId) =>
    administratorClaimIds.includes(claimId),
  );
}

export function canAdministerActorAuthority(
  administrator: ActorAuthority,
  target: ActorAuthority,
) {
  return (
    canAdministerPermissions(administrator.permissions, target.permissions) &&
    canAdministerClaimScope(administrator, target)
  );
}

export function canAdministerUserIdentity(
  administrator: ActorAuthority,
  householdId: string,
  memberships: ReadonlyArray<
    {
      householdId: string;
      permissions: readonly string[];
    } & ClaimAuthority
  >,
) {
  return (
    memberships.length > 0 &&
    memberships.every((membership) => membership.householdId === householdId) &&
    memberships.every((membership) =>
      canAdministerActorAuthority(administrator, membership),
    )
  );
}

export function requirePagePermission(
  actor: App.Locals["actor"],
  permission: Permission,
) {
  if (!hasPermission(actor, permission)) {
    throw error(403, `Missing permission: ${permission}`);
  }
}

export function requireAnyPagePermission(
  actor: App.Locals["actor"],
  required: Permission[],
) {
  if (!required.some((permission) => hasPermission(actor, permission))) {
    throw error(403, "You do not have permission to view this page.");
  }
}
