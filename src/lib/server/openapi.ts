import { z, type ZodType } from "zod";
import {
  apiRouteContracts,
  type ApiRouteContract,
  type SchemaName,
} from "./api/openapi-contract";
import {
  claimCreateInput,
  claimListQuery,
  claimUpdateInput,
  noteListQuery,
} from "./api/claims.schemas";
import {
  deviceApproveInput,
  deviceStartInput,
  deviceTokenInput,
} from "./api/devices.schemas";
import {
  documentListQuery,
  paperlessLinkInput,
  paperlessSearchQuery,
  streamedDocumentUploadInput,
} from "./api/documents.schemas";
import { auditQuery } from "./api/identity.schemas";
import {
  imageContentQuery,
  imageFromUrlInput,
  imageSuggestionInput,
} from "./api/images.schemas";
import { noteInput } from "./api/claims.schemas";
import {
  productInput,
  productRecordUpdateInput,
  productUpdateInput,
  searchQuery,
  warrantyInput,
  warrantyUpdateInput,
} from "./api/products.schemas";
import { productRecordInput } from "./api/records.schemas";

type JsonObject = Record<string, unknown>;

const zodSchemas: Record<SchemaName, ZodType> = {
  AuditQuery: auditQuery,
  ClaimCreateInput: claimCreateInput,
  ClaimListQuery: claimListQuery,
  ClaimUpdateInput: claimUpdateInput,
  DeviceApproveInput: deviceApproveInput,
  DeviceStartInput: deviceStartInput,
  DeviceTokenInput: deviceTokenInput,
  DocumentListQuery: documentListQuery,
  ImageFromUrlInput: imageFromUrlInput,
  ImageContentQuery: imageContentQuery,
  ImageSuggestionInput: imageSuggestionInput,
  NoteListQuery: noteListQuery,
  NoteInput: noteInput,
  PaperlessLinkInput: paperlessLinkInput,
  PaperlessSearchQuery: paperlessSearchQuery,
  ProductInput: productInput,
  ProductRecordInput: productRecordInput,
  ProductRecordUpdateInput: productRecordUpdateInput,
  ProductSearchQuery: searchQuery,
  ProductUpdateInput: productUpdateInput,
  StreamedDocumentUploadQuery: streamedDocumentUploadInput,
  WarrantyInput: warrantyInput,
  WarrantyUpdateInput: warrantyUpdateInput,
};

function jsonSchema(schema: ZodType): JsonObject {
  const generated = z.toJSONSchema(schema) as JsonObject;
  const { $schema: _, ...openApiSchema } = generated;
  return openApiSchema;
}

const generatedSchemas = Object.fromEntries(
  Object.entries(zodSchemas).map(([name, schema]) => [
    name,
    jsonSchema(schema),
  ]),
);

function queryParameters(name: SchemaName) {
  const schema = generatedSchemas[name] as {
    properties?: Record<string, JsonObject>;
    required?: string[];
  };
  return Object.entries(schema.properties ?? {}).map(
    ([parameterName, parameterSchema]) => ({
      in: "query",
      name: parameterName,
      required: schema.required?.includes(parameterName) ?? false,
      schema: parameterSchema,
    }),
  );
}

const descriptions: Record<number, string> = {
  200: "Successful response",
  201: "Resource created",
  400: "Invalid request",
  401: "Authentication required",
  403: "Insufficient authority",
  404: "Resource not found or outside the actor's scope",
  409: "Duplicate resource or idempotency conflict",
  413: "Request body exceeds the documented limit",
  429: "Rate limit exceeded",
  500: "Unexpected server error",
  502: "Upstream document service failed",
  503: "Required integration is not configured",
};

function errorResponse(status: number) {
  return {
    description: descriptions[status],
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  };
}

function operationResponses(contract: ApiRouteContract) {
  const success = contract.success ?? 200;
  const statuses = new Set([success, 400, 401, 403, 404, 500]);
  if (contract.idempotent) {
    statuses.add(200);
    statuses.add(409);
  }
  if (contract.request?.binary) statuses.add(413);
  if (contract.rateLimit) statuses.add(429);
  if (contract.tag === "Documents") {
    statuses.add(502);
    statuses.add(503);
  }
  return Object.fromEntries(
    [...statuses].map((status) => {
      if (status !== success && !(contract.idempotent && status === 200)) {
        return [String(status), errorResponse(status)];
      }
      const response: JsonObject = { description: descriptions[status] };
      if (contract.responseContentType) {
        response.content = {
          [contract.responseContentType]: {
            schema: { type: "string", format: "binary" },
          },
        };
      } else {
        response.content = {
          "application/json": { schema: { type: "object" } },
        };
      }
      return [String(status), response];
    }),
  );
}

function requestBody(contract: ApiRouteContract) {
  if (!contract.request) return undefined;
  const contentType = contract.request.contentType ?? "application/json";
  let schema: JsonObject;
  if (contract.request.schema) {
    schema = { $ref: `#/components/schemas/${contract.request.schema}` };
  } else if (contentType === "multipart/form-data") {
    schema = {
      type: "object",
      required: ["file"],
      properties: {
        file: { type: "string", format: "binary" },
        name: { type: "string", maxLength: 255 },
        kind: { $ref: "#/components/schemas/DocumentKind" },
        backend: { type: "string", enum: ["local", "paperless"] },
        productId: { type: "string", format: "uuid" },
        claimId: { type: "string", format: "uuid" },
      },
    };
  } else {
    schema = { type: "string", format: "binary" };
  }
  return {
    required: contract.request.required ?? true,
    content: { [contentType]: { schema } },
  };
}

function operation(contract: ApiRouteContract) {
  const parameters: JsonObject[] = [];
  if (contract.path.includes("{id}")) {
    parameters.push({
      in: "path",
      name: "id",
      required: true,
      schema: { type: "string", format: "uuid" },
    });
  }
  if (contract.query) parameters.push(...queryParameters(contract.query));
  if (contract.idempotent) {
    parameters.push({ $ref: "#/components/parameters/IdempotencyKey" });
  }
  if (
    contract.request?.contentType === "application/octet-stream" ||
    contract.responseContentType
  ) {
    parameters.push({
      in: "header",
      name: "Content-Type",
      required: Boolean(contract.request),
      schema: { type: "string", maxLength: 255 },
    });
  }
  const security =
    contract.auth === "public"
      ? []
      : contract.auth === "browser"
        ? [{ browserSession: [] }]
        : [{ bearerAuth: [] }, { browserSession: [] }];
  return {
    operationId: contract.operationId,
    summary: contract.summary,
    ...(contract.description ? { description: contract.description } : {}),
    tags: [contract.tag],
    security,
    ...(contract.permissions
      ? { "x-domino-permissions": contract.permissions }
      : {}),
    ...(contract.claimScoped
      ? {
          "x-domino-claim-scope":
            "Results and related resources are restricted to the actor's selected claim IDs when claimAccessScope is selected.",
        }
      : {}),
    ...(contract.rateLimit ? { "x-rate-limit": contract.rateLimit } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(contract.request ? { requestBody: requestBody(contract) } : {}),
    responses: operationResponses(contract),
  };
}

const paths: Record<string, Record<string, unknown>> = {};
for (const contract of apiRouteContracts) {
  paths[contract.path] ??= {};
  paths[contract.path][contract.method] = operation(contract);
}

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Domino API",
    version: "0.2.0",
    description:
      "Household warranty, document, note, and claim API used by Domino's browser UI and independently released Rust CLI.",
  },
  servers: [{ url: "/api", description: "This Domino installation" }],
  tags: [
    "Device authorization",
    "Identity",
    "Product records",
    "Products",
    "Warranties",
    "Product images",
    "Documents",
    "Notes",
    "Claims",
  ].map((name) => ({ name })),
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "API credential issued through the device flow. The Rust CLI retrieves it from the OS credential broker and does not expose it to invoking agents.",
      },
      browserSession: {
        type: "apiKey",
        in: "cookie",
        name: "domino_session",
        description:
          "Local or OIDC browser session. Mutating browser requests must also send an Origin header matching this Domino installation.",
      },
    },
    parameters: {
      IdempotencyKey: {
        in: "header",
        name: "Idempotency-Key",
        required: true,
        description:
          "Stable 8–200 character key. Repeating the same key and body returns the original result; a different body returns 409.",
        schema: { type: "string", minLength: 8, maxLength: 200 },
      },
    },
    schemas: {
      ...generatedSchemas,
      DocumentKind: {
        type: "string",
        enum: ["receipt", "manual", "warranty", "photo", "claim", "other"],
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          code: { type: "string" },
          missingPermissions: { type: "array", items: { type: "string" } },
        },
      },
      Page: {
        type: "object",
        required: ["limit", "offset", "hasMore"],
        properties: {
          limit: { type: "integer", minimum: 1 },
          offset: { type: "integer", minimum: 0 },
          hasMore: { type: "boolean" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { browserSession: [] }],
  paths,
  externalDocs: {
    description: "Domino operator and CLI documentation",
    url: "https://github.com/handre/domino#readme",
  },
} as const;
