import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { requireDb } from "../../db";
import {
  actors,
  auditEvents,
  passwordResetTokens,
  users,
  webSessions,
} from "../../db/schema";
import {
  canAdministerUserIdentity,
  claimAuthority,
  loadActorAuthority,
} from "../authorization";
import { hashPassword } from "./passwords";
import { createOneTimeToken, resetTokenPattern } from "./tokens";

export async function createPasswordReset(
  userId: string,
  createdByActorId: string,
  householdId: string,
) {
  const { token, tokenHash } = createOneTimeToken("domino_reset");
  const database = requireDb();
  const authorized = await database.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!targetUser) return false;

    const targetActors = await tx
      .select({
        id: actors.id,
        householdId: actors.householdId,
        claimAccessScope: actors.claimAccessScope,
      })
      .from(actors)
      .where(eq(actors.userId, userId))
      .for("update");
    if (targetActors.length === 0) return false;

    const creator = await loadActorAuthority(
      tx,
      createdByActorId,
      householdId,
      { lock: true },
    );
    if (
      !creator ||
      (!creator.permissions.includes("*") &&
        !creator.permissions.includes("household:manage"))
    ) {
      return false;
    }
    const targetAuthorities = [];
    for (const targetActor of targetActors) {
      const authority = await loadActorAuthority(
        tx,
        targetActor.id,
        targetActor.householdId,
        { kind: "user", lock: true, includeDisabled: true },
      );
      if (!authority) return false;
      targetAuthorities.push({
        householdId: targetActor.householdId,
        permissions: authority.permissions,
        ...claimAuthority(authority.claimAccessScope, authority.claimIds),
      });
    }
    if (!canAdministerUserIdentity(creator, householdId, targetAuthorities)) {
      return false;
    }

    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.consumedAt),
        ),
      );
    const [reset] = await tx
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash,
        createdByActorId,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      })
      .returning({ id: passwordResetTokens.id });
    await tx.insert(auditEvents).values({
      householdId,
      actorId: createdByActorId,
      action: "person.password_reset.issue",
      resourceType: "password_reset",
      resourceId: reset.id,
      summary: "Issued a password-reset link",
      metadata: { userId },
    });
    return true;
  });
  return authorized ? token : null;
}

export async function inspectPasswordReset(token: string) {
  if (!resetTokenPattern.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [reset] = await requireDb()
    .select({ email: users.email, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return reset ?? null;
}

export async function resetPassword(token: string, password: string) {
  const database = requireDb();
  if (!resetTokenPattern.test(token)) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  if (!(await inspectPasswordReset(token))) return false;
  const passwordHash = await hashPassword(password);
  return database.transaction(async (tx) => {
    const [reset] = await tx
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .for("update")
      .limit(1);
    if (!reset) return false;
    const consumeReset = async () => {
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(passwordResetTokens.id, reset.id));
      return false;
    };
    if (!reset.createdByActorId) return consumeReset();
    const [creatorMembership] = await tx
      .select({ householdId: actors.householdId })
      .from(actors)
      .where(eq(actors.id, reset.createdByActorId))
      .for("update")
      .limit(1);
    if (!creatorMembership) return consumeReset();
    const creator = await loadActorAuthority(
      tx,
      reset.createdByActorId,
      creatorMembership.householdId,
      { lock: true },
    );
    if (
      !creator ||
      (!creator.permissions.includes("*") &&
        !creator.permissions.includes("household:manage"))
    ) {
      return consumeReset();
    }
    const userActors = await tx
      .select({
        id: actors.id,
        householdId: actors.householdId,
        claimAccessScope: actors.claimAccessScope,
      })
      .from(actors)
      .where(eq(actors.userId, reset.userId))
      .for("update");
    const targetAuthorities = [];
    for (const actor of userActors) {
      const authority = await loadActorAuthority(
        tx,
        actor.id,
        actor.householdId,
        { kind: "user", lock: true, includeDisabled: true },
      );
      if (!authority) return consumeReset();
      targetAuthorities.push({
        householdId: actor.householdId,
        permissions: authority.permissions,
        ...claimAuthority(authority.claimAccessScope, authority.claimIds),
      });
    }
    if (
      !canAdministerUserIdentity(
        creator,
        creatorMembership.householdId,
        targetAuthorities,
      )
    ) {
      return consumeReset();
    }
    await tx
      .update(users)
      .set({
        passwordHash,
        authenticationVersion: sql`${users.authenticationVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, reset.userId));
    if (userActors.length) {
      await tx
        .update(webSessions)
        .set({ revokedAt: new Date() })
        .where(
          inArray(
            webSessions.actorId,
            userActors.map((actor) => actor.id),
          ),
        );
    }
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, reset.userId),
          isNull(passwordResetTokens.consumedAt),
        ),
      );
    for (const actor of userActors) {
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        actorId: actor.id,
        action: "person.password_reset.complete",
        resourceType: "actor",
        resourceId: actor.id,
        summary: "Completed a password reset and revoked active sessions",
      });
    }
    return true;
  });
}
