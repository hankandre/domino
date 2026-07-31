import { z } from "zod";
import { MAX_LIST_LIMIT } from "../pagination";

export const httpUrl = z
  .string()
  .max(2_048)
  .refine((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS URL.");

export const listWindowQuery = {
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
};

export const idParamInput = z.object({ id: z.string().uuid() });

export const optionalFormString = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(maximum).optional(),
  );

export const optionalFormUuid = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid().optional(),
);

export const streamedUploadHeaders = z.object({
  "content-type": z.string().trim().min(1).max(255),
  "content-length": z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const commonRequestHeaders = z.object({
  authorization: z.string().max(4_096).optional(),
  origin: httpUrl.optional(),
  "x-domino-client-address": z.string().trim().min(1).max(256).optional(),
  "content-length": z.string().regex(/^\d+$/).optional(),
  "content-type": z.string().max(255).optional(),
  "idempotency-key": z.string().max(200).optional(),
});
