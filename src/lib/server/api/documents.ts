import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireDb } from "../db";
import { documents } from "../db/schema";
import {
  attachDocument,
  DocumentUploadSizeError,
  linkPaperlessDocument,
  listDocuments,
  openLocalDocument,
  refreshPaperlessDocument,
  restoreDocument,
  trashDocument,
} from "../domain/documents";
import { paperlessClientForHousehold } from "../integrations/paperless";
import { idParamInput, streamedUploadHeaders } from "./common.schemas";
import type { ApiEnv } from "./context";
import {
  canAccessClaim,
  canAccessDocument,
  rateLimit,
  rejectDeclaredBodyOver,
  requirePermission,
} from "./guards";
import {
  documentListQuery,
  documentUploadBody,
  documentUploadInput,
  maximumDocumentBytes,
  paperlessLinkInput,
  paperlessSearchQuery,
  streamedDocumentUploadInput,
} from "./documents.schemas";

export const documentRoutes = new Hono<ApiEnv>()
  .get(
    "/v1/documents",
    requirePermission("documents:read"),
    zValidator("query", documentListQuery),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true")
        return c.json({ documents: [] });
      const documents = await listDocuments(
        requireDb(),
        c.get("actor").householdId,
        c.req.valid("query").trash === "true",
        c.get("actor").claimIds,
        {
          limit: c.req.valid("query").limit + 1,
          offset: c.req.valid("query").offset,
        },
      );
      const { limit, offset } = c.req.valid("query");
      return c.json({
        documents: documents.slice(0, limit),
        page: {
          limit,
          offset,
          hasMore: documents.length > limit,
        },
      });
    },
  )
  .post(
    "/v1/documents/upload",
    requirePermission("documents:attach"),
    rejectDeclaredBodyOver(maximumDocumentBytes),
    zValidator("query", streamedDocumentUploadInput),
    zValidator("header", streamedUploadHeaders),
    async (c) => {
      const input = c.req.valid("query");
      if (!canAccessClaim(c.get("actor"), input.claimId)) {
        return c.json({ error: "Claim not found." }, 404);
      }
      const body = c.req.raw.body;
      if (!body) return c.json({ error: "An attachment is required." }, 400);
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          { document: { id: crypto.randomUUID(), processingStatus: "ready" } },
          201,
        );
      }
      const headers = c.req.valid("header");
      try {
        const document = await attachDocument(
          requireDb(),
          c.get("actor").householdId,
          c.get("actor").id,
          {
            ...input,
            file: {
              name: input.name,
              type: headers["content-type"].split(";", 1)[0],
              size: headers["content-length"],
              stream: () => body,
            },
          },
        );
        return document
          ? c.json({ document }, 201)
          : c.json(
              { error: "The associated product or claim was not found." },
              404,
            );
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error
                ? cause.message
                : "The attachment could not be stored.",
          },
          cause instanceof DocumentUploadSizeError ? 413 : 400,
        );
      }
    },
  )
  .post(
    "/v1/documents",
    requirePermission("documents:attach"),
    documentUploadBody,
    zValidator("form", documentUploadInput),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          { document: { id: crypto.randomUUID(), processingStatus: "ready" } },
          201,
        );
      }
      try {
        const body = c.req.valid("form");
        if (!canAccessClaim(c.get("actor"), body.claimId)) {
          return c.json({ error: "Claim not found." }, 404);
        }
        const document = await attachDocument(
          requireDb(),
          c.get("actor").householdId,
          c.get("actor").id,
          body,
        );
        return document
          ? c.json({ document }, 201)
          : c.json(
              { error: "The associated product or claim was not found." },
              404,
            );
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error
                ? cause.message
                : "The attachment could not be stored.",
          },
          400,
        );
      }
    },
  )
  .post(
    "/v1/documents/link-paperless",
    requirePermission("documents:attach"),
    requirePermission("paperless:discover"),
    zValidator("json", paperlessLinkInput),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          { error: "Paperless linking is unavailable in demo mode." },
          403,
        );
      }
      try {
        if (!canAccessClaim(c.get("actor"), c.req.valid("json").claimId)) {
          return c.json({ error: "Claim not found." }, 404);
        }
        const document = await linkPaperlessDocument(
          requireDb(),
          c.get("actor").householdId,
          c.get("actor").id,
          c.req.valid("json"),
        );
        return document
          ? c.json({ document }, 201)
          : c.json(
              { error: "The associated product or claim was not found." },
              404,
            );
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error ? cause.message : "Paperless link failed.",
          },
          502,
        );
      }
    },
  )
  .get(
    "/v1/paperless/search",
    requirePermission("documents:read"),
    requirePermission("paperless:discover"),
    rateLimit("paperless-search", 120, 60_000),
    zValidator("query", paperlessSearchQuery),
    async (c) => {
      const { q } = c.req.valid("query");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ documents: [] });
      }
      try {
        const client = await paperlessClientForHousehold(
          requireDb(),
          c.get("actor").householdId,
        );
        if (!client)
          return c.json({ error: "Paperless-ngx is not configured." }, 503);
        return c.json({ documents: await client.search(q) });
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error
                ? cause.message
                : "Paperless search failed.",
          },
          502,
        );
      }
    },
  )
  .post(
    "/v1/documents/:id/refresh",
    requirePermission("paperless:discover"),
    requirePermission("documents:read"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await canAccessDocument(c.get("actor"), id))) {
        return c.json({ error: "Document not found." }, 404);
      }
      try {
        const document = await refreshPaperlessDocument(
          requireDb(),
          c.get("actor").householdId,
          id,
        );
        return document
          ? c.json({ document })
          : c.json({ error: "Document not found." }, 404);
      } catch (cause) {
        return c.json(
          {
            error:
              cause instanceof Error
                ? cause.message
                : "Paperless refresh failed.",
          },
          502,
        );
      }
    },
  )
  .get(
    "/v1/documents/:id/content",
    requirePermission("documents:read"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await canAccessDocument(c.get("actor"), id))) {
        return c.json({ error: "Document not found." }, 404);
      }
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ error: "Demo documents do not contain files." }, 404);
      }
      const result = await openLocalDocument(
        requireDb(),
        c.get("actor").householdId,
        id,
      );
      if (!result) return c.json({ error: "Local document not found." }, 404);
      const safeName = result.document.name.replaceAll(/[\r\n"]/g, "_");
      const storedType = result.document.mimeType ?? "application/octet-stream";
      const inlineTypes = new Set([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif",
      ]);
      const inline = inlineTypes.has(storedType);
      const headers: Record<string, string> = {
        "content-type": inline ? storedType : "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        "content-security-policy":
          "default-src 'none'; sandbox; frame-ancestors 'self'",
      };
      if (result.document.sizeBytes !== null)
        headers["content-length"] = String(result.document.sizeBytes);
      return new Response(result.body, {
        headers,
      });
    },
  )
  .delete(
    "/v1/documents/:id",
    requirePermission("documents:manage"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await canAccessDocument(c.get("actor"), id))) {
        return c.json({ error: "Document not found." }, 404);
      }
      if (process.env.DOMINO_DEMO_MODE === "true")
        return c.json({ unlinked: true, trashed: false });
      const result = await trashDocument(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
      );
      return result
        ? c.json(result)
        : c.json({ error: "Document not found." }, 404);
    },
  )
  .post(
    "/v1/documents/:id/restore",
    requirePermission("documents:manage"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (!(await canAccessDocument(c.get("actor"), id))) {
        return c.json({ error: "Document not found." }, 404);
      }
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ document: { id, trashedAt: null } });
      }
      const document = await restoreDocument(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
      );
      return document
        ? c.json({ document })
        : c.json({ error: "Document not found." }, 404);
    },
  );
