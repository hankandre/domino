import { zValidator } from "@hono/zod-validator";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import {
  canAdministerActorAuthority,
  loadActorAuthority,
} from "../auth/authorization";
import { requireDb } from "../db";
import {
  actors,
  apiCredentials,
  auditEvents,
  documents,
  notes,
} from "../db/schema";
import { idParamInput } from "./common.schemas";
import type { ApiEnv } from "./context";
import { requirePermission } from "./guards";
import { auditQuery } from "./identity.schemas";

function redactClaimMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactClaimMetadata);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.toLowerCase().includes("claim"))
      .map(([key, item]) => [key, redactClaimMetadata(item)]),
  );
}

export const identityRoutes = new Hono<ApiEnv>()
  .get("/v1/me", (c) => c.json({ actor: c.get("actor") }))
  .get(
    "/v1/audit",
    requirePermission("audit:read"),
    zValidator("query", auditQuery),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ events: [] });
      }
      const actor = c.get("actor");
      const claimIds = actor.claimIds;
      const claimScope =
        claimIds === undefined
          ? undefined
          : or(
              and(
                eq(auditEvents.resourceType, "claim"),
                claimIds.length
                  ? inArray(auditEvents.resourceId, claimIds)
                  : sql`false`,
              ),
              and(
                eq(auditEvents.resourceType, "note"),
                sql`exists (
                  select 1 from ${notes}
                  where ${notes.id}::text = ${auditEvents.resourceId}
                    and ${
                      claimIds.length
                        ? or(
                            isNull(notes.claimId),
                            inArray(notes.claimId, claimIds),
                          )
                        : isNull(notes.claimId)
                    }
                )`,
              ),
              and(
                eq(auditEvents.resourceType, "document"),
                sql`exists (
                  select 1 from ${documents}
                  where ${documents.id}::text = ${auditEvents.resourceId}
                    and ${
                      claimIds.length
                        ? or(
                            isNull(documents.claimId),
                            inArray(documents.claimId, claimIds),
                          )
                        : isNull(documents.claimId)
                    }
                )`,
              ),
              notInArray(auditEvents.resourceType, [
                "claim",
                "note",
                "document",
              ]),
            );
      const events = await requireDb()
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          resourceType: auditEvents.resourceType,
          resourceId: auditEvents.resourceId,
          summary: auditEvents.summary,
          metadata: auditEvents.metadata,
          createdAt: auditEvents.createdAt,
          actorName: actors.name,
        })
        .from(auditEvents)
        .leftJoin(actors, eq(auditEvents.actorId, actors.id))
        .where(and(eq(auditEvents.householdId, actor.householdId), claimScope))
        .orderBy(desc(auditEvents.createdAt))
        .limit(c.req.valid("query").limit + 1)
        .offset(c.req.valid("query").offset);
      const { limit, offset } = c.req.valid("query");
      return c.json({
        events: events.slice(0, limit).map((event) => ({
          ...event,
          summary:
            claimIds !== undefined &&
            event.action === "account.claim_access.update"
              ? "Updated account claim access"
              : event.summary,
          metadata:
            claimIds === undefined
              ? event.metadata
              : event.action === "account.claim_access.update"
                ? {}
                : redactClaimMetadata(event.metadata),
        })),
        page: { limit, offset, hasMore: events.length > limit },
      });
    },
  )
  .delete(
    "/v1/service-accounts/:id",
    requirePermission("service_accounts:manage"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const approvingActor = c.get("actor");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          revoked: true,
          actorId: id,
          demo: true,
        });
      }

      const database = requireDb();
      const result = await database.transaction(async (tx) => {
        const manager = await loadActorAuthority(
          tx,
          approvingActor.id,
          approvingActor.householdId,
          { lock: true },
        );
        if (
          !manager ||
          (!manager.permissions.includes("*") &&
            !manager.permissions.includes("service_accounts:manage"))
        ) {
          return "forbidden" as const;
        }
        const serviceActor = await loadActorAuthority(
          tx,
          id,
          approvingActor.householdId,
          { kind: "service", lock: true, includeDisabled: true },
        );
        if (!serviceActor) return "not-found" as const;
        if (!canAdministerActorAuthority(manager, serviceActor)) {
          return "forbidden" as const;
        }
        await tx
          .update(apiCredentials)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(apiCredentials.actorId, serviceActor.id),
              isNull(apiCredentials.revokedAt),
            ),
          );
        await tx
          .update(actors)
          .set({ disabled: true, updatedAt: new Date() })
          .where(eq(actors.id, serviceActor.id));
        await tx.insert(auditEvents).values({
          householdId: approvingActor.householdId,
          actorId: approvingActor.id,
          action: "service_account.revoke",
          resourceType: "actor",
          resourceId: serviceActor.id,
          summary: `Revoked service account ${serviceActor.name}`,
        });
        return "revoked" as const;
      });
      if (result === "not-found")
        return c.json({ error: "Service account not found" }, 404);
      if (result === "forbidden")
        return c.json(
          { error: "Cannot revoke an account with broader authority." },
          403,
        );
      return c.json({ revoked: true, actorId: id });
    },
  );
