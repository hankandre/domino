export { permissions, roleTemplates } from "./role-catalog.mjs";
import { permissions, roleTemplates } from "./role-catalog.mjs";

export type Permission = (typeof permissions)[number];

export const serviceAccountPermissions = permissions.filter(
  (permission) =>
    ![
      "warranties:write",
      "household:manage",
      "integrations:manage",
      "service_accounts:manage",
      "audit:read",
    ].includes(permission),
);

export const agentPermissionPresets = [
  {
    id: "reader",
    label: "Read only",
    description: "Look up products, coverage, documents, and claim details.",
    permissions: roleTemplates["agent-reader"].permissions,
  },
  {
    id: "inventory",
    label: "Inventory intake",
    description: "Add products and supporting records without editing them.",
    permissions: roleTemplates["inventory-contributor"].permissions,
  },
  {
    id: "claims",
    label: "Claim helper",
    description: "Prepare claims, attach evidence, and manage claim progress.",
    permissions: roleTemplates["claim-assistant"].permissions,
  },
  {
    id: "household",
    label: "Household agent",
    description: "Manage inventory and claims without administering security.",
    permissions: roleTemplates["household-agent"].permissions,
  },
] as const;

export function can(granted: readonly string[], permission: Permission) {
  return granted.includes(permission);
}
