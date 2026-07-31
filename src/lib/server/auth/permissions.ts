export const permissions = [
  "products:read",
  "products:create",
  "products:manage",
  "warranties:read",
  "warranties:create",
  "warranties:manage",
  "warranties:write",
  "claims:read",
  "claims:create",
  "claims:manage",
  "documents:read",
  "documents:attach",
  "documents:manage",
  "images:attach",
  "paperless:discover",
  "notes:read",
  "notes:write",
  "household:manage",
  "integrations:manage",
  "service_accounts:manage",
  "audit:read",
] as const;

export type Permission = (typeof permissions)[number];

export const roleTemplates: Record<
  string,
  { description: string; permissions: Permission[] }
> = {
  owner: {
    description: "Full control of the household and its integrations.",
    permissions: [...permissions],
  },
  member: {
    description: "Manage products, documents, notes, and claims.",
    permissions: [
      "products:read",
      "products:create",
      "products:manage",
      "warranties:read",
      "warranties:create",
      "warranties:manage",
      "claims:read",
      "claims:create",
      "claims:manage",
      "documents:read",
      "documents:attach",
      "documents:manage",
      "images:attach",
      "paperless:discover",
      "notes:read",
      "notes:write",
    ],
  },
  "agent-reader": {
    description:
      "Find coverage and supporting material without changing records.",
    permissions: [
      "products:read",
      "warranties:read",
      "claims:read",
      "documents:read",
      "notes:read",
    ],
  },
  "claim-assistant": {
    description: "Find products and help prepare or manage claims.",
    permissions: [
      "products:read",
      "warranties:read",
      "claims:read",
      "claims:create",
      "claims:manage",
      "documents:read",
      "documents:attach",
      "notes:read",
      "notes:write",
    ],
  },
  "inventory-contributor": {
    description:
      "Add household products and supporting material without changing existing records.",
    permissions: [
      "products:read",
      "products:create",
      "warranties:read",
      "warranties:create",
      "documents:read",
      "documents:attach",
      "images:attach",
      "notes:read",
      "notes:write",
    ],
  },
  "household-agent": {
    description:
      "Manage household products, coverage, documents, notes, and claims without security administration.",
    permissions: [
      "products:read",
      "products:create",
      "products:manage",
      "warranties:read",
      "warranties:create",
      "warranties:manage",
      "claims:read",
      "claims:create",
      "claims:manage",
      "documents:read",
      "documents:attach",
      "documents:manage",
      "images:attach",
      "notes:read",
      "notes:write",
    ],
  },
};

export function can(granted: string[], permission: Permission) {
  return granted.includes(permission);
}
