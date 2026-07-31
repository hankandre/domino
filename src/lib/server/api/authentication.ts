import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { claimAuthority } from "../auth/authorization";
import { authenticateSessionToken, readSessionCookie } from "../auth/oidc";
import { requireDb } from "../db";
import {
  actorClaimAccess,
  actorRoles,
  actors,
  apiCredentials,
  roles,
} from "../db/schema";
import type { ApiActor, ApiEnv } from "./context";
import { issuedTokens, pruneDemoCredentials } from "./device-store";

async function authenticateApiCredential(
  tokenHash: string,
): Promise<ApiActor | null> {
  const database = requireDb();
  const [credential] = await database
    .select({
      credentialId: apiCredentials.id,
      actorId: actors.id,
      householdId: actors.householdId,
      kind: actors.kind,
      claimAccessScope: actors.claimAccessScope,
      lastUsedAt: apiCredentials.lastUsedAt,
    })
    .from(apiCredentials)
    .innerJoin(actors, eq(apiCredentials.actorId, actors.id))
    .where(
      and(
        eq(apiCredentials.tokenHash, tokenHash),
        isNull(apiCredentials.revokedAt),
        or(
          isNull(apiCredentials.expiresAt),
          gt(apiCredentials.expiresAt, new Date()),
        ),
        eq(actors.disabled, false),
      ),
    )
    .limit(1);
  if (!credential) return null;

  const grants = await database
    .select({ permissions: roles.permissions })
    .from(actorRoles)
    .innerJoin(roles, eq(actorRoles.roleId, roles.id))
    .where(
      and(
        eq(actorRoles.actorId, credential.actorId),
        eq(roles.householdId, credential.householdId),
      ),
    );
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  if (!credential.lastUsedAt || credential.lastUsedAt < staleBefore) {
    await database
      .update(apiCredentials)
      .set({ lastUsedAt: now, updatedAt: now })
      .where(
        and(
          eq(apiCredentials.id, credential.credentialId),
          or(
            isNull(apiCredentials.lastUsedAt),
            lt(apiCredentials.lastUsedAt, staleBefore),
          ),
        ),
      );
  }
  const claimIds =
    credential.claimAccessScope === "selected"
      ? (
          await database
            .select({ claimId: actorClaimAccess.claimId })
            .from(actorClaimAccess)
            .where(eq(actorClaimAccess.actorId, credential.actorId))
        ).map((item) => item.claimId)
      : undefined;
  return {
    id: credential.actorId,
    householdId: credential.householdId,
    kind: credential.kind,
    permissions: [...new Set(grants.flatMap((grant) => grant.permissions))],
    ...claimAuthority(credential.claimAccessScope, claimIds),
  };
}

export const apiAuthentication: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const authorization = c.req.header("authorization");
  const demoMode = process.env.DOMINO_DEMO_MODE === "true";

  if (demoMode && !authorization) {
    c.set("actor", {
      id: "demo-owner",
      householdId: "demo-household",
      kind: "user",
      permissions: ["*"],
      ...claimAuthority("all"),
    });
    return next();
  }

  if (!authorization) {
    const sessionActor = await authenticateSessionToken(
      readSessionCookie(c.req.raw),
    );
    if (sessionActor) {
      if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
        const requestOrigin = c.req.header("origin");
        const expectedOrigin = new URL(
          process.env.ORIGIN ?? process.env.DOMINO_ORIGIN ?? c.req.url,
        ).origin;
        if (!requestOrigin || requestOrigin !== expectedOrigin) {
          return c.json(
            { error: "Browser mutations require a same-origin request" },
            403,
          );
        }
      }
      c.set("actor", sessionActor);
      return next();
    }
  }

  if (!authorization?.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const token = authorization.slice(7);
  if (token.length < 24) return c.json({ error: "Invalid credential" }, 401);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  pruneDemoCredentials();
  const issuedActor = issuedTokens.get(tokenHash);
  if (issuedActor) {
    c.set("actor", issuedActor.actor);
    return next();
  }

  if (!demoMode) {
    const persistedActor = await authenticateApiCredential(tokenHash);
    if (persistedActor) {
      c.set("actor", persistedActor);
      return next();
    }
  }

  return c.json({ error: "Credential is unknown or revoked" }, 401);
};
