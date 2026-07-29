import { afterEach, describe, expect, test } from "vitest";
import { app } from "./api";

const originalDemoMode = process.env.DOMINO_DEMO_MODE;
const originalOrigin = process.env.ORIGIN;

afterEach(() => {
  process.env.DOMINO_DEMO_MODE = originalDemoMode;
  process.env.ORIGIN = originalOrigin;
});

describe("API browser boundaries", () => {
  test("does not reflect credentialed cross-origin requests", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const response = await app.request("/api/v1/me", {
      headers: { origin: "https://compromised.home.example" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("rejects wildcard service-account grants", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const response = await app.request("/api/device/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userCode: "ABCDEFGH", permissions: ["*"] }),
    });

    expect(response.status).toBe(400);
  });

  test("builds the verification URL from the trusted public origin", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    process.env.ORIGIN = "https://domino.home.example";
    const response = await app.request("/api/device/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Hermes",
        serverOrigin: "https://attacker.example",
      }),
    });
    const body = (await response.json()) as { verificationUri: string };

    expect(response.status).toBe(200);
    expect(body.verificationUri).toMatch(
      /^https:\/\/domino\.home\.example\/activate\?/,
    );
  });

  test("validates route params and query strings with zValidator", async () => {
    process.env.DOMINO_DEMO_MODE = "true";

    const invalidParam = await app.request("/api/v1/products/not-a-uuid");
    const invalidQuery = await app.request("/api/v1/paperless/search?q=");

    expect(invalidParam.status).toBe(400);
    expect(invalidQuery.status).toBe(400);
  });

  test("validates multipart uploads with zValidator", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const body = new FormData();
    body.set("kind", "manual");

    const response = await app.request("/api/v1/documents", {
      method: "POST",
      body,
    });

    expect(response.status).toBe(400);
  });
});
