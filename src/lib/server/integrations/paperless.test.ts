import { describe, expect, test } from "vitest";
import {
  decryptPaperlessToken,
  deploymentPaperlessConfiguration,
  encryptPaperlessToken,
  normalizePaperlessUrl,
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
      environment,
    );

    expect(encrypted).not.toContain("paperless-api-token");
    expect(decryptPaperlessToken(encrypted, "household-one", environment)).toBe(
      "paperless-api-token",
    );
    expect(() =>
      decryptPaperlessToken(encrypted, "household-two", environment),
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
});
