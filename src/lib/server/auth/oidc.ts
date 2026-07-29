import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Cookies } from "@sveltejs/kit";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  createRemoteJWKSet,
  EncryptJWT,
  jwtDecrypt,
  jwtVerify,
  type JWTPayload,
} from "jose";
import {
  actorRoles,
  actors,
  households,
  oidcIdentities,
  roles,
  users,
  webSessions,
} from "../db/schema";
import { requireDb } from "../db";
import { roleTemplates } from "./permissions";

export const sessionCookieName = "domino_session";
const flowCookieName = "domino_oidc_flow";

type Environment = Record<string, string | undefined>;

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  providerName: string;
  scopes: string;
  allowedGroups: string[];
  defaultRole: string;
  requireVerifiedEmail: boolean;
  autoProvision: boolean;
  linkExistingByEmail: boolean;
};

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

type OidcFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

type IdentityClaims = JWTPayload & {
  email: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  groups?: string[];
};

export type AuthenticatedActor = {
  id: string;
  householdId: string;
  kind: "user" | "service";
  permissions: string[];
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
};

let discoveryCache: { issuer: string; value: Promise<OidcDiscovery> } | null =
  null;

function initialDocumentBackend() {
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

  return {
    issuer,
    clientId,
    clientSecret,
    providerName: source.DOMINO_OIDC_PROVIDER_NAME?.trim() || "Pocket ID",
    scopes: source.DOMINO_OIDC_SCOPES?.trim() || "openid profile email groups",
    allowedGroups: splitList(source.DOMINO_OIDC_ALLOWED_GROUPS),
    defaultRole: source.DOMINO_OIDC_DEFAULT_ROLE?.trim() || "Member",
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

function publicOrigin() {
  const raw = process.env.ORIGIN ?? process.env.DOMINO_ORIGIN;
  if (!raw) throw new Error("ORIGIN is required when OIDC is enabled.");
  return new URL(raw).origin;
}

function redirectUri() {
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

function secretKey() {
  const secret = readSessionSecret(process.env);
  if (!secret || secret.length < 32)
    throw new Error("DOMINO_SESSION_SECRET must be at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

async function discover(config: OidcConfig) {
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

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function equalSecrets(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function beginOidcLogin(
  cookies: Cookies,
  returnTo?: string | null,
) {
  const config = getOidcConfig();
  if (!config) throw new Error("OIDC is not enabled.");
  const discovery = await discover(config);
  const flow: OidcFlow = {
    state: randomBase64Url(),
    nonce: randomBase64Url(),
    codeVerifier: randomBase64Url(48),
    returnTo: safeReturnTo(returnTo),
  };
  const codeChallenge = createHash("sha256")
    .update(flow.codeVerifier)
    .digest("base64url");
  const flowCookie = await new EncryptJWT(flow)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .encrypt(secretKey());
  cookies.set(flowCookieName, flowCookie, sessionCookieOptions(600));

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function finishOidcLogin(
  cookies: Cookies,
  callbackUrl: URL,
  userAgent: string | null,
) {
  const config = getOidcConfig();
  if (!config) throw new Error("OIDC is not enabled.");
  const encryptedFlow = cookies.get(flowCookieName);
  cookies.delete(flowCookieName, { path: "/" });
  if (!encryptedFlow)
    throw new Error("The sign-in request has expired. Start again.");

  const { payload } = await jwtDecrypt(encryptedFlow, secretKey());
  const flow = payload as JWTPayload & Partial<OidcFlow>;
  const state = callbackUrl.searchParams.get("state");
  const code = callbackUrl.searchParams.get("code");
  if (!state || !flow.state || !equalSecrets(state, flow.state)) {
    throw new Error(
      "The sign-in response did not match the request. Start again.",
    );
  }
  if (!code || !flow.codeVerifier || !flow.nonce) {
    throw new Error(
      "The identity provider did not return an authorization code.",
    );
  }

  const discovery = await discover(config);
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: flow.codeVerifier,
  });
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: tokenBody,
    signal: AbortSignal.timeout(10_000),
  });
  const tokenSet = (await tokenResponse.json()) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokenSet.id_token) {
    throw new Error(
      tokenSet.error_description ||
        tokenSet.error ||
        "The OIDC token exchange failed.",
    );
  }

  const { payload: verifiedPayload } = await jwtVerify(
    tokenSet.id_token,
    createRemoteJWKSet(new URL(discovery.jwks_uri)),
    {
      issuer: config.issuer,
      audience: config.clientId,
    },
  );
  const claims = verifiedPayload as IdentityClaims;
  if (!claims.sub || claims.nonce !== flow.nonce || !claims.email) {
    throw new Error("The identity token is missing required identity claims.");
  }
  if (config.requireVerifiedEmail && claims.email_verified !== true) {
    throw new Error("A verified email address is required to sign in.");
  }
  if (!groupsAreAllowed(claims.groups, config.allowedGroups)) {
    throw new Error(
      "Your Pocket ID account is not in a group allowed to use Domino.",
    );
  }

  const actorId = await linkIdentityToActor(config, claims);
  const sessionToken = await createWebSession(actorId, userAgent);
  if (!sessionToken)
    throw new Error("Your Domino household account is unavailable.");
  cookies.set(sessionCookieName, sessionToken, sessionCookieOptions());
  return safeReturnTo(flow.returnTo);
}

function sessionTtlSeconds() {
  const hours = Number(process.env.DOMINO_SESSION_TTL_HOURS ?? 168);
  return (
    Math.max(1, Math.min(Number.isFinite(hours) ? hours : 168, 24 * 90)) *
    60 *
    60
  );
}

async function linkIdentityToActor(config: OidcConfig, claims: IdentityClaims) {
  const database = requireDb();
  const email = claims.email.trim().toLowerCase();
  const displayName = (
    claims.name ||
    claims.preferred_username ||
    email.split("@")[0]
  ).trim();

  return database.transaction(async (tx) => {
    const [linked] = await tx
      .select({ userId: oidcIdentities.userId })
      .from(oidcIdentities)
      .where(
        and(
          eq(oidcIdentities.issuer, config.issuer),
          eq(oidcIdentities.subject, claims.sub!),
        ),
      )
      .limit(1);

    let userId = linked?.userId;
    if (!userId) {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      if (existingUser) {
        if (!config.linkExistingByEmail) {
          throw new Error(
            "An existing Domino account uses this email. An administrator must explicitly link its OIDC identity.",
          );
        }
        if (claims.email_verified !== true) {
          throw new Error(
            "A verified email address is required to link an existing Domino account.",
          );
        }
        userId = existingUser.id;
      } else {
        if (!config.autoProvision)
          throw new Error("Your account has not been provisioned in Domino.");
        const [createdUser] = await tx
          .insert(users)
          .values({ email, displayName })
          .returning({ id: users.id });
        userId = createdUser.id;
      }

      await tx.insert(oidcIdentities).values({
        userId,
        issuer: config.issuer,
        subject: claims.sub!,
        emailAtLogin: email,
        claims: {
          name: claims.name,
          preferred_username: claims.preferred_username,
          groups: claims.groups,
        },
      });
    } else {
      await tx
        .update(oidcIdentities)
        .set({
          emailAtLogin: email,
          claims: {
            name: claims.name,
            preferred_username: claims.preferred_username,
            groups: claims.groups,
          },
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(oidcIdentities.issuer, config.issuer),
            eq(oidcIdentities.subject, claims.sub!),
          ),
        );
    }

    const configuredHouseholdId = process.env.DOMINO_OIDC_HOUSEHOLD_ID;
    const actorConditions = [eq(actors.userId, userId)];
    if (configuredHouseholdId)
      actorConditions.push(eq(actors.householdId, configuredHouseholdId));
    const [existingActor] = await tx
      .select({ id: actors.id, disabled: actors.disabled })
      .from(actors)
      .where(and(...actorConditions))
      .limit(1);
    const existingActorId = resolveExistingActor(existingActor);
    if (existingActorId) return existingActorId;
    if (!config.autoProvision)
      throw new Error("Your account does not have household access.");

    const household = await resolveProvisioningHousehold(tx, email);
    if (household.bootstrapped && claims.email_verified !== true) {
      throw new Error(
        "A verified email address is required to bootstrap the first Domino owner.",
      );
    }
    const [createdActor] = await tx
      .insert(actors)
      .values({
        householdId: household.id,
        userId,
        kind: "user",
        name: displayName,
      })
      .returning({ id: actors.id });
    const assignedRoleName = household.bootstrapped
      ? "Owner"
      : config.defaultRole;
    const [defaultRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(
          eq(roles.householdId, household.id),
          sql`lower(${roles.name}) = ${assignedRoleName.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (!defaultRole) {
      throw new Error(
        `The configured role "${assignedRoleName}" does not exist in this household.`,
      );
    }
    await tx
      .insert(actorRoles)
      .values({ actorId: createdActor.id, roleId: defaultRole.id });
    return createdActor.id;
  });
}

export function resolveExistingActor(
  actor: { id: string; disabled: boolean } | undefined,
) {
  if (actor?.disabled)
    throw new Error("Your Domino household account is disabled.");
  return actor?.id ?? null;
}

type Transaction = Parameters<
  Parameters<ReturnType<typeof requireDb>["transaction"]>[0]
>[0];

async function resolveProvisioningHousehold(tx: Transaction, email: string) {
  if (process.env.DOMINO_OIDC_HOUSEHOLD_ID) {
    const [configured] = await tx
      .select({ id: households.id })
      .from(households)
      .where(eq(households.id, process.env.DOMINO_OIDC_HOUSEHOLD_ID))
      .limit(1);
    if (!configured)
      throw new Error("DOMINO_OIDC_HOUSEHOLD_ID does not match a household.");
    return { id: configured.id, bootstrapped: false };
  }

  const existing = await tx
    .select({ id: households.id })
    .from(households)
    .limit(2);
  if (existing.length === 1) return { id: existing[0].id, bootstrapped: false };
  if (existing.length > 1) {
    throw new Error(
      "DOMINO_OIDC_HOUSEHOLD_ID is required when more than one household exists.",
    );
  }

  const bootstrapEmail =
    process.env.DOMINO_OIDC_BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  if (!bootstrapEmail || bootstrapEmail !== email) {
    throw new Error(
      "No household exists. Set DOMINO_OIDC_BOOTSTRAP_OWNER_EMAIL to create the first owner.",
    );
  }

  const [household] = await tx
    .insert(households)
    .values({
      name: process.env.DOMINO_HOUSEHOLD_NAME?.trim() || "Home",
      slug: process.env.DOMINO_HOUSEHOLD_SLUG?.trim() || "home",
      defaultDocumentBackend: initialDocumentBackend(),
    })
    .returning({ id: households.id });
  await tx.insert(roles).values([
    {
      householdId: household.id,
      name: "Owner",
      description: roleTemplates.owner.description,
      permissions: roleTemplates.owner.permissions,
      system: true,
    },
    {
      householdId: household.id,
      name: "Member",
      description: roleTemplates.member.description,
      permissions: roleTemplates.member.permissions,
      system: true,
    },
    {
      householdId: household.id,
      name: "Agent Reader",
      description: roleTemplates["agent-reader"].description,
      permissions: roleTemplates["agent-reader"].permissions,
      system: true,
    },
    {
      householdId: household.id,
      name: "Claim Assistant",
      description: roleTemplates["claim-assistant"].description,
      permissions: roleTemplates["claim-assistant"].permissions,
      system: true,
    },
  ]);
  process.env.DOMINO_OIDC_HOUSEHOLD_ID = household.id;
  return { id: household.id, bootstrapped: true };
}

export async function createWebSession(
  actorId: string,
  userAgent: string | null,
  expectedAuthenticationVersion?: number,
) {
  const token = `domino_session_${randomBase64Url(48)}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const created = await requireDb().transaction(async (tx) => {
    const [account] = await tx
      .select({
        authenticationVersion: users.authenticationVersion,
        actorDisabled: actors.disabled,
        userDisabled: users.disabled,
      })
      .from(actors)
      .innerJoin(users, eq(actors.userId, users.id))
      .where(eq(actors.id, actorId))
      .for("update")
      .limit(1);
    if (
      !account ||
      account.actorDisabled ||
      account.userDisabled ||
      (expectedAuthenticationVersion !== undefined &&
        account.authenticationVersion !== expectedAuthenticationVersion)
    )
      return false;
    await tx.insert(webSessions).values({
      actorId,
      tokenHash,
      authenticationVersion: account.authenticationVersion,
      userAgentHash: userAgent
        ? createHash("sha256").update(userAgent).digest("hex")
        : null,
      expiresAt: new Date(Date.now() + sessionTtlSeconds() * 1000),
    });
    return true;
  });
  return created ? token : null;
}

export async function authenticateSessionToken(
  token: string | undefined,
): Promise<AuthenticatedActor | null> {
  if (!token) return null;
  const database = requireDb();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [record] = await database
    .select({
      sessionId: webSessions.id,
      actorId: actors.id,
      householdId: actors.householdId,
      kind: actors.kind,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(webSessions)
    .innerJoin(actors, eq(webSessions.actorId, actors.id))
    .innerJoin(users, eq(actors.userId, users.id))
    .where(
      and(
        eq(webSessions.tokenHash, tokenHash),
        eq(webSessions.authenticationVersion, users.authenticationVersion),
        isNull(webSessions.revokedAt),
        gt(webSessions.expiresAt, new Date()),
        eq(actors.disabled, false),
        eq(users.disabled, false),
      ),
    )
    .limit(1);
  if (!record) return null;

  const grants = await database
    .select({ permissions: roles.permissions })
    .from(actorRoles)
    .innerJoin(roles, eq(actorRoles.roleId, roles.id))
    .where(
      and(
        eq(actorRoles.actorId, record.actorId),
        eq(roles.householdId, record.householdId),
      ),
    );
  return {
    id: record.actorId,
    householdId: record.householdId,
    kind: record.kind,
    permissions: [...new Set(grants.flatMap((grant) => grant.permissions))],
    user: {
      id: record.userId,
      email: record.email,
      displayName: record.displayName,
    },
  };
}

export function readSessionCookie(request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === sessionCookieName) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export async function revokeWebSession(token: string | undefined) {
  if (!token) return;
  await requireDb()
    .update(webSessions)
    .set({ revokedAt: new Date() })
    .where(
      eq(
        webSessions.tokenHash,
        createHash("sha256").update(token).digest("hex"),
      ),
    );
}

export async function oidcLogoutUrl() {
  const config = getOidcConfig();
  if (!config) return null;
  const discovery = await discover(config);
  if (!discovery.end_session_endpoint) return null;
  const url = new URL(discovery.end_session_endpoint);
  url.searchParams.set(
    "post_logout_redirect_uri",
    new URL("/login", publicOrigin()).toString(),
  );
  return url;
}
