import type { ApiRouteContract } from "./contract";

export const recordRouteContracts = [
  {
    method: "post",
    path: "/v1/product-records/validate",
    operationId: "validateProductRecord",
    summary: "Validate an agent product record",
    tag: "Product records",
    permissions: ["products:create OR warranties:write"],
    request: { schema: "ProductRecordInput" },
    description:
      "Checks component permissions and exact or fuzzy household duplicates without writing data.",
  },
  {
    method: "post",
    path: "/v1/product-records",
    operationId: "createProductRecord",
    summary: "Create an attributed product record atomically",
    tag: "Product records",
    permissions: ["products:create OR warranties:write"],
    request: { schema: "ProductRecordInput" },
    success: 201,
    idempotent: true,
    description:
      "Creates product metadata, warranties, notes, and provenance sources in one transaction. Component-level permissions are enforced before writing.",
  },
] satisfies ApiRouteContract[];
