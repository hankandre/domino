import { describe, expect, test } from "bun:test";
import { app } from "./api";
import { openApiDocument } from "./openapi";

type DocumentedOperation = {
  operationId: string;
  tags: string[];
  security: unknown[];
  responses: Record<string, unknown>;
  requestBody?: {
    content: Record<string, { schema: unknown }>;
  };
};

const documentedPaths = openApiDocument.paths as Record<
  string,
  Record<string, DocumentedOperation>
>;

function registeredOperationalRoutes() {
  return [
    ...new Set(
      app.routes
        .filter(
          ({ method, path }) =>
            method !== "ALL" &&
            (path.startsWith("/api/v1/") || path.startsWith("/api/device/")),
        )
        .map(
          ({ method, path }) =>
            `${method.toLowerCase()} ${path
              .replace(/^\/api/, "")
              .replaceAll(/:([^/]+)/g, "{$1}")}`,
        ),
    ),
  ].sort();
}

function documentedOperationalRoutes() {
  return Object.entries(documentedPaths)
    .flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method} ${path}`),
    )
    .sort();
}

describe("Swagger documentation", () => {
  test("serves the canonical endpoint without a redirect", async () => {
    const response = await app.request("/api/docs");

    expect(response.status).toBe(200);
  });

  test("serves a self-hosted UI with a restrictive content policy", async () => {
    const response = await app.request("/api/docs");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
    expect(html).toContain("/api/docs/swagger-ui-bundle.js");
    expect(html).toContain("/api/docs/swagger-initializer.js");
    expect(html).not.toContain("cdn.");
  });

  test("serves Swagger assets and the OpenAPI source locally", async () => {
    const [script, specification] = await Promise.all([
      app.request("/api/docs/swagger-ui-bundle.js"),
      app.request("/api/openapi.json"),
    ]);

    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect((await script.text()).length).toBeGreaterThan(100_000);
    expect(specification.status).toBe(200);
    const document = (await specification.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths).toHaveProperty("/v1/product-records");
    expect(document.paths).toHaveProperty("/v1/product-records/validate");
  });

  test("documents every registered versioned and device route exactly once", () => {
    expect(documentedOperationalRoutes()).toEqual(
      registeredOperationalRoutes(),
    );
    expect(documentedOperationalRoutes()).toHaveLength(40);
  });

  test("gives every operation stable metadata, security, and responses", () => {
    const operationIds = new Set<string>();
    for (const methods of Object.values(documentedPaths)) {
      for (const operation of Object.values(methods)) {
        expect(operation.operationId).toBeTruthy();
        expect(operationIds.has(operation.operationId)).toBe(false);
        operationIds.add(operation.operationId);
        expect(operation.tags.length).toBeGreaterThan(0);
        expect(operation.security).toBeDefined();
        expect(operation.responses).toHaveProperty("400");
        expect(operation.responses).toHaveProperty("500");
      }
    }
  });

  test("derives request schemas from the Zod validation contracts", () => {
    const schemas = openApiDocument.components.schemas as Record<
      string,
      unknown
    >;
    expect(schemas.ProductRecordInput).toHaveProperty("type", "object");
    expect(schemas.ProductRecordInput).toHaveProperty(
      "required",
      expect.arrayContaining(["product"]),
    );
    expect(schemas.WarrantyInput).toMatchObject({
      properties: {
        submissionMethods: { type: "array", maxItems: 5 },
        requiredEvidence: { type: "array", maxItems: 50 },
        claimInstructions: { type: "array", maxItems: 50 },
      },
    });
    expect(
      documentedPaths["/v1/claims/{id}"].patch.requestBody!.content[
        "application/json"
      ].schema,
    ).toEqual({ $ref: "#/components/schemas/ClaimUpdateInput" });
  });
});
