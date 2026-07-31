import type { ApiRouteContract } from "./contract";

export const identityRouteContracts = [
  {
    method: "get",
    path: "/v1/me",
    operationId: "getCurrentActor",
    summary: "Inspect the authenticated actor",
    tag: "Identity",
  },
  {
    method: "get",
    path: "/v1/audit",
    operationId: "listAuditEvents",
    summary: "List household audit events",
    tag: "Identity",
    permissions: ["audit:read"],
    query: "AuditQuery",
  },
  {
    method: "delete",
    path: "/v1/service-accounts/{id}",
    operationId: "revokeServiceAccount",
    summary: "Revoke a service account",
    tag: "Identity",
    permissions: ["service_accounts:manage"],
    description:
      "Revokes all active credentials and disables the actor. An administrator cannot revoke an actor with broader authority.",
  },
] satisfies ApiRouteContract[];
