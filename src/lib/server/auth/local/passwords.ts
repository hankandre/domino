import { hash, verify } from "@node-rs/argon2";
import { and, eq, sql } from "drizzle-orm";
import { requireDb } from "../../db";
import { actors, users } from "../../db/schema";
import { createWebSession } from "../oidc";

const loginWindowMs = 15 * 60_000;
const maxTrackedLoginKeys = 10_000;
const perIdentityAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();
let globalAttempts = { count: 0, resetAt: 0 };
let activePasswordVerifications = 0;
const passwordVerificationQueue: Array<() => void> = [];

function consumeAttempt(
  attempts: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  now: number,
) {
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    if (record) attempts.delete(key);
    if (attempts.size >= maxTrackedLoginKeys) {
      for (const [trackedKey, trackedRecord] of attempts) {
        if (trackedRecord.resetAt <= now) attempts.delete(trackedKey);
      }
    }
    while (attempts.size >= maxTrackedLoginKeys) {
      const oldest = attempts.keys().next().value;
      if (!oldest) break;
      attempts.delete(oldest);
    }
    attempts.set(key, { count: 1, resetAt: now + loginWindowMs });
    return true;
  }
  if (record.count >= limit) return false;
  record.count += 1;
  return true;
}

export function consumeLoginAttempt(address: string, email: string) {
  const now = Date.now();
  const normalizedAddress = address.slice(0, 128);
  const normalizedEmail = email.trim().toLowerCase().slice(0, 254);
  if (
    !consumeAttempt(
      perIdentityAttempts,
      `${normalizedAddress}:${normalizedEmail}`,
      10,
      now,
    )
  )
    return false;
  if (globalAttempts.resetAt <= now) {
    globalAttempts = { count: 0, resetAt: now + 60_000 };
  }
  if (globalAttempts.count >= 240) return false;
  globalAttempts.count += 1;
  return true;
}

async function withPasswordVerificationSlot<T>(
  operation: () => Promise<T>,
): Promise<T | null> {
  if (activePasswordVerifications >= 4) {
    if (passwordVerificationQueue.length >= 32) return null;
    await new Promise<void>((resolve) =>
      passwordVerificationQueue.push(resolve),
    );
  }
  activePasswordVerifications += 1;
  try {
    return await operation();
  } finally {
    activePasswordVerifications -= 1;
    passwordVerificationQueue.shift()?.();
  }
}

export async function hashPassword(password: string) {
  const passwordHash = await withPasswordVerificationSlot(() =>
    hash(password, {
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    }),
  );
  if (!passwordHash)
    throw new Error("Password service is busy. Try again shortly.");
  return passwordHash;
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
      authenticationVersion: users.authenticationVersion,
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
  const valid = await withPasswordVerificationSlot(() =>
    verify(comparisonHash, password).catch(() => false),
  );
  if (!account?.passwordHash || !valid) return null;
  return createWebSession(
    account.actorId,
    userAgent,
    account.authenticationVersion,
  );
}
