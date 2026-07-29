import { afterEach, describe, expect, test } from "vitest";
import { app } from "./api";

const originalDemoMode = process.env.DOMINO_DEMO_MODE;
const originalOrigin = process.env.ORIGIN;

async function issueDemoCredential(permissions: string[]) {
  const started = await app.request("/api/device/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `Restricted ${crypto.randomUUID()}` }),
  });
  const device = (await started.json()) as {
    deviceCode: string;
    userCode: string;
  };
  const approved = await app.request("/api/device/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userCode: device.userCode, permissions }),
  });
  expect(approved.status).toBe(200);
  const issued = await app.request("/api/device/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceCode: device.deviceCode }),
  });
  const credential = (await issued.json()) as { accessToken: string };
  return credential.accessToken;
}

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

  test("does not enable unauthenticated demo access when unset", async () => {
    delete process.env.DOMINO_DEMO_MODE;
    const response = await app.request("/api/v1/me");

    expect(response.status).toBe(401);
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

  test("redacts claim, document, and note data from warranty-only product responses", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const token = await issueDemoCredential(["warranties:read"]);
    const response = await app.request("/api/v1/products", {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as {
      products: Array<{
        activeClaim?: unknown;
        documents: number;
        notes: number;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.products.length).toBeGreaterThan(0);
    expect(
      body.products.every(
        (product) =>
          product.activeClaim === undefined &&
          product.documents === 0 &&
          product.notes === 0,
      ),
    ).toBe(true);
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

  test("rejects script-capable stored URLs", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const response = await app.request("/api/v1/products", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify({
        name: "Unsafe link",
        productUrl: "javascript:alert(document.domain)",
        warranty: { claimUrl: "data:text/html,unsafe" },
      }),
    });

    expect(response.status).toBe(400);
  });

  test("rejects oversized public device bodies before parsing", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const response = await app.request("/api/device/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(9_000) }),
    });

    expect(response.status).toBe(413);
  });
});
