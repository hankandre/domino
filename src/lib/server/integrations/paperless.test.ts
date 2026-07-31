import { describe, expect, test } from "bun:test";
import {
  decryptPaperlessToken,
  deploymentPaperlessConfiguration,
  encryptPaperlessToken,
  normalizePaperlessUrl,
  paperlessCredentialRefForSave,
} from "./paperless";
import { PaperlessClient } from "../paperless";

const environment = {
  DOMINO_CREDENTIAL_ENCRYPTION_KEY:
    "a-dedicated-integration-key-that-is-long-enough-for-tests",
};

describe("Paperless integration credentials", () => {
  test("encrypts a token with household-bound authenticated encryption", () => {
    const encrypted = encryptPaperlessToken(
      "paperless-api-token",
      "household-one",
      "https://paperless.example.test",
      environment,
    );

    expect(encrypted).not.toContain("paperless-api-token");
    expect(
      decryptPaperlessToken(
        encrypted,
        "household-one",
        "https://paperless.example.test",
        environment,
      ),
    ).toBe("paperless-api-token");
    expect(() =>
      decryptPaperlessToken(
        encrypted,
        "household-two",
        "https://paperless.example.test",
        environment,
      ),
    ).toThrow("could not be decrypted");
    expect(() =>
      decryptPaperlessToken(
        encrypted,
        "household-one",
        "https://attacker.example.test",
        environment,
      ),
    ).toThrow("could not be decrypted");
  });

  test("normalizes a Paperless subpath and rejects embedded credentials", () => {
    expect(normalizePaperlessUrl("https://home.example/paperless")).toBe(
      "https://home.example/paperless/",
    );
    expect(() =>
      normalizePaperlessUrl("https://user:password@home.example"),
    ).toThrow("must not contain credentials");
    expect(
      new PaperlessClient(
        "https://home.example/paperless/",
        "token",
      ).documentUrl(42),
    ).toBe("https://home.example/paperless/documents/42/details");
  });

  test("continues to support deployment-provided configuration", () => {
    expect(
      deploymentPaperlessConfiguration({
        PAPERLESS_URL: "https://paperless.example.test",
        PAPERLESS_TOKEN: "deployment-token",
      }),
    ).toEqual({
      baseUrl: "https://paperless.example.test/",
      token: "deployment-token",
      source: "deployment",
    });
  });

  test("requires a fresh token when the saved URL changes", () => {
    const credentialRef = encryptPaperlessToken(
      "paperless-api-token",
      "household-one",
      "https://paperless.example.test",
      environment,
    );
    expect(
      paperlessCredentialRefForSave({
        householdId: "household-one",
        baseUrl: "https://paperless.example.test",
        existingBaseUrl: "https://paperless.example.test",
        existingCredentialRef: credentialRef,
        source: environment,
      }),
    ).toBe(credentialRef);
    expect(() =>
      paperlessCredentialRefForSave({
        householdId: "household-one",
        baseUrl: "https://attacker.example.test",
        existingBaseUrl: "https://paperless.example.test",
        existingCredentialRef: credentialRef,
        source: environment,
      }),
    ).toThrow("new Paperless API token");
  });

  test("keeps deployment credentials paired with the deployment URL", () => {
    const source = {
      PAPERLESS_URL: "https://paperless.example.test",
      PAPERLESS_TOKEN: "deployment-token",
    };
    expect(
      paperlessCredentialRefForSave({
        householdId: "household-one",
        baseUrl: "https://paperless.example.test",
        existingCredentialRef: "deployment",
        source,
      }),
    ).toBe("deployment");
    expect(() =>
      paperlessCredentialRefForSave({
        householdId: "household-one",
        baseUrl: "https://attacker.example.test",
        existingCredentialRef: "deployment",
        source,
      }),
    ).toThrow("Enter a Paperless API token");
  });

  test("does not follow redirects or trust a deceptive response length", async () => {
    let requestInit: RequestInit | undefined;
    const oversizedJson = `{"count":0,"results":[],"padding":"${"x".repeat(
      2 * 1024 * 1024,
    )}"}`;
    const client = new PaperlessClient(
      "https://paperless.example.test/",
      "secret-token",
      (async (_input, init) => {
        requestInit = init;
        return new Response(oversizedJson, {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": "1",
          },
        });
      }) as typeof fetch,
    );

    await expect(client.search("receipt")).rejects.toThrow(
      "Paperless response is too large",
    );
    expect(requestInit?.redirect).toBe("error");
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });
});
