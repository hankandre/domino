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
      ProductRecordInput: {
        type: "object",
        required: ["product"],
        properties: {
          product: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", maxLength: 180 },
              brand: { type: "string", maxLength: 100 },
              model: { type: "string", maxLength: 120 },
              category: { type: "string", maxLength: 120 },
              retailer: { type: "string", maxLength: 120 },
              orderNumber: { type: "string", maxLength: 180 },
              productUrl: { type: ["string", "null"], format: "uri" },
              purchaseDate: { type: ["string", "null"], format: "date" },
              purchasePriceMinor: { type: "integer", minimum: 0 },
              currency: { type: "string", minLength: 3, maxLength: 3 },
              serialNumbers: {
                type: "array",
                maxItems: 20,
                items: { type: "string", maxLength: 180 },
              },
            },
          },
          warranties: {
            type: "array",
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                provider: { type: "string", maxLength: 180 },
                kind: { type: "string", maxLength: 80 },
                startsAt: { type: "string", format: "date" },
                endsAt: { type: ["string", "null"], format: "date" },
                lifetime: { type: "boolean" },
                terms: { type: "string", maxLength: 20000 },
                claimUrl: { type: ["string", "null"], format: "uri" },
                claimPhone: { type: ["string", "null"] },
                claimEmail: {
                  type: ["string", "null"],
                  format: "email",
                },
              },
            },
          },
          notes: {
            type: "array",
            maxItems: 20,
            items: { type: "string", maxLength: 10000 },
          },
          sources: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              required: ["kind"],
              properties: {
                kind: {
                  type: "string",
                  enum: ["url", "external", "paperless"],
                },
                label: { type: "string", maxLength: 180 },
                url: { type: "string", format: "uri" },
                externalSystem: { type: "string", maxLength: 100 },
                externalId: { type: "string", maxLength: 300 },
              },
            },
          },
          allowDuplicateOf: { type: "string", format: "uuid" },
        },
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
    "/v1/product-records/validate": {
      post: {
        summary: "Validate an agent product-record manifest",
        description:
          "Checks component permissions and exact/fuzzy household duplicates without creating data.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductRecordInput" },
            },
          },
        },
        responses: { "200": { description: "Validation result" } },
      },
    },
    "/v1/product-records": {
      post: {
        summary: "Create a complete attributed product record",
        description:
          "Creates product metadata, warranties, notes, and sources atomically. Exact durable-identifier duplicates return 409.",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 200 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductRecordInput" },
            },
          },
        },
        responses: {
          "201": { description: "Created product record" },
          "200": { description: "Idempotent replay" },
          "409": { description: "Duplicate product or conflicting key" },
        },
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
