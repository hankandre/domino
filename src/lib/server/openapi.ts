export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Domino API",
    version: "0.1.1",
    description:
      "Household warranty, document, note, and claim API used by the Domino web app and Rust CLI.",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      browserSession: { type: "apiKey", in: "cookie", name: "domino_session" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" }, code: { type: "string" } },
      },
    },
  },
  security: [{ bearerAuth: [] }, { browserSession: [] }],
  paths: {
    "/v1/products": {
      get: {
        summary: "Search products",
        responses: { "200": { description: "Matching products" } },
      },
      post: {
        summary: "Create a product",
        responses: { "201": { description: "Created product" } },
      },
    },
    "/v1/products/{id}": {
      get: {
        summary: "Get a product",
        responses: { "200": { description: "Product detail" } },
      },
      patch: {
        summary: "Update a product",
        responses: { "200": { description: "Updated product" } },
      },
      delete: {
        summary: "Archive a product",
        responses: { "200": { description: "Archived product" } },
      },
    },
    "/v1/claims": {
      get: {
        summary: "List claims",
        responses: { "200": { description: "Household claims" } },
      },
    },
    "/v1/products/{id}/claims": {
      post: {
        summary: "Create a claim draft",
        responses: { "201": { description: "Created claim" } },
      },
    },
    "/v1/claims/{id}": {
      get: {
        summary: "Get a claim and timeline",
        responses: { "200": { description: "Claim detail" } },
      },
      patch: {
        summary: "Update claim status or resolution",
        responses: { "200": { description: "Updated claim" } },
      },
    },
    "/v1/documents": {
      get: {
        summary: "List document references",
        responses: { "200": { description: "Documents" } },
      },
      post: {
        summary: "Upload a document",
        responses: { "201": { description: "Stored or queued document" } },
      },
    },
    "/v1/products/{id}/notes": {
      get: {
        summary: "List product notes",
        responses: { "200": { description: "Product notes" } },
      },
      post: {
        summary: "Add a product note",
        responses: { "201": { description: "Created note" } },
      },
    },
    "/v1/claims/{id}/notes": {
      get: {
        summary: "List claim notes",
        responses: { "200": { description: "Claim notes" } },
      },
      post: {
        summary: "Add a claim note",
        responses: { "201": { description: "Created note" } },
      },
    },
    "/v1/audit": {
      get: {
        summary: "List household audit events",
        responses: { "200": { description: "Recent audit events" } },
      },
    },
  },
} as const;
