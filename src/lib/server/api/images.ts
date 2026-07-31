import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  ImageUploadSizeError,
  openProductImage,
  saveFetchedProductImage,
  saveUploadedProductImage,
} from "../domain/images";
import { suggestProductImage } from "../image-suggestions";
import { requireDb } from "../db";
import { idParamInput, streamedUploadHeaders } from "./common.schemas";
import type { ApiEnv } from "./context";
import {
  rateLimit,
  rejectDeclaredBodyOver,
  requireAnyPermission,
} from "./guards";
import {
  imageFromUrlInput,
  imageContentQuery,
  imageSuggestionInput,
  imageUploadBody,
  maximumImageBytes,
  productImageUploadInput,
} from "./images.schemas";

export const imageRoutes = new Hono<ApiEnv>()
  .post(
    "/v1/image-suggestions",
    requireAnyPermission(["images:attach", "warranties:write"]),
    rateLimit("image-discovery", 30, 60 * 60_000),
    zValidator("json", imageSuggestionInput),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          { error: "Outbound image discovery is disabled in demo mode." },
          403,
        );
      }
      try {
        const suggestions = await suggestProductImage(
          c.req.valid("json").productUrl,
        );
        return c.json({ suggestions });
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error
                ? cause.message
                : "Unable to inspect product page",
          },
          400,
        );
      }
    },
  )
  .post(
    "/v1/products/:id/images/from-url",
    requireAnyPermission(["images:attach", "warranties:write"]),
    rateLimit("image-fetch", 30, 60 * 60_000),
    zValidator("param", idParamInput),
    zValidator("json", imageFromUrlInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            image: {
              id: crypto.randomUUID(),
              sourceUrl: c.req.valid("json").imageUrl,
            },
          },
          201,
        );
      }
      try {
        const image = await saveFetchedProductImage(
          requireDb(),
          c.get("actor").householdId,
          c.get("actor").id,
          id,
          c.req.valid("json").imageUrl,
        );
        return image
          ? c.json({ image }, 201)
          : c.json({ error: "Product not found." }, 404);
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error ? cause.message : "Image fetch failed.",
          },
          400,
        );
      }
    },
  )
  .post(
    "/v1/products/:id/images",
    requireAnyPermission(["images:attach", "warranties:write"]),
    imageUploadBody,
    zValidator("param", idParamInput),
    zValidator("form", productImageUploadInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ image: { id: crypto.randomUUID() } }, 201);
      }
      try {
        const body = c.req.valid("form");
        const image = await saveUploadedProductImage(
          requireDb(),
          c.get("actor").householdId,
          c.get("actor").id,
          id,
          body.file,
        );
        return image
          ? c.json({ image }, 201)
          : c.json({ error: "Product not found." }, 404);
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error ? cause.message : "Image upload failed.",
          },
          400,
        );
      }
    },
  )
  .post(
    "/v1/products/:id/images/upload",
    requireAnyPermission(["images:attach", "warranties:write"]),
    rejectDeclaredBodyOver(maximumImageBytes),
    zValidator("param", idParamInput),
    zValidator("header", streamedUploadHeaders),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.raw.body;
      if (!body) return c.json({ error: "A product image is required." }, 400);
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ image: { id: crypto.randomUUID() } }, 201);
      }
      const headers = c.req.valid("header");
      try {
        const image = await saveUploadedProductImage(
          requireDb(),
          c.get("actor").householdId,
          c.get("actor").id,
          id,
          {
            name: "product-image",
            type: headers["content-type"].split(";", 1)[0],
            size: headers["content-length"],
            stream: () => body,
          },
        );
        return image
          ? c.json({ image }, 201)
          : c.json({ error: "Product not found." }, 404);
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error ? cause.message : "Image upload failed.",
          },
          cause instanceof ImageUploadSizeError ? 413 : 400,
        );
      }
    },
  )
  .get(
    "/v1/product-images/:id/content",
    requireAnyPermission(["products:read", "warranties:read"]),
    zValidator("param", idParamInput),
    zValidator("query", imageContentQuery),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true")
        return c.json({ error: "Image not found." }, 404);
      const image = await openProductImage(
        requireDb(),
        c.get("actor").householdId,
        id,
        c.req.valid("query").variant,
      );
      if (!image) return c.json({ error: "Image not found." }, 404);
      return new Response(image.body, {
        headers: {
          "content-type": image.contentType,
          "cache-control": "private, max-age=3600",
          "x-content-type-options": "nosniff",
        },
      });
    },
  );
