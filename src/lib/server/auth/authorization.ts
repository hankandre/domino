import { error } from "@sveltejs/kit";
import type { Permission } from "./permissions";

export function hasPermission(
  actor: { permissions: string[] } | null | undefined,
  permission: Permission,
) {
  return Boolean(
    actor?.permissions.includes("*") || actor?.permissions.includes(permission),
  );
}

export function relatedReadAccess(
  actor: { permissions: string[] } | null | undefined,
) {
  return {
    claims: hasPermission(actor, "claims:read"),
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

export function canAdministerUserIdentity(
  administrator: readonly string[],
  householdId: string,
  memberships: ReadonlyArray<{
    householdId: string;
    permissions: readonly string[];
  }>,
) {
  return (
    memberships.length > 0 &&
    memberships.every((membership) => membership.householdId === householdId) &&
    canAdministerPermissions(
      administrator,
      memberships.flatMap((membership) => membership.permissions),
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
