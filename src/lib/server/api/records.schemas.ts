import { z } from "zod";
import { httpUrl } from "./common.schemas";
import { productInput, warrantyInput } from "./products.schemas";

export const productSourceInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("url"),
    label: z.string().max(180).optional(),
    url: httpUrl,
  }),
  z.object({
    kind: z.literal("external"),
    label: z.string().max(180).optional(),
    url: httpUrl.optional(),
    externalSystem: z.string().trim().min(1).max(100),
    externalId: z.string().trim().min(1).max(300),
  }),
  z.object({
    kind: z.literal("paperless"),
    label: z.string().max(180).optional(),
    externalId: z.string().trim().min(1).max(100),
  }),
]);

export const productRecordInput = z.object({
  product: productInput.omit({
    warranty: true,
    warrantyEndsAt: true,
    notes: true,
  }),
  warranties: z.array(warrantyInput).max(10).default([]),
  notes: z.array(z.string().trim().min(1).max(10_000)).max(20).default([]),
  sources: z.array(productSourceInput).max(20).default([]),
  allowDuplicateOf: z.string().uuid().optional(),
});

export const idempotencyHeaderInput = z.object({
  "idempotency-key": z.string().trim().min(8).max(200),
});
