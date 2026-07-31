import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Permission } from "../auth/permissions";
import { requireDb } from "../db";
import {
  createProductRecord,
  DuplicateProductError,
  IdempotencyConflictError,
  productRecordRequestHash,
  validateProductRecord,
} from "../domain/product-records";
import type { ApiActor, ApiEnv } from "./context";
import {
  actorHasAny,
  duplicateDisclosure,
  requireAnyPermission,
} from "./guards";
import { idempotencyHeaderInput, productRecordInput } from "./records.schemas";

function recordMissingPermissions(
  actor: ApiActor,
  input: z.infer<typeof productRecordInput>,
) {
  const missing: Permission[] = [];
  if (
    input.warranties.length &&
    !actorHasAny(actor, ["warranties:create", "warranties:write"])
  ) {
    missing.push("warranties:create");
  }
  if (input.notes.length && !actorHasAny(actor, ["notes:write"])) {
    missing.push("notes:write");
  }
  if (
    input.allowDuplicateOf &&
    !actorHasAny(actor, ["products:manage", "warranties:write"])
  ) {
    missing.push("products:manage");
  }
  return missing;
}

export const recordRoutes = new Hono<ApiEnv>()
  .post(
    "/v1/product-records/validate",
    requireAnyPermission(["products:create", "warranties:write"]),
    zValidator("json", productRecordInput),
    async (c) => {
      const input = c.req.valid("json");
      const missingPermissions = recordMissingPermissions(
        c.get("actor"),
        input,
      );
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          valid: missingPermissions.length === 0,
          duplicates: [],
          warnings: [],
          missingPermissions,
        });
      }
      const matches = await validateProductRecord(
        requireDb(),
        c.get("actor").householdId,
        input,
      );
      return c.json({
        valid: missingPermissions.length === 0 && matches.exact.length === 0,
        duplicates: duplicateDisclosure(c.get("actor"), matches.exact),
        warnings: duplicateDisclosure(c.get("actor"), matches.warnings),
        missingPermissions,
      });
    },
  )
  .post(
    "/v1/product-records",
    requireAnyPermission(["products:create", "warranties:write"]),
    zValidator("header", idempotencyHeaderInput),
    zValidator("json", productRecordInput),
    async (c) => {
      const input = c.req.valid("json");
      const missingPermissions = recordMissingPermissions(
        c.get("actor"),
        input,
      );
      if (missingPermissions.length) {
        return c.json(
          {
            error: `Missing permissions for included record components: ${missingPermissions.join(", ")}`,
            code: "missing_component_permissions",
            missingPermissions,
          },
          403,
        );
      }
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            product: { id: crypto.randomUUID(), ...input.product },
            warranties: input.warranties,
            notes: input.notes.map((body) => ({
              id: crypto.randomUUID(),
              body,
            })),
            sources: input.sources,
            warnings: [],
            replayed: false,
          },
          201,
        );
      }
      try {
        const result = await createProductRecord(
          requireDb(),
          c.get("actor").householdId,
          c.get("actor").id,
          c.req.valid("header")["idempotency-key"],
          productRecordRequestHash(input),
          input,
        );
        return c.json(result, result.replayed ? 200 : 201);
      } catch (cause) {
        if (cause instanceof DuplicateProductError) {
          return c.json(
            {
              error: cause.message,
              code: "duplicate_product",
              matches: duplicateDisclosure(c.get("actor"), cause.matches),
            },
            409,
          );
        }
        if (cause instanceof IdempotencyConflictError) {
          return c.json(
            { error: cause.message, code: "idempotency_conflict" },
            409,
          );
        }
        throw cause;
      }
    },
  );
