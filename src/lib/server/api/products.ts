import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { demoProducts } from "$lib/demo";
import { relatedReadAccess } from "../auth/authorization";
import { requireDb } from "../db";
import { auditEvents, products, warranties } from "../db/schema";
import {
  createProduct,
  getProductDetail,
  listProductSummaries,
  projectProductRelatedData,
  setProductArchived,
  updateProduct,
  updateProductRecord,
} from "../domain/products";
import { MAX_SEARCH_CANDIDATES } from "../pagination";
import { searchProducts } from "../search";
import { idParamInput } from "./common.schemas";
import type { ApiEnv } from "./context";
import { actorHasAny, rateLimit, requireAnyPermission } from "./guards";
import {
  productInput,
  productRecordUpdateInput,
  productUpdateInput,
  searchQuery,
  warrantyInput,
  warrantyUpdateInput,
} from "./products.schemas";

export const productRoutes = new Hono<ApiEnv>()
  .get(
    "/v1/products",
    requireAnyPermission(["products:read", "warranties:read"]),
    rateLimit("product-search", 240, 60_000),
    zValidator("query", searchQuery),
    async (c) => {
      const query = c.req.valid("query");
      const access = relatedReadAccess(c.get("actor"));
      const sourceRows =
        process.env.DOMINO_DEMO_MODE === "true"
          ? demoProducts.map((product) =>
              projectProductRelatedData(product, access),
            )
          : await listProductSummaries(
              requireDb(),
              c.get("actor").householdId,
              query.includeArchived === "true",
              access,
              { limit: MAX_SEARCH_CANDIDATES + 1 },
            );
      const candidatesTruncated = sourceRows.length > MAX_SEARCH_CANDIDATES;
      const matches = searchProducts(
        sourceRows.slice(0, MAX_SEARCH_CANDIDATES),
        {
          query: query.q,
          coverage: query.coverage,
          hasClaim: query.hasClaim ? query.hasClaim === "true" : undefined,
          purchasedAfter: query.purchasedAfter,
          purchasedBefore: query.purchasedBefore,
          expiresAfter: query.expiresAfter,
          expiresBefore: query.expiresBefore,
        },
      );
      const products = matches.slice(query.offset, query.offset + query.limit);
      return c.json({
        products,
        total: matches.length,
        totalIsExact: !candidatesTruncated,
        page: {
          limit: query.limit,
          offset: query.offset,
          hasMore:
            products.length === query.limit &&
            (query.offset + products.length < matches.length ||
              candidatesTruncated),
        },
      });
    },
  )
  .get(
    "/v1/products/:id",
    requireAnyPermission(["products:read", "warranties:read"]),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const access = relatedReadAccess(c.get("actor"));
      const product =
        process.env.DOMINO_DEMO_MODE === "true"
          ? demoProducts
              .map((item) => projectProductRelatedData(item, access))
              .find((item) => item.id === id)
          : await getProductDetail(
              requireDb(),
              c.get("actor").householdId,
              id,
              access,
            );
      return product
        ? c.json({ product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .post(
    "/v1/products",
    requireAnyPermission(["products:create", "warranties:write"]),
    zValidator("json", productInput),
    async (c) => {
      const input = c.req.valid("json");
      if (
        input.warranty &&
        !actorHasAny(c.get("actor"), ["warranties:create", "warranties:write"])
      ) {
        return c.json({ error: "Missing permission: warranties:create" }, 403);
      }
      if (
        input.notes?.trim() &&
        !actorHasAny(c.get("actor"), ["notes:write", "warranties:write"])
      ) {
        return c.json({ error: "Missing permission: notes:write" }, 403);
      }
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ product: { id: crypto.randomUUID(), ...input } }, 201);
      }
      const product = await createProduct(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        {
          ...input,
          warranty:
            input.warranty ??
            (input.warrantyEndsAt !== undefined
              ? { endsAt: input.warrantyEndsAt }
              : undefined),
        },
      );
      return c.json({ product }, 201);
    },
  )
  .patch(
    "/v1/products/:id",
    requireAnyPermission(["products:manage", "warranties:write"]),
    zValidator("param", idParamInput),
    zValidator("json", productUpdateInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          product: { id, ...c.req.valid("json") },
        });
      }
      const product = await updateProduct(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        c.req.valid("json"),
      );
      return product
        ? c.json({ product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .patch(
    "/v1/products/:id/record",
    requireAnyPermission(["products:manage", "warranties:write"]),
    zValidator("param", idParamInput),
    zValidator("json", productRecordUpdateInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      if (
        input.warranty &&
        !actorHasAny(c.get("actor"), ["warranties:manage", "warranties:write"])
      ) {
        return c.json({ error: "Missing permission: warranties:manage" }, 403);
      }
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          product: { id, ...input.product },
          warranty: input.warranty ?? null,
        });
      }
      const result = await updateProductRecord(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        input,
      );
      return result
        ? c.json(result)
        : c.json({ error: "Product or warranty not found" }, 404);
    },
  )
  .delete(
    "/v1/products/:id",
    requireAnyPermission(["products:manage", "warranties:write"]),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ archived: true, productId: id });
      }
      const product = await setProductArchived(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        true,
      );
      return product
        ? c.json({ archived: true, product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .post(
    "/v1/products/:id/restore",
    requireAnyPermission(["products:manage", "warranties:write"]),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ archived: false, productId: id });
      }
      const product = await setProductArchived(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        false,
      );
      return product
        ? c.json({ archived: false, product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .post(
    "/v1/products/:id/warranties",
    requireAnyPermission(["warranties:create", "warranties:write"]),
    zValidator("param", idParamInput),
    zValidator("json", warrantyInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            warranty: {
              id: crypto.randomUUID(),
              productId: id,
              ...c.req.valid("json"),
            },
          },
          201,
        );
      }
      const database = requireDb();
      const [product] = await database
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, id),
            eq(products.householdId, c.get("actor").householdId),
          ),
        )
        .limit(1);
      if (!product) return c.json({ error: "Product not found" }, 404);
      const input = c.req.valid("json");
      const warranty = await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(warranties)
          .values({
            productId: product.id,
            ...input,
            endsAt: input.lifetime ? null : input.endsAt,
          })
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "warranty.create",
          resourceType: "warranty",
          resourceId: created.id,
          summary: "Added warranty coverage",
          metadata: { productId: product.id },
        });
        return created;
      });
      return c.json({ warranty }, 201);
    },
  )
  .patch(
    "/v1/warranties/:id",
    requireAnyPermission(["warranties:manage", "warranties:write"]),
    zValidator("param", idParamInput),
    zValidator("json", warrantyUpdateInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          warranty: { id, ...c.req.valid("json") },
        });
      }
      const database = requireDb();
      const [existing] = await database
        .select({ id: warranties.id, productId: warranties.productId })
        .from(warranties)
        .innerJoin(products, eq(warranties.productId, products.id))
        .where(
          and(
            eq(warranties.id, id),
            eq(products.householdId, c.get("actor").householdId),
          ),
        )
        .limit(1);
      if (!existing) return c.json({ error: "Warranty not found" }, 404);
      const input = c.req.valid("json");
      const warranty = await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(warranties)
          .set({
            ...input,
            ...(input.lifetime ? { endsAt: null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(warranties.id, existing.id))
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "warranty.update",
          resourceType: "warranty",
          resourceId: updated.id,
          summary: "Updated warranty coverage",
          metadata: { productId: existing.productId },
        });
        return updated;
      });
      return c.json({ warranty });
    },
  )
  .delete(
    "/v1/warranties/:id",
    requireAnyPermission(["warranties:manage", "warranties:write"]),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true")
        return c.json({ deleted: true });
      const database = requireDb();
      const [existing] = await database
        .select({ id: warranties.id, productId: warranties.productId })
        .from(warranties)
        .innerJoin(products, eq(warranties.productId, products.id))
        .where(
          and(
            eq(warranties.id, id),
            eq(products.householdId, c.get("actor").householdId),
          ),
        )
        .limit(1);
      if (!existing) return c.json({ error: "Warranty not found" }, 404);
      await database.transaction(async (tx) => {
        await tx.delete(warranties).where(eq(warranties.id, existing.id));
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "warranty.delete",
          resourceType: "warranty",
          resourceId: existing.id,
          summary: "Removed warranty coverage",
          metadata: { productId: existing.productId },
        });
      });
      return c.json({ deleted: true });
    },
  );
