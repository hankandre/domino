import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  actorRoles,
  actors,
  auditEvents,
  passwordResetTokens,
  roles,
  userInvitations,
  users,
  webSessions,
} from "../db/schema";
import { requireDb } from "../db";
import { createWebSession } from "./oidc";

const attempts = new Map<string, { count: number; resetAt: number }>();

export function consumeLoginAttempt(key: string) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  if (record.count >= 10) return false;
  record.count += 1;
  return true;
}

export async function hashPassword(password: string) {
  return hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function loginWithPassword(
  email: string,
  password: string,
  userAgent: string | null,
) {
  const database = requireDb();
  const normalizedEmail = email.trim().toLowerCase();
  const [account] = await database
    .select({
      userId: users.id,
      passwordHash: users.passwordHash,
      actorId: actors.id,
    })
    .from(users)
    .innerJoin(actors, eq(actors.userId, users.id))
    .where(
      and(
        sql`lower(${users.email}) = ${normalizedEmail}`,
        eq(users.disabled, false),
        eq(actors.disabled, false),
        eq(actors.kind, "user"),
      ),
    )
    .limit(1);

  // Always perform a costly verification to avoid leaking account existence.
  const comparisonHash =
    account?.passwordHash ??
    "$argon2id$v=19$m=19456,t=2,p=1$bm90LXJlYWwtc2FsdC0xMjM0NTY$TVmHbcTWcOcU0xQ2+f1KFkMyDgGvOLR6B9F+W/TZS5o";
  const valid = await verify(comparisonHash, password).catch(() => false);
  if (!account?.passwordHash || !valid) return null;
  return createWebSession(account.actorId, userAgent);
}

function createOneTimeToken(prefix: string) {
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}

export async function createInvitation(
  householdId: string,
  invitedByActorId: string,
  input: {
    email: string;
    displayName?: string;
    roleId: string;
    expiresInHours?: number;
  },
) {
  const database = requireDb();
  const normalizedEmail = input.email.trim().toLowerCase();
  const [role] = await database
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, input.roleId), eq(roles.householdId, householdId)))
    .limit(1);
  if (!role) return null;

  const { token, tokenHash } = createOneTimeToken("domino_invite");
  const expiresInHours = Math.max(
    1,
    Math.min(input.expiresInHours ?? 72, 24 * 30),
  );
  const invitation = await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(userInvitations)
      .values({
        householdId,
        email: normalizedEmail,
        displayName: input.displayName?.trim() || null,
        roleId: role.id,
        tokenHash,
        invitedByActorId,
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60_000),
      })
      .returning();
    await tx.insert(auditEvents).values({
      householdId,
      actorId: invitedByActorId,
      action: "person.invite",
      resourceType: "invitation",
      resourceId: created.id,
      summary: `Invited ${normalizedEmail}`,
      metadata: { roleId: role.id },
    });
    return created;
  });
  return { invitation, token };
}

export async function inspectInvitation(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invitation] = await requireDb()
    .select({
      id: userInvitations.id,
      email: userInvitations.email,
      displayName: userInvitations.displayName,
      expiresAt: userInvitations.expiresAt,
      householdName: sql<string>`(select name from households where id = ${userInvitations.householdId})`,
    })
    .from(userInvitations)
    .where(
      and(
        eq(userInvitations.tokenHash, tokenHash),
        isNull(userInvitations.acceptedAt),
        isNull(userInvitations.revokedAt),
        gt(userInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invitation ?? null;
}

export async function acceptInvitation(
  token: string,
  displayName: string,
  password: string,
  userAgent: string | null,
) {
  const database = requireDb();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const passwordHash = await hashPassword(password);
  const actorId = await database.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.tokenHash, tokenHash),
          isNull(userInvitations.acceptedAt),
          isNull(userInvitations.revokedAt),
          gt(userInvitations.expiresAt, new Date()),
        ),
      )
      .for("update")
      .limit(1);
    if (!invitation) return null;

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${invitation.email}`)
      .limit(1);
    if (existing) throw new Error("An account with this email already exists.");

    const [user] = await tx
      .insert(users)
      .values({
        email: invitation.email,
        displayName: displayName.trim(),
        passwordHash,
      })
      .returning({ id: users.id });
    const [actor] = await tx
      .insert(actors)
      .values({
        householdId: invitation.householdId,
        userId: user.id,
        kind: "user",
        name: displayName.trim(),
      })
      .returning({ id: actors.id });
    await tx.insert(actorRoles).values({
      actorId: actor.id,
      roleId: invitation.roleId,
      grantedByActorId: invitation.invitedByActorId,
    });
    await tx
      .update(userInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(userInvitations.id, invitation.id));
    await tx.insert(auditEvents).values({
      householdId: invitation.householdId,
      actorId: actor.id,
      action: "person.invite.accept",
      resourceType: "actor",
      resourceId: actor.id,
      summary: `Accepted invitation for ${invitation.email}`,
    });
    return actor.id;
  });
  return actorId ? createWebSession(actorId, userAgent) : null;
}

export async function createPasswordReset(
  userId: string,
  createdByActorId: string,
) {
  const { token, tokenHash } = createOneTimeToken("domino_reset");
  const database = requireDb();
  await database.transaction(async (tx) => {
    const [creator] = await tx
      .select({ householdId: actors.householdId })
      .from(actors)
      .where(eq(actors.id, createdByActorId))
      .limit(1);
    const [reset] = await tx
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash,
        createdByActorId,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      })
      .returning({ id: passwordResetTokens.id });
    if (creator) {
      await tx.insert(auditEvents).values({
        householdId: creator.householdId,
        actorId: createdByActorId,
        action: "person.password_reset.issue",
        resourceType: "password_reset",
        resourceId: reset.id,
        summary: "Issued a password-reset link",
        metadata: { userId },
      });
    }
  });
  return token;
}

export async function inspectPasswordReset(token: string) {
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
  const tokenHash = createHash("sha256").update(token).digest("hex");
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
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, reset.userId));
    const userActors = await tx
      .select({ id: actors.id, householdId: actors.householdId })
      .from(actors)
      .where(eq(actors.userId, reset.userId));
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
      .where(eq(passwordResetTokens.id, reset.id));
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
