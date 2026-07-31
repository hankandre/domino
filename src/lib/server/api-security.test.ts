import { afterEach, describe, expect, test } from "bun:test";
import { demoProducts } from "$lib/demo";
import { app } from "./api";
import { clearRateLimitsForTests } from "./rate-limit";

const originalDemoMode = process.env.DOMINO_DEMO_MODE;
const originalOrigin = process.env.ORIGIN;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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
  restoreEnvironment("DOMINO_DEMO_MODE", originalDemoMode);
  restoreEnvironment("ORIGIN", originalOrigin);
  clearRateLimitsForTests();
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

  test("persists selected claim scope during device approval", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const claimId = crypto.randomUUID();
    const started = await app.request("/api/device/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Scoped helper" }),
    });
    const device = (await started.json()) as {
      deviceCode: string;
      userCode: string;
    };
    const approved = await app.request("/api/device/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userCode: device.userCode,
        permissions: ["claims:read"],
        claimAccessScope: "selected",
        claimIds: [claimId],
      }),
    });
    expect(approved.status).toBe(200);

    const issued = await app.request("/api/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode: device.deviceCode }),
    });
    const credential = (await issued.json()) as { accessToken: string };
    const me = await app.request("/api/v1/me", {
      headers: { authorization: `Bearer ${credential.accessToken}` },
    });
    const body = (await me.json()) as {
      actor: { claimAccessScope: string; claimIds?: string[] };
    };

    expect(me.status).toBe(200);
    expect(body.actor.claimAccessScope).toBe("selected");
    expect(body.actor.claimIds).toEqual([claimId]);
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

  test("requires document read authority to refresh Paperless metadata", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const token = await issueDemoCredential(["paperless:discover"]);
    const response = await app.request(
      `/api/v1/documents/${crypto.randomUUID()}/refresh`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(403);
  });

  test("validates security-relevant headers with zValidator", async () => {
    process.env.DOMINO_DEMO_MODE = "true";

    const invalidAuthorization = await app.request("/api/v1/me", {
      headers: { authorization: `Bearer ${"x".repeat(4_100)}` },
    });
    const invalidOrigin = await app.request("/api/v1/me", {
      headers: { origin: "javascript:alert(1)" },
    });

    expect(invalidAuthorization.status).toBe(400);
    expect(invalidOrigin.status).toBe(400);
  });

  test("bounds list windows at the API boundary", async () => {
    process.env.DOMINO_DEMO_MODE = "true";

    const responses = await Promise.all([
      app.request("/api/v1/products?limit=201"),
      app.request("/api/v1/claims?offset=-1"),
      app.request("/api/v1/documents?limit=0"),
      app.request("/api/v1/audit?offset=1000001"),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400,
    ]);
  });

  test("terminates pagination after the bounded search candidate window", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const originalLength = demoProducts.length;
    try {
      const template = demoProducts[0];
      while (demoProducts.length <= 1_000) {
        demoProducts.push({
          ...template,
          id: crypto.randomUUID(),
          name: `Fixture ${demoProducts.length}`,
        });
      }
      const response = await app.request(
        "/api/v1/products?limit=100&offset=1000",
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        products: unknown[];
        page: { hasMore: boolean };
      };
      expect(body.products).toHaveLength(0);
      expect(body.page.hasMore).toBe(false);
    } finally {
      demoProducts.splice(originalLength);
    }
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

  test("rate limits public device enrollment by the server-derived address", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const address = `device-${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.request("/api/device/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-domino-client-address": address,
        },
        body: JSON.stringify({ name: `Agent ${attempt}` }),
      });
      expect(response.status).toBe(200);
    }
    const limited = await app.request("/api/device/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-domino-client-address": address,
      },
      body: JSON.stringify({ name: "One too many" }),
    });

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  test("rejects oversized uploads with missing or deceptive length headers", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const productId = crypto.randomUUID();
    const oversized = new File(
      [new Uint8Array(11 * 1024 * 1024)],
      "oversized.png",
      { type: "image/png" },
    );

    const missingLengthBody = new FormData();
    missingLengthBody.set("file", oversized);
    const missingLength = await app.request(
      `/api/v1/products/${productId}/images`,
      { method: "POST", body: missingLengthBody },
    );
    expect(missingLength.status).toBe(413);

    const deceptiveBody = new FormData();
    deceptiveBody.set("file", oversized);
    const deceptiveRequest = new Request(
      `http://localhost/api/v1/products/${productId}/images`,
      {
        method: "POST",
        headers: { "content-length": "1" },
        body: deceptiveBody,
      },
    );
    const deceptiveLength = await app.request(deceptiveRequest);
    expect(deceptiveLength.status).toBe(400);

    const declaredOversize = await app.request(
      `/api/v1/products/${productId}/images/upload`,
      {
        method: "POST",
        headers: {
          "content-type": "image/png",
          "content-length": String(10 * 1024 * 1024 + 1),
        },
        body: new Uint8Array([1]),
      },
    );
    expect(declaredOversize.status).toBe(413);
  });

  test("validates the permissions needed by each product-record component", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const token = await issueDemoCredential(["products:create"]);
    const response = await app.request("/api/v1/product-records/validate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        product: { name: "Workshop radio" },
        warranties: [{ provider: "Acme", lifetime: true }],
        notes: ["Receipt was in the box."],
      }),
    });
    const body = (await response.json()) as {
      valid: boolean;
      missingPermissions: string[];
    };

    expect(response.status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.missingPermissions).toEqual([
      "warranties:create",
      "notes:write",
    ]);
  });

  test("requires an idempotency key for product-record creation", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const token = await issueDemoCredential(["products:create"]);
    const response = await app.request("/api/v1/product-records", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ product: { name: "Workshop radio" } }),
    });

    expect(response.status).toBe(400);
  });

  test("allows a create-only account to submit idempotent product metadata", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const token = await issueDemoCredential(["products:create"]);
    const response = await app.request("/api/v1/product-records", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": "record-test-2026",
      },
      body: JSON.stringify({
        product: { name: "Workshop radio" },
        sources: [
          {
            kind: "external",
            externalSystem: "hermes",
            externalId: "record-42",
          },
        ],
      }),
    });
    const body = (await response.json()) as {
      product: { id: string; name: string };
      sources: unknown[];
    };

    expect(response.status).toBe(201);
    expect(body.product.name).toBe("Workshop radio");
    expect(body.sources).toHaveLength(1);
  });

  test("does not let an attachment-only account remove documents", async () => {
    process.env.DOMINO_DEMO_MODE = "true";
    const token = await issueDemoCredential(["documents:attach"]);
    const response = await app.request(
      `/api/v1/documents/${crypto.randomUUID()}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      },
    );

    expect(response.status).toBe(403);
  });
});
