import { z } from "zod";
import { listWindowQuery } from "./common.schemas";

export const noteInput = z.object({
  body: z.string().min(1).max(10_000),
});

export const claimCreateInput = z.object({
  issue: z.string().min(1).max(5_000),
  warrantyId: z.string().uuid().optional(),
  nextAction: z.string().max(1_000).optional(),
  noticedAt: z.iso.date().optional(),
  preferredResolution: z.string().max(200).optional(),
});

export const claimListQuery = z.object(listWindowQuery);
export const noteListQuery = z.object(listWindowQuery);

export const claimUpdateInput = z.object({
  status: z
    .enum([
      "draft",
      "needs_evidence",
      "submitted",
      "in_review",
      "approved",
      "denied",
      "resolved",
      "closed",
    ])
    .optional(),
  nextAction: z.string().max(1_000).nullable().optional(),
  resolution: z.string().max(5_000).nullable().optional(),
  explanation: z.string().max(5_000).optional(),
});
