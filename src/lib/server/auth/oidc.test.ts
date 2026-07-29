import { describe, expect, test } from "vitest";
import { getOidcConfig, groupsAreAllowed, safeReturnTo } from "./oidc";

describe("OIDC configuration", () => {
  test("stays disabled when no issuer or client is configured", () => {
    expect(getOidcConfig({})).toBeNull();
  });

  test("builds a Pocket ID compatible discovery configuration", () => {
    const config = getOidcConfig({
      DOMINO_OIDC_ISSUER: "https://id.home.example/",
      DOMINO_OIDC_CLIENT_ID: "domino-client",
      DOMINO_OIDC_CLIENT_SECRET: "secret",
      DOMINO_SESSION_SECRET: "a-session-secret-that-is-at-least-32-characters",
      DOMINO_OIDC_ALLOWED_GROUPS: "household, domino-users",
    });

    expect(config).toMatchObject({
      issuer: "https://id.home.example",
      clientId: "domino-client",
      providerName: "Pocket ID",
      scopes: "openid profile email groups",
      allowedGroups: ["household", "domino-users"],
    });
  });
});

describe("OIDC request safety", () => {
  test("allows only local return paths", () => {
    expect(safeReturnTo("/claims?status=open")).toBe("/claims?status=open");
    expect(safeReturnTo("//attacker.example")).toBe("/");
    expect(safeReturnTo("https://attacker.example")).toBe("/");
    expect(safeReturnTo("/\\attacker.example")).toBe("/");
  });

  test("applies an optional exact group allowlist", () => {
    expect(groupsAreAllowed(["household", "admins"], ["household"])).toBe(true);
    expect(groupsAreAllowed(["guests"], ["household"])).toBe(false);
    expect(groupsAreAllowed(undefined, [])).toBe(true);
  });
});
