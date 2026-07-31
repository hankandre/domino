import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { requireDb } from "../db";
import { integrations } from "../db/schema";
import { deploymentPaperlessClient } from "../integrations/paperless";
import { openApiDocument } from "../openapi";
import {
  readSwaggerAsset,
  swaggerContentSecurityPolicy,
  swaggerDocumentHtml,
  swaggerInitializer,
} from "../swagger";
import type { ApiEnv } from "./context";

export const systemRoutes = new Hono<ApiEnv>()
  .get("/health", (c) =>
    c.json({ ok: true, service: "domino", version: "0.2.0" }),
  )
  .get("/openapi.json", (c) => c.json(openApiDocument))
  .get("/docs", (c) => {
    c.header("Content-Security-Policy", swaggerContentSecurityPolicy);
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    return c.html(swaggerDocumentHtml);
  })
  .get("/docs/swagger-initializer.js", (c) => {
    c.header("Content-Type", "text/javascript; charset=utf-8");
    c.header("Cache-Control", "public, max-age=86400");
    c.header("X-Content-Type-Options", "nosniff");
    return c.body(swaggerInitializer);
  })
  .get("/docs/swagger-ui.css", async (c) => {
    return new Response(await readSwaggerAsset("swagger-ui.css"), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "text/css; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })
  .get("/docs/swagger-ui-bundle.js", async (c) => {
    return new Response(await readSwaggerAsset("swagger-ui-bundle.js"), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "text/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  })
  .get("/docs/swagger-ui-standalone-preset.js", async (c) => {
    return new Response(
      await readSwaggerAsset("swagger-ui-standalone-preset.js"),
      {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": "text/javascript; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  })
  .get("/ready", async (c) => {
    if (process.env.DOMINO_DEMO_MODE === "true") {
      return c.json({
        ok: true,
        database: "demo",
        localStorage: "demo",
        paperless: "not-checked",
      });
    }
    try {
      const database = requireDb();
      await database.execute(sql`select 1`);
      await access(
        process.env.DOMINO_UPLOAD_DIR ?? "/data/uploads",
        fsConstants.R_OK | fsConstants.W_OK,
      );
      const [savedPaperlessIntegration] = await database
        .select({ id: integrations.id })
        .from(integrations)
        .where(
          and(
            eq(integrations.kind, "paperless"),
            eq(integrations.enabled, true),
          ),
        )
        .limit(1);
      return c.json({
        ok: true,
        database: "ready",
        localStorage: "ready",
        paperless:
          savedPaperlessIntegration || deploymentPaperlessClient()
            ? "configured"
            : "not-configured",
      });
    } catch (cause) {
      console.error("Readiness check failed", cause);
      return c.json(
        {
          ok: false,
          error: "A required dependency is unavailable.",
        },
        503,
      );
    }
  });
