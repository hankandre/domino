import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

export const sessionCookieName = "domino_session";
export const flowCookieName = "domino_oidc_flow";

type Environment = Record<string, string | undefined>;

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  providerName: string;
  scopes: string;
  allowedGroups: string[];
  defaultRole: string;
  defaultClaimPreset: "all" | "open" | "attention" | "none";
  requireVerifiedEmail: boolean;
  autoProvision: boolean;
  linkExistingByEmail: boolean;
};

export type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

export type OidcFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

let discoveryCache: { issuer: string; value: Promise<OidcDiscovery> } | null =
  null;

export function initialDocumentBackend() {
  const baseUrl = process.env.PAPERLESS_URL?.trim();
  let token = process.env.PAPERLESS_TOKEN?.trim();
  if (!token && process.env.PAPERLESS_TOKEN_FILE) {
    try {
      token = readFileSync(process.env.PAPERLESS_TOKEN_FILE, "utf8").trim();
    } catch {
      token = "";
    }
  }
  return baseUrl && token ? ("paperless" as const) : ("local" as const);
}

function readSecret(source: Environment) {
  if (source.DOMINO_OIDC_CLIENT_SECRET_FILE) {
    return readFileSync(source.DOMINO_OIDC_CLIENT_SECRET_FILE, "utf8").trim();
  }
  return source.DOMINO_OIDC_CLIENT_SECRET?.trim() ?? "";
}

function readSessionSecret(source: Environment) {
  if (source.DOMINO_SESSION_SECRET_FILE) {
    return readFileSync(source.DOMINO_SESSION_SECRET_FILE, "utf8").trim();
  }
  return source.DOMINO_SESSION_SECRET?.trim() ?? "";
}

export function getOidcConfig(
  source: Environment = process.env,
): OidcConfig | null {
  if (source.DOMINO_OIDC_ENABLED === "false") return null;
  const issuer = source.DOMINO_OIDC_ISSUER?.trim().replace(/\/+$/, "");
  const clientId = source.DOMINO_OIDC_CLIENT_ID?.trim();
  const configured =
    source.DOMINO_OIDC_ENABLED === "true" || Boolean(issuer || clientId);

  if (!configured) return null;
  const clientSecret = readSecret(source);
  if (!issuer || !clientId || !clientSecret) {
    throw new Error(
      "OIDC is partially configured. DOMINO_OIDC_ISSUER, DOMINO_OIDC_CLIENT_ID, and a client secret are all required.",
    );
  }
  if (readSessionSecret(source).length < 32) {
    throw new Error(
      "DOMINO_SESSION_SECRET must be at least 32 characters when OIDC is enabled.",
    );
  }

  const defaultClaimPreset =
    source.DOMINO_OIDC_DEFAULT_CLAIM_PRESET?.trim().toLowerCase() || "all";
  if (!["all", "open", "attention", "none"].includes(defaultClaimPreset)) {
    throw new Error(
      "DOMINO_OIDC_DEFAULT_CLAIM_PRESET must be all, open, attention, or none.",
    );
  }

  return {
    issuer,
    clientId,
    clientSecret,
    providerName: source.DOMINO_OIDC_PROVIDER_NAME?.trim() || "Pocket ID",
    scopes: source.DOMINO_OIDC_SCOPES?.trim() || "openid profile email groups",
    allowedGroups: splitList(source.DOMINO_OIDC_ALLOWED_GROUPS),
    defaultRole: source.DOMINO_OIDC_DEFAULT_ROLE?.trim() || "Member",
    defaultClaimPreset: defaultClaimPreset as OidcConfig["defaultClaimPreset"],
    requireVerifiedEmail: source.DOMINO_OIDC_REQUIRE_VERIFIED_EMAIL !== "false",
    autoProvision: source.DOMINO_OIDC_AUTO_PROVISION !== "false",
    linkExistingByEmail: source.DOMINO_OIDC_LINK_EXISTING_BY_EMAIL === "true",
  };
}

function splitList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  return value;
}

export function groupsAreAllowed(claimed: unknown, allowed: string[]) {
  if (allowed.length === 0) return true;
  if (!Array.isArray(claimed)) return false;
  return claimed.some(
    (group) => typeof group === "string" && allowed.includes(group),
  );
}

export function publicOrigin() {
  const raw = process.env.ORIGIN ?? process.env.DOMINO_ORIGIN;
  if (!raw) throw new Error("ORIGIN is required when OIDC is enabled.");
  return new URL(raw).origin;
}

export function redirectUri() {
  return new URL("/auth/oidc/callback", publicOrigin()).toString();
}

export function sessionCookieOptions(maxAge = sessionTtlSeconds()) {
  const origin =
    process.env.ORIGIN ?? process.env.DOMINO_ORIGIN ?? "http://localhost";
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(origin).protocol === "https:",
    maxAge,
  };
}

export function secretKey() {
  const secret = readSessionSecret(process.env);
  if (!secret || secret.length < 32)
    throw new Error("DOMINO_SESSION_SECRET must be at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

export async function discover(config: OidcConfig) {
  if (discoveryCache?.issuer === config.issuer) return discoveryCache.value;

  const value = (async () => {
    const url = `${config.issuer}/.well-known/openid-configuration`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`OIDC discovery failed with HTTP ${response.status}.`);
    const document = (await response.json()) as Partial<OidcDiscovery>;
    if (
      document.issuer !== config.issuer ||
      !document.authorization_endpoint ||
      !document.token_endpoint ||
      !document.jwks_uri
    ) {
      throw new Error(
        "The OIDC discovery document is incomplete or has an unexpected issuer.",
      );
    }
    return document as OidcDiscovery;
  })();

  discoveryCache = { issuer: config.issuer, value };
  return value;
}

export function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function equalSecrets(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionTtlSeconds() {
  const hours = Number(process.env.DOMINO_SESSION_TTL_HOURS ?? 168);
  return (
    Math.max(1, Math.min(Number.isFinite(hours) ? hours : 168, 24 * 90)) *
    60 *
    60
  );
}
