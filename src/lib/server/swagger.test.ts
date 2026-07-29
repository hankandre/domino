import { describe, expect, test } from "vitest";
import { app } from "./api";

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
    expect((await specification.json()).openapi).toBe("3.1.0");
  });
});
