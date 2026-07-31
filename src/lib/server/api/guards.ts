import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { can, type Permission } from "../auth/permissions";
import { requireDb } from "../db";
import { documents } from "../db/schema";
import { consumeRateLimit } from "../rate-limit";
import type { ApiActor, ApiEnv } from "./context";

export function requirePermission(
  permission: Permission,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const actor = c.get("actor");
    if (
      !actor ||
      (!actor.permissions.includes("*") && !can(actor.permissions, permission))
    ) {
      return c.json({ error: `Missing permission: ${permission}` }, 403);
    }
    await next();
  };
}

export function requireAnyPermission(
  required: Permission[],
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const actor = c.get("actor");
    if (
      !actor ||
      (!actor.permissions.includes("*") &&
        !required.some((permission) => can(actor.permissions, permission)))
    ) {
      return c.json({ error: `Missing one of: ${required.join(", ")}` }, 403);
    }
    await next();
  };
}

export function canAccessClaim(actor: ApiActor, claimId: string | undefined) {
  return (
    !claimId || actor.claimIds === undefined || actor.claimIds.includes(claimId)
  );
}

export async function canAccessDocument(actor: ApiActor, documentId: string) {
  const [document] = await requireDb()
    .select({ claimId: documents.claimId })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.householdId, actor.householdId),
      ),
    )
    .limit(1);
  return Boolean(
    document && canAccessClaim(actor, document.claimId ?? undefined),
  );
}

export function actorHasAny(actor: ApiActor, required: Permission[]) {
  return (
    actor.permissions.includes("*") ||
    required.some((permission) => can(actor.permissions, permission))
  );
}

export function duplicateDisclosure(
  actor: ApiActor,
  matches: Array<{ productId: string; name: string; reasons: string[] }>,
) {
  if (actorHasAny(actor, ["products:read", "products:manage"])) return matches;
  return matches.map(({ reasons }) => ({ reasons }));
}

export function rateLimit(
  namespace: string,
  limit: number,
  windowMs: number,
  key: "actor" | "address" = "actor",
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const bucketKey =
      key === "actor"
        ? (c.get("actor")?.id ?? "anonymous")
        : (c.req.header("x-domino-client-address") ?? "direct");
    const result = consumeRateLimit(namespace, bucketKey, limit, windowMs);
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(result.remaining));
    c.header("RateLimit-Reset", String(Math.ceil(result.resetAt / 1_000)));
    if (!result.allowed) {
      c.header(
        "Retry-After",
        String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000))),
      );
      return c.json({ error: "Too many requests. Try again later." }, 429);
    }
    await next();
  };
}

export function rejectDeclaredBodyOver(
  maximumBytes: number,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const value = c.req.header("content-length");
    if (value !== undefined) {
      const length = Number(value);
      if (!Number.isSafeInteger(length) || length < 0) {
        return c.json({ error: "Content-Length is invalid." }, 400);
      }
      if (length > maximumBytes) {
        return c.json({ error: "Request body is too large." }, 413);
      }
    }
    await next();
  };
}
