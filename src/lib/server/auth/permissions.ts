export const permissions = [
  "warranties:read",
  "warranties:write",
  "claims:read",
  "claims:create",
  "claims:manage",
  "documents:read",
  "documents:attach",
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
      "warranties:read",
      "warranties:write",
      "claims:read",
      "claims:create",
      "claims:manage",
      "documents:read",
      "documents:attach",
      "notes:read",
      "notes:write",
    ],
  },
  "agent-reader": {
    description:
      "Find coverage and supporting material without changing records.",
    permissions: [
      "warranties:read",
      "claims:read",
      "documents:read",
      "notes:read",
    ],
  },
  "claim-assistant": {
    description: "Find products and help prepare or manage claims.",
    permissions: [
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
};

export function can(granted: string[], permission: Permission) {
  return granted.includes(permission);
}
