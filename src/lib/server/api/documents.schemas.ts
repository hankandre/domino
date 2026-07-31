import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  listWindowQuery,
  optionalFormString,
  optionalFormUuid,
} from "./common.schemas";

export const documentKindInput = z.enum([
  "receipt",
  "manual",
  "warranty",
  "photo",
  "claim",
  "other",
]);

export const maximumDocumentBytes = 50 * 1024 * 1024;

export const documentUploadInput = z.object({
  file: z
    .instanceof(File)
    .refine(
      (file) => file.size > 0 && file.size <= maximumDocumentBytes,
      "Attachments must be between 1 byte and 50 MiB.",
    ),
  name: optionalFormString(255),
  kind: documentKindInput.default("other"),
  backend: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["local", "paperless"]).optional(),
  ),
  productId: optionalFormUuid,
  claimId: optionalFormUuid,
});

export const streamedDocumentUploadInput = z.object({
  name: z.string().trim().min(1).max(255),
  kind: documentKindInput.default("other"),
  backend: z.enum(["local", "paperless"]).optional(),
  productId: z.string().uuid().optional(),
  claimId: z.string().uuid().optional(),
});

export const documentListQuery = z.object({
  trash: z.enum(["true", "false"]).default("false"),
  ...listWindowQuery,
});

export const paperlessLinkInput = z.object({
  paperlessDocumentId: z.number().int().positive(),
  kind: documentKindInput.default("other"),
  productId: z.string().uuid().optional(),
  claimId: z.string().uuid().optional(),
});

export const paperlessSearchQuery = z.object({
  q: z.string().trim().min(1).max(200),
});

export const documentUploadBody = bodyLimit({
  maxSize: maximumDocumentBytes + 1024 * 1024,
  onError: (c) => c.json({ error: "Attachment is larger than 50 MiB" }, 413),
});
