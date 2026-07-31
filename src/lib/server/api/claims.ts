import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { demoProducts } from "$lib/demo";
import { relatedReadAccess } from "../auth/authorization";
import { requireDb } from "../db";
import { auditEvents, claimEvents, notes } from "../db/schema";
import {
  createClaim,
  getClaimIdentity,
  getClaim,
  listClaimNotes,
  listClaims,
  updateClaim,
} from "../domain/claims";
import {
  getHouseholdProductIdentity,
  listProductNotes,
} from "../domain/products";
import {
  claimCreateInput,
  claimListQuery,
  claimUpdateInput,
  noteListQuery,
  noteInput,
} from "./claims.schemas";
import { idParamInput } from "./common.schemas";
import type { ApiEnv } from "./context";
import { requirePermission } from "./guards";

export const claimRoutes = new Hono<ApiEnv>()
  .post(
    "/v1/products/:id/notes",
    requirePermission("notes:write"),
    zValidator("param", idParamInput),
    zValidator("json", noteInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            note: {
              id: crypto.randomUUID(),
              productId: id,
              body: c.req.valid("json").body,
              createdAt: new Date().toISOString(),
            },
          },
          201,
        );
      }
      const database = requireDb();
      const product = await getHouseholdProductIdentity(
        database,
        c.get("actor").householdId,
        id,
      );
      if (!product) return c.json({ error: "Product not found" }, 404);
      const note = await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(notes)
          .values({
            householdId: c.get("actor").householdId,
            productId: id,
            authorActorId: c.get("actor").id,
            body: c.req.valid("json").body,
          })
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "note.create",
          resourceType: "note",
          resourceId: created.id,
          summary: `Added a note to ${product.name}`,
          metadata: { productId: id },
        });
        return created;
      });
      return c.json({ note }, 201);
    },
  )
  .get(
    "/v1/products/:id/notes",
    requirePermission("notes:read"),
    zValidator("param", idParamInput),
    zValidator("query", noteListQuery),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") return c.json({ notes: [] });
      const database = requireDb();
      const actor = c.get("actor");
      const productId = c.req.valid("param").id;
      const product = await getHouseholdProductIdentity(
        database,
        actor.householdId,
        productId,
      );
      if (!product) return c.json({ error: "Product not found" }, 404);
      const { limit, offset } = c.req.valid("query");
      const rows = await listProductNotes(
        database,
        actor.householdId,
        productId,
        actor.claimIds,
        { limit: limit + 1, offset },
      );
      return c.json({
        notes: rows.slice(0, limit),
        page: { limit, offset, hasMore: rows.length > limit },
      });
    },
  )
  .post(
    "/v1/products/:id/claims",
    requirePermission("claims:create"),
    zValidator("param", idParamInput),
    zValidator("json", claimCreateInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            claim: {
              id: crypto.randomUUID(),
              reference: `CLM-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
              productId: id,
              status: "draft" as const,
              ...c.req.valid("json"),
            },
          },
          201,
        );
      }
      const claim = await createClaim(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        c.req.valid("json"),
      );
      return claim
        ? c.json({ claim }, 201)
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .get(
    "/v1/claims",
    requirePermission("claims:read"),
    zValidator("query", claimListQuery),
    async (c) => {
      const { limit, offset } = c.req.valid("query");
      const claims =
        process.env.DOMINO_DEMO_MODE === "true"
          ? demoProducts
              .flatMap((product) =>
                product.activeClaim
                  ? [
                      {
                        ...product.activeClaim,
                        issue: product.activeClaim.summary,
                        productId: product.id,
                        product: {
                          name: product.name,
                          brand: product.brand,
                          model: product.model,
                        },
                      },
                    ]
                  : [],
              )
              .slice(offset, offset + limit + 1)
          : await listClaims(
              requireDb(),
              c.get("actor").householdId,
              c.get("actor").claimIds,
              { limit: limit + 1, offset },
            );
      return c.json({
        claims: claims.slice(0, limit),
        page: { limit, offset, hasMore: claims.length > limit },
      });
    },
  )
  .get(
    "/v1/claims/:id",
    requirePermission("claims:read"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const relatedAccess = relatedReadAccess(c.get("actor"));
      if (process.env.DOMINO_DEMO_MODE === "true") {
        const claim = demoProducts
          .flatMap((product) =>
            product.activeClaim
              ? [
                  {
                    ...product.activeClaim,
                    issue: product.activeClaim.summary,
                    productId: product.id,
                    product: {
                      name: product.name,
                      brand: product.brand,
                      model: product.model,
                    },
                  },
                ]
              : [],
          )
          .find((item) => item.id === id);
        return claim
          ? c.json({ claim })
          : c.json({ error: "Claim not found" }, 404);
      }
      const claim = await getClaim(
        requireDb(),
        c.get("actor").householdId,
        id,
        {
          documents: relatedAccess.documents,
          notes: relatedAccess.notes,
        },
        c.get("actor").claimIds,
      );
      return claim
        ? c.json({ claim })
        : c.json({ error: "Claim not found" }, 404);
    },
  )
  .get(
    "/v1/claims/:id/notes",
    requirePermission("notes:read"),
    zValidator("param", idParamInput),
    zValidator("query", noteListQuery),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") return c.json({ notes: [] });
      const database = requireDb();
      const actor = c.get("actor");
      const claimId = c.req.valid("param").id;
      const claim = await getClaimIdentity(
        database,
        actor.householdId,
        claimId,
        actor.claimIds,
      );
      if (!claim) return c.json({ error: "Claim not found" }, 404);
      const { limit, offset } = c.req.valid("query");
      const rows = await listClaimNotes(database, actor.householdId, claimId, {
        limit: limit + 1,
        offset,
      });
      return c.json({
        notes: rows.slice(0, limit),
        page: { limit, offset, hasMore: rows.length > limit },
      });
    },
  )
  .post(
    "/v1/claims/:id/notes",
    requirePermission("notes:write"),
    zValidator("param", idParamInput),
    zValidator("json", noteInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            note: {
              id: crypto.randomUUID(),
              claimId: id,
              body: c.req.valid("json").body,
              createdAt: new Date().toISOString(),
            },
          },
          201,
        );
      }
      const database = requireDb();
      const claim = await getClaimIdentity(
        database,
        c.get("actor").householdId,
        id,
        c.get("actor").claimIds,
      );
      if (!claim) return c.json({ error: "Claim not found" }, 404);
      const note = await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(notes)
          .values({
            householdId: c.get("actor").householdId,
            claimId: claim.id,
            productId: claim.productId,
            authorActorId: c.get("actor").id,
            body: c.req.valid("json").body,
          })
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "claim.note.create",
          resourceType: "note",
          resourceId: created.id,
          summary: `Added a note to ${claim.reference}`,
          metadata: { claimId: claim.id, productId: claim.productId },
        });
        await tx.insert(claimEvents).values({
          claimId: claim.id,
          actorId: c.get("actor").id,
          eventType: "note_added",
          title: "Claim note added",
          detail: c.req.valid("json").body,
          metadata: { noteId: created.id },
        });
        return created;
      });
      return c.json({ note }, 201);
    },
  )
  .patch(
    "/v1/claims/:id",
    requirePermission("claims:manage"),
    zValidator("param", idParamInput),
    zValidator("json", claimUpdateInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      if (c.get("actor").claimIds && !c.get("actor").claimIds!.includes(id)) {
        return c.json({ error: "Claim not found" }, 404);
      }
      if (input.status === "resolved" && !input.resolution?.trim()) {
        if (process.env.DOMINO_DEMO_MODE === "true") {
          return c.json(
            { error: "A resolution is required before resolving a claim." },
            400,
          );
        }
        const existing = await getClaimIdentity(
          requireDb(),
          c.get("actor").householdId,
          id,
          c.get("actor").claimIds,
        );
        if (!existing) return c.json({ error: "Claim not found" }, 404);
        if (!existing.resolution?.trim()) {
          return c.json(
            { error: "A resolution is required before resolving a claim." },
            400,
          );
        }
      }
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          claim: {
            id,
            ...input,
            updatedAt: new Date().toISOString(),
          },
        });
      }
      const claim = await updateClaim(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        input,
      );
      return claim
        ? c.json({ claim })
        : c.json({ error: "Claim not found" }, 404);
    },
  );
