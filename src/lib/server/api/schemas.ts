// Compatibility barrel. New route code imports its domain's adjacent schema
// module so validators, handlers, and OpenAPI metadata stay discoverable
// together. Shared transport primitives live in common.schemas.ts.
export * from "./claims.schemas";
export * from "./common.schemas";
export * from "./devices.schemas";
export * from "./documents.schemas";
export * from "./identity.schemas";
export * from "./images.schemas";
export * from "./products.schemas";
export * from "./records.schemas";
