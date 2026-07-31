import { z } from "zod";
import { httpUrl, listWindowQuery } from "./common.schemas";

export const submissionMethodInput = z.enum([
  "web",
  "phone",
  "email",
  "mail",
  "in_person",
]);

export const requiredEvidenceInput = z.object({
  label: z.string().trim().min(1).max(300),
  required: z.boolean(),
});

export const claimInstructionInput = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(2_000).optional(),
  required: z.boolean(),
});

const claimGuidanceShape = {
  submissionMethods: z.array(submissionMethodInput).max(5).default([]),
  requiredEvidence: z.array(requiredEvidenceInput).max(50).default([]),
  claimInstructions: z.array(claimInstructionInput).max(50).default([]),
};

export const productInput = z.object({
  name: z.string().min(1).max(180),
  brand: z.string().max(100).optional(),
  model: z.string().max(120).optional(),
  serialNumbers: z.array(z.string().max(180)).max(20).default([]),
  retailer: z.string().max(120).optional(),
  orderNumber: z.string().max(180).optional(),
  category: z.string().max(120).optional(),
  productUrl: httpUrl.nullable().optional(),
  purchaseDate: z.iso.date().nullable().optional(),
  purchasePriceMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  warrantyEndsAt: z.iso.date().nullable().optional(),
  warranty: z
    .object({
      provider: z.string().max(180).optional(),
      kind: z.string().max(80).optional(),
      startsAt: z.iso.date().optional(),
      endsAt: z.iso.date().nullable().optional(),
      lifetime: z.boolean().optional(),
      terms: z.string().max(20_000).optional(),
      claimUrl: httpUrl.nullable().optional(),
      claimPhone: z.string().max(80).nullable().optional(),
      claimEmail: z.email().nullable().optional(),
      eligibilityNotes: z.string().max(20_000).nullable().optional(),
      claimDeadline: z.iso.date().nullable().optional(),
      ...claimGuidanceShape,
    })
    .optional(),
  notes: z.string().max(10_000).optional(),
});

export const searchQuery = z.object({
  q: z.string().max(200).optional(),
  coverage: z
    .enum(["active", "expiring", "expired", "lifetime", "unknown"])
    .optional(),
  hasClaim: z.enum(["true", "false"]).optional(),
  purchasedAfter: z.iso.date().optional(),
  purchasedBefore: z.iso.date().optional(),
  expiresAfter: z.iso.date().optional(),
  expiresBefore: z.iso.date().optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
  ...listWindowQuery,
});

export const warrantyInput = z.object({
  provider: z.string().max(180).optional(),
  kind: z.string().max(80).default("manufacturer"),
  startsAt: z.iso.date().optional(),
  endsAt: z.iso.date().nullable().optional(),
  lifetime: z.boolean().default(false),
  terms: z.string().max(20_000).optional(),
  claimUrl: httpUrl.nullable().optional(),
  claimPhone: z.string().max(80).nullable().optional(),
  claimEmail: z.email().nullable().optional(),
  eligibilityNotes: z.string().max(20_000).nullable().optional(),
  claimDeadline: z.iso.date().nullable().optional(),
  ...claimGuidanceShape,
});

export const productRecordUpdateInput = z.object({
  product: productInput
    .omit({ warranty: true, warrantyEndsAt: true, notes: true })
    .partial(),
  warranty: warrantyInput
    .partial()
    .extend({ id: z.string().uuid().optional() })
    .optional(),
});

export const productUpdateInput = productInput.partial();
export const warrantyUpdateInput = warrantyInput.partial();
