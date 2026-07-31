import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { httpUrl } from "./common.schemas";

export const maximumImageBytes = 10 * 1024 * 1024;

export const productImageUploadInput = z.object({
  file: z
    .instanceof(File)
    .refine(
      (file) => file.size > 0 && file.size <= maximumImageBytes,
      "Product images must be between 1 byte and 10 MiB.",
    ),
});

export const imageSuggestionInput = z.object({ productUrl: httpUrl });
export const imageFromUrlInput = z.object({ imageUrl: httpUrl });
export const imageContentQuery = z.object({
  variant: z.enum(["original", "thumbnail"]).default("original"),
});

export const imageUploadBody = bodyLimit({
  maxSize: maximumImageBytes + 512 * 1024,
  onError: (c) => c.json({ error: "Product image is larger than 10 MiB" }, 413),
});
