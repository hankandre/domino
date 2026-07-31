import { createHash } from "node:crypto";
import type { Cookies } from "@sveltejs/kit";
import {
  createRemoteJWKSet,
  EncryptJWT,
  jwtDecrypt,
  jwtVerify,
  type JWTPayload,
} from "jose";
import {
  discover,
  equalSecrets,
  flowCookieName,
  getOidcConfig,
  groupsAreAllowed,
  randomBase64Url,
  redirectUri,
  safeReturnTo,
  sessionCookieName,
  sessionCookieOptions,
  secretKey,
  type OidcFlow,
} from "./config";
import { linkIdentityToActor } from "./provisioning";
import { createWebSession } from "./sessions";
import type { IdentityClaims } from "./types";

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
