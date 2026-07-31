import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { requireDb } from "../../db";
import {
  actorClaimAccess,
  actorRoles,
  actors,
  roles,
  users,
  webSessions,
} from "../../db/schema";
import { claimAuthority } from "../authorization";
import {
  randomBase64Url,
  sessionCookieName,
  sessionTtlSeconds,
} from "./config";
import type { AuthenticatedActor } from "./types";

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
      claimAccessScope: actors.claimAccessScope,
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
  const claimIds =
    record.claimAccessScope === "selected"
      ? (
          await database
            .select({ claimId: actorClaimAccess.claimId })
            .from(actorClaimAccess)
            .where(eq(actorClaimAccess.actorId, record.actorId))
        ).map((item) => item.claimId)
      : undefined;
  return {
    id: record.actorId,
    householdId: record.householdId,
    kind: record.kind,
    permissions: [...new Set(grants.flatMap((grant) => grant.permissions))],
    ...claimAuthority(record.claimAccessScope, claimIds),
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
