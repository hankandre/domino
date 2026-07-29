import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { Hono, type MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  and,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { demoProducts } from "$lib/demo";
import { searchProducts } from "./search";
import { permissions, type Permission, can } from "./auth/permissions";
import { relatedReadAccess } from "./auth/authorization";
import { suggestProductImage } from "./image-suggestions";
import { authenticateSessionToken, readSessionCookie } from "./auth/oidc";
import { requireDb } from "./db";
import {
  actorRoles,
  actors,
  apiCredentials,
  auditEvents,
  claimEvents,
  cliDeviceCodes,
  integrations,
  notes,
  products,
  roles,
  warranties,
} from "./db/schema";
import {
  createProduct,
  getProductDetail,
  listProductSummaries,
  projectProductRelatedData,
  setProductArchived,
  updateProduct,
} from "./domain/products";
import {
  createClaim,
  getClaim,
  listClaims,
  updateClaim,
} from "./domain/claims";
import {
  attachDocument,
  linkPaperlessDocument,
  listDocuments,
  openLocalDocument,
  purgeExpiredDocuments,
  refreshPaperlessDocument,
  restoreDocument,
  trashDocument,
} from "./domain/documents";
import {
  deploymentPaperlessClient,
  paperlessClientForHousehold,
} from "./integrations/paperless";
import {
  openProductImage,
  saveFetchedProductImage,
  saveUploadedProductImage,
} from "./domain/images";
import { openApiDocument } from "./openapi";
import {
  readSwaggerAsset,
  swaggerContentSecurityPolicy,
  swaggerDocumentHtml,
  swaggerInitializer,
} from "./swagger";

type Variables = {
  actor: {
    id: string;
    householdId: string;
    kind: "user" | "service";
    permissions: string[];
  };
};
type Env = { Variables: Variables };

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

const productInput = z.object({
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
      claimInstructions: z
        .array(
          z.object({
            title: z.string().min(1).max(300),
            detail: z.string().max(2_000).optional(),
            required: z.boolean(),
          }),
        )
        .max(50)
        .optional(),
    })
    .optional(),
  notes: z.string().max(10_000).optional(),
});

const searchQuery = z.object({
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
});

const warrantyInput = z.object({
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
  claimInstructions: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        detail: z.string().max(2_000).optional(),
        required: z.boolean(),
      }),
    )
    .max(50)
    .default([]),
});

const documentKindInput = z.enum([
  "receipt",
  "manual",
  "warranty",
  "photo",
  "claim",
  "other",
]);

const idParamInput = z.object({ id: z.string().uuid() });
const optionalFormString = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(maximum).optional(),
  );
const optionalFormUuid = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid().optional(),
);
const productImageUploadInput = z.object({
  file: z.instanceof(File),
});
const documentUploadInput = z.object({
  file: z.instanceof(File),
  name: optionalFormString(255),
  kind: documentKindInput.default("other"),
  backend: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["local", "paperless"]).optional(),
  ),
  productId: optionalFormUuid,
  claimId: optionalFormUuid,
});

const app = new Hono<Env>().basePath("/api");
const smallJsonBody = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) => c.json({ error: "Request body is too large" }, 413),
});
const deviceCodes = new Map<
  string,
  {
    userCode: string;
    requestedName: string;
    expiresAt: number;
    token?: string;
  }
>();
const issuedTokens = new Map<
  string,
  { actor: Variables["actor"]; expiresAt: number }
>();

function pruneDemoCredentials(now = Date.now()) {
  for (const [hash, value] of deviceCodes) {
    if (value.expiresAt <= now) deviceCodes.delete(hash);
  }
  for (const [hash, value] of issuedTokens) {
    if (value.expiresAt <= now) issuedTokens.delete(hash);
  }
}

async function authenticateApiCredential(
  tokenHash: string,
): Promise<Variables["actor"] | null> {
  const database = requireDb();
  const [credential] = await database
    .select({
      credentialId: apiCredentials.id,
      actorId: actors.id,
      householdId: actors.householdId,
      kind: actors.kind,
    })
    .from(apiCredentials)
    .innerJoin(actors, eq(apiCredentials.actorId, actors.id))
    .where(
      and(
        eq(apiCredentials.tokenHash, tokenHash),
        isNull(apiCredentials.revokedAt),
        or(
          isNull(apiCredentials.expiresAt),
          gt(apiCredentials.expiresAt, new Date()),
        ),
        eq(actors.disabled, false),
      ),
    )
    .limit(1);
  if (!credential) return null;

  const grants = await database
    .select({ permissions: roles.permissions })
    .from(actorRoles)
    .innerJoin(roles, eq(actorRoles.roleId, roles.id))
    .where(
      and(
        eq(actorRoles.actorId, credential.actorId),
        eq(roles.householdId, credential.householdId),
      ),
    );
  await database
    .update(apiCredentials)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(apiCredentials.id, credential.credentialId));
  return {
    id: credential.actorId,
    householdId: credential.householdId,
    kind: credential.kind,
    permissions: [...new Set(grants.flatMap((grant) => grant.permissions))],
  };
}

app.use("/v1/*", async (c, next) => {
  const authorization = c.req.header("authorization");
  const demoMode = process.env.DOMINO_DEMO_MODE === "true";

  if (demoMode && !authorization) {
    c.set("actor", {
      id: "demo-owner",
      householdId: "demo-household",
      kind: "user",
      permissions: ["*"],
    });
    return next();
  }

  if (!authorization) {
    const sessionActor = await authenticateSessionToken(
      readSessionCookie(c.req.raw),
    );
    if (sessionActor) {
      if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
        const requestOrigin = c.req.header("origin");
        const expectedOrigin = new URL(
          process.env.ORIGIN ?? process.env.DOMINO_ORIGIN ?? c.req.url,
        ).origin;
        if (!requestOrigin || requestOrigin !== expectedOrigin) {
          return c.json(
            { error: "Browser mutations require a same-origin request" },
            403,
          );
        }
      }
      c.set("actor", sessionActor);
      return next();
    }
  }

  if (!authorization?.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const token = authorization.slice(7);
  if (token.length < 24) return c.json({ error: "Invalid credential" }, 401);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  pruneDemoCredentials();
  const issuedActor = issuedTokens.get(tokenHash);
  if (issuedActor) {
    c.set("actor", issuedActor.actor);
    return next();
  }

  if (!demoMode) {
    const persistedActor = await authenticateApiCredential(tokenHash);
    if (persistedActor) {
      c.set("actor", persistedActor);
      return next();
    }
  }

  return c.json({ error: "Credential is unknown or revoked" }, 401);
});

function requirePermission(permission: Permission): MiddlewareHandler<Env> {
  return async (c, next) => {
    const actor = c.get("actor");
    if (
      !actor ||
      (!actor.permissions.includes("*") && !can(actor.permissions, permission))
    ) {
      return c.json({ error: `Missing permission: ${permission}` }, 403);
    }
    await next();
  };
}

const routes = app
  .get("/health", (c) =>
    c.json({ ok: true, service: "domino", version: "0.1.1" }),
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
  })
  .post(
    "/device/start",
    smallJsonBody,
    zValidator(
      "json",
      z.object({
        name: z.string().min(1).max(100),
        serverOrigin: z.string().max(2_048).url().optional(),
      }),
    ),
    async (c) => {
      const deviceCode = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const userCode = crypto.randomUUID().slice(0, 8).toUpperCase();
      const deviceCodeHash = createHash("sha256")
        .update(deviceCode)
        .digest("hex");
      const expiresAt = Date.now() + 10 * 60_000;
      if (process.env.DOMINO_DEMO_MODE === "true") {
        pruneDemoCredentials();
        if (deviceCodes.size >= 1_000) {
          return c.json(
            { error: "Too many device authorization requests are pending." },
            429,
          );
        }
        deviceCodes.set(deviceCodeHash, {
          userCode,
          requestedName: c.req.valid("json").name,
          expiresAt,
        });
      } else {
        const accepted = await requireDb().transaction(async (tx) => {
          await tx
            .delete(cliDeviceCodes)
            .where(
              or(
                lt(cliDeviceCodes.expiresAt, new Date()),
                isNotNull(cliDeviceCodes.consumedAt),
              ),
            );
          const [{ total }] = await tx
            .select({ total: count() })
            .from(cliDeviceCodes)
            .where(
              and(
                gt(cliDeviceCodes.expiresAt, new Date()),
                isNull(cliDeviceCodes.consumedAt),
              ),
            );
          const maximum = Number(
            process.env.DOMINO_DEVICE_FLOW_MAX_OUTSTANDING ?? 1000,
          );
          if (total >= maximum) return false;
          await tx.insert(cliDeviceCodes).values({
            requestedName: c.req.valid("json").name,
            deviceCodeHash,
            userCode,
            expiresAt: new Date(expiresAt),
          });
          return true;
        });
        if (!accepted) {
          return c.json(
            {
              error:
                "Too many device authorization requests are pending. Try again later.",
            },
            429,
          );
        }
      }
      const origin = new URL(process.env.ORIGIN ?? c.req.url).origin;
      return c.json({
        deviceCode,
        userCode,
        verificationUri: `${origin}/activate?code=${userCode}`,
        expiresIn: 600,
        interval: 2,
      });
    },
  )
  .post(
    "/device/approve",
    smallJsonBody,
    zValidator(
      "json",
      z.object({
        userCode: z.string().min(4).max(20),
        permissions: z
          .array(z.enum(permissions))
          .max(permissions.length)
          .optional(),
      }),
    ),
    async (c) => {
      const demoMode = process.env.DOMINO_DEMO_MODE === "true";
      const requestOrigin = c.req.header("origin");
      const expectedOrigin = new URL(process.env.ORIGIN ?? c.req.url).origin;
      if (!demoMode && (!requestOrigin || requestOrigin !== expectedOrigin)) {
        return c.json(
          { error: "Device approval requires a same-origin browser request" },
          403,
        );
      }
      const approvingActor = demoMode
        ? {
            id: "demo-owner",
            householdId: "demo-household",
            kind: "user" as const,
            permissions: ["*"],
          }
        : await authenticateSessionToken(readSessionCookie(c.req.raw));
      if (!approvingActor) {
        return c.json(
          { error: "A signed-in household administrator is required" },
          401,
        );
      }
      if (
        !approvingActor.permissions.includes("*") &&
        !can(approvingActor.permissions, "service_accounts:manage")
      ) {
        return c.json(
          { error: "Missing permission: service_accounts:manage" },
          403,
        );
      }
      const requestedPermissions = c.req.valid("json").permissions ?? [
        "warranties:read",
        "claims:read",
        "claims:create",
        "documents:read",
        "notes:read",
        "notes:write",
      ];
      const exceedsGrantor = requestedPermissions.filter(
        (permission) =>
          !approvingActor.permissions.includes("*") &&
          !approvingActor.permissions.includes(permission),
      );
      if (exceedsGrantor.length) {
        return c.json(
          {
            error: `Cannot delegate permissions the approving account does not hold: ${exceedsGrantor.join(", ")}`,
          },
          403,
        );
      }

      if (!demoMode) {
        const database = requireDb();
        const result = await database.transaction(async (tx) => {
          const [device] = await tx
            .select()
            .from(cliDeviceCodes)
            .where(
              and(
                eq(
                  cliDeviceCodes.userCode,
                  c.req.valid("json").userCode.toUpperCase(),
                ),
                gt(cliDeviceCodes.expiresAt, new Date()),
                isNull(cliDeviceCodes.consumedAt),
                isNull(cliDeviceCodes.serviceActorId),
              ),
            )
            .for("update")
            .limit(1);
          if (!device) return null;

          const suffix = crypto.randomUUID().slice(0, 8);
          const [serviceRole] = await tx
            .insert(roles)
            .values({
              householdId: approvingActor.householdId,
              name: `Service · ${device.requestedName} · ${suffix}`,
              description: `Permissions delegated when ${device.requestedName} was authorized.`,
              permissions: requestedPermissions,
              system: false,
            })
            .returning({ id: roles.id });
          const [serviceActor] = await tx
            .insert(actors)
            .values({
              householdId: approvingActor.householdId,
              kind: "service",
              name: device.requestedName,
            })
            .returning({ id: actors.id });
          await tx.insert(actorRoles).values({
            actorId: serviceActor.id,
            roleId: serviceRole.id,
            grantedByActorId: approvingActor.id,
          });
          await tx
            .update(cliDeviceCodes)
            .set({
              householdId: approvingActor.householdId,
              approvedActorId: approvingActor.id,
              serviceActorId: serviceActor.id,
            })
            .where(eq(cliDeviceCodes.id, device.id));
          await tx.insert(auditEvents).values({
            householdId: approvingActor.householdId,
            actorId: approvingActor.id,
            action: "service_account.authorize",
            resourceType: "actor",
            resourceId: serviceActor.id,
            summary: `Authorized service account ${device.requestedName}`,
            metadata: { permissions: requestedPermissions },
          });
          return { name: device.requestedName };
        });
        return result
          ? c.json({ approved: true, name: result.name })
          : c.json(
              { error: "Code is invalid, expired, or already approved" },
              404,
            );
      }

      const entry = [...deviceCodes.entries()].find(
        ([, value]) =>
          value.userCode === c.req.valid("json").userCode.toUpperCase(),
      );
      if (!entry || entry[1].expiresAt < Date.now()) {
        return c.json({ error: "Code is invalid or expired" }, 404);
      }
      const token = `dom_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
      entry[1].token = token;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      issuedTokens.set(tokenHash, {
        actor: {
          id: `device-${entry[1].requestedName.toLowerCase().replaceAll(/\s+/g, "-")}`,
          householdId: approvingActor.householdId,
          kind: "service",
          permissions: requestedPermissions,
        },
        expiresAt: Date.now() + 60 * 60_000,
      });
      return c.json({ approved: true, name: entry[1].requestedName });
    },
  )
  .post(
    "/device/token",
    smallJsonBody,
    zValidator("json", z.object({ deviceCode: z.string().min(24).max(256) })),
    async (c) => {
      const hash = createHash("sha256")
        .update(c.req.valid("json").deviceCode)
        .digest("hex");
      if (process.env.DOMINO_DEMO_MODE !== "true") {
        const database = requireDb();
        const result = await database.transaction(async (tx) => {
          const [device] = await tx
            .select()
            .from(cliDeviceCodes)
            .where(eq(cliDeviceCodes.deviceCodeHash, hash))
            .limit(1);
          if (!device || device.expiresAt < new Date() || device.consumedAt) {
            return { status: "expired" as const };
          }
          if (!device.serviceActorId) return { status: "pending" as const };

          const [claimed] = await tx
            .update(cliDeviceCodes)
            .set({ consumedAt: new Date() })
            .where(
              and(
                eq(cliDeviceCodes.id, device.id),
                isNull(cliDeviceCodes.consumedAt),
              ),
            )
            .returning({ id: cliDeviceCodes.id });
          if (!claimed) return { status: "expired" as const };

          const token = `dom_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
          const [credential] = await tx
            .insert(apiCredentials)
            .values({
              actorId: device.serviceActorId,
              name: device.requestedName,
              tokenPrefix: token.slice(0, 12),
              tokenHash: createHash("sha256").update(token).digest("hex"),
            })
            .returning({ id: apiCredentials.id });
          await tx
            .update(cliDeviceCodes)
            .set({ credentialId: credential.id })
            .where(eq(cliDeviceCodes.id, device.id));
          return { status: "issued" as const, token };
        });
        if (result.status === "pending")
          return c.json({ error: "authorization_pending" }, 428);
        if (result.status === "expired")
          return c.json({ error: "expired_token" }, 400);
        return c.json({ accessToken: result.token, tokenType: "Bearer" });
      }

      const entry = deviceCodes.get(hash);
      if (!entry || entry.expiresAt < Date.now())
        return c.json({ error: "expired_token" }, 400);
      if (!entry.token) return c.json({ error: "authorization_pending" }, 428);
      deviceCodes.delete(hash);
      return c.json({ accessToken: entry.token, tokenType: "Bearer" });
    },
  )
  .get("/v1/me", (c) => c.json({ actor: c.get("actor") }))
  .get(
    "/v1/audit",
    requirePermission("audit:read"),
    zValidator(
      "query",
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    ),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ events: [] });
      }
      const events = await requireDb()
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          resourceType: auditEvents.resourceType,
          resourceId: auditEvents.resourceId,
          summary: auditEvents.summary,
          metadata: auditEvents.metadata,
          createdAt: auditEvents.createdAt,
          actorName: actors.name,
        })
        .from(auditEvents)
        .leftJoin(actors, eq(auditEvents.actorId, actors.id))
        .where(eq(auditEvents.householdId, c.get("actor").householdId))
        .orderBy(desc(auditEvents.createdAt))
        .limit(c.req.valid("query").limit);
      return c.json({ events });
    },
  )
  .delete(
    "/v1/service-accounts/:id",
    requirePermission("service_accounts:manage"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const approvingActor = c.get("actor");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          revoked: true,
          actorId: id,
          demo: true,
        });
      }

      const database = requireDb();
      const [serviceActor] = await database
        .select({ id: actors.id, name: actors.name })
        .from(actors)
        .where(
          and(
            eq(actors.id, id),
            eq(actors.householdId, approvingActor.householdId),
            eq(actors.kind, "service"),
          ),
        )
        .limit(1);
      if (!serviceActor)
        return c.json({ error: "Service account not found" }, 404);

      await database.transaction(async (tx) => {
        await tx
          .update(apiCredentials)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(apiCredentials.actorId, serviceActor.id),
              isNull(apiCredentials.revokedAt),
            ),
          );
        await tx
          .update(actors)
          .set({ disabled: true, updatedAt: new Date() })
          .where(eq(actors.id, serviceActor.id));
        await tx.insert(auditEvents).values({
          householdId: approvingActor.householdId,
          actorId: approvingActor.id,
          action: "service_account.revoke",
          resourceType: "actor",
          resourceId: serviceActor.id,
          summary: `Revoked service account ${serviceActor.name}`,
        });
      });
      return c.json({ revoked: true, actorId: serviceActor.id });
    },
  )
  .get(
    "/v1/products",
    requirePermission("warranties:read"),
    zValidator("query", searchQuery),
    async (c) => {
      const query = c.req.valid("query");
      const access = relatedReadAccess(c.get("actor"));
      const source =
        process.env.DOMINO_DEMO_MODE === "true"
          ? demoProducts.map((product) =>
              projectProductRelatedData(product, access),
            )
          : await listProductSummaries(
              requireDb(),
              c.get("actor").householdId,
              query.includeArchived === "true",
              access,
            );
      const products = searchProducts(source, {
        query: query.q,
        coverage: query.coverage,
        hasClaim: query.hasClaim ? query.hasClaim === "true" : undefined,
        purchasedAfter: query.purchasedAfter,
        purchasedBefore: query.purchasedBefore,
        expiresAfter: query.expiresAfter,
        expiresBefore: query.expiresBefore,
      });
      return c.json({ products, total: products.length });
    },
  )
  .get(
    "/v1/products/:id",
    requirePermission("warranties:read"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const access = relatedReadAccess(c.get("actor"));
      const product =
        process.env.DOMINO_DEMO_MODE === "true"
          ? demoProducts
              .map((item) => projectProductRelatedData(item, access))
              .find((item) => item.id === id)
          : await getProductDetail(
              requireDb(),
              c.get("actor").householdId,
              id,
              access,
            );
      return product
        ? c.json({ product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .post(
    "/v1/products",
    requirePermission("warranties:write"),
    zValidator("json", productInput),
    async (c) => {
      const input = c.req.valid("json");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ product: { id: crypto.randomUUID(), ...input } }, 201);
      }
      const product = await createProduct(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        {
          ...input,
          warranty:
            input.warranty ??
            (input.warrantyEndsAt !== undefined
              ? { endsAt: input.warrantyEndsAt }
              : undefined),
        },
      );
      return c.json({ product }, 201);
    },
  )
  .patch(
    "/v1/products/:id",
    requirePermission("warranties:write"),
    zValidator("param", idParamInput),
    zValidator("json", productInput.partial()),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          product: { id, ...c.req.valid("json") },
        });
      }
      const product = await updateProduct(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        c.req.valid("json"),
      );
      return product
        ? c.json({ product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .delete(
    "/v1/products/:id",
    requirePermission("warranties:write"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ archived: true, productId: id });
      }
      const product = await setProductArchived(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        true,
      );
      return product
        ? c.json({ archived: true, product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .post(
    "/v1/products/:id/restore",
    requirePermission("warranties:write"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({ archived: false, productId: id });
      }
      const product = await setProductArchived(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        false,
      );
      return product
        ? c.json({ archived: false, product })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .post(
    "/v1/products/:id/warranties",
    requirePermission("warranties:write"),
    zValidator("param", idParamInput),
    zValidator("json", warrantyInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            warranty: {
              id: crypto.randomUUID(),
              productId: id,
              ...c.req.valid("json"),
            },
          },
          201,
        );
      }
      const database = requireDb();
      const [product] = await database
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.id, id),
            eq(products.householdId, c.get("actor").householdId),
          ),
        )
        .limit(1);
      if (!product) return c.json({ error: "Product not found" }, 404);
      const input = c.req.valid("json");
      const warranty = await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(warranties)
          .values({
            productId: product.id,
            ...input,
            endsAt: input.lifetime ? null : input.endsAt,
          })
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "warranty.create",
          resourceType: "warranty",
          resourceId: created.id,
          summary: "Added warranty coverage",
          metadata: { productId: product.id },
        });
        return created;
      });
      return c.json({ warranty }, 201);
    },
  )
  .patch(
    "/v1/warranties/:id",
    requirePermission("warranties:write"),
    zValidator("param", idParamInput),
    zValidator("json", warrantyInput.partial()),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          warranty: { id, ...c.req.valid("json") },
        });
      }
      const database = requireDb();
      const [existing] = await database
        .select({ id: warranties.id, productId: warranties.productId })
        .from(warranties)
        .innerJoin(products, eq(warranties.productId, products.id))
        .where(
          and(
            eq(warranties.id, id),
            eq(products.householdId, c.get("actor").householdId),
          ),
        )
        .limit(1);
      if (!existing) return c.json({ error: "Warranty not found" }, 404);
      const input = c.req.valid("json");
      const warranty = await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(warranties)
          .set({
            ...input,
            ...(input.lifetime ? { endsAt: null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(warranties.id, existing.id))
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "warranty.update",
          resourceType: "warranty",
          resourceId: updated.id,
          summary: "Updated warranty coverage",
          metadata: { productId: existing.productId },
        });
        return updated;
      });
      return c.json({ warranty });
    },
  )
  .delete(
    "/v1/warranties/:id",
    requirePermission("warranties:write"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true")
        return c.json({ deleted: true });
      const database = requireDb();
      const [existing] = await database
        .select({ id: warranties.id, productId: warranties.productId })
        .from(warranties)
        .innerJoin(products, eq(warranties.productId, products.id))
        .where(
          and(
            eq(warranties.id, id),
            eq(products.householdId, c.get("actor").householdId),
          ),
        )
        .limit(1);
      if (!existing) return c.json({ error: "Warranty not found" }, 404);
      await database.transaction(async (tx) => {
        await tx.delete(warranties).where(eq(warranties.id, existing.id));
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "warranty.delete",
          resourceType: "warranty",
          resourceId: existing.id,
          summary: "Removed warranty coverage",
          metadata: { productId: existing.productId },
        });
      });
      return c.json({ deleted: true });
    },
  )
  .post(
    "/v1/image-suggestions",
    requirePermission("warranties:write"),
    zValidator("json", z.object({ productUrl: httpUrl })),
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
    requirePermission("warranties:write"),
    zValidator("param", idParamInput),
    zValidator("json", z.object({ imageUrl: httpUrl })),
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
    requirePermission("warranties:write"),
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
  .get(
    "/v1/product-images/:id/content",
    requirePermission("warranties:read"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true")
        return c.json({ error: "Image not found." }, 404);
      const image = await openProductImage(
        requireDb(),
        c.get("actor").householdId,
        id,
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
  )
  .get(
    "/v1/documents",
    requirePermission("documents:read"),
    zValidator(
      "query",
      z.object({
        trash: z.enum(["true", "false"]).default("false"),
      }),
    ),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true")
        return c.json({ documents: [] });
      await purgeExpiredDocuments(requireDb());
      const documents = await listDocuments(
        requireDb(),
        c.get("actor").householdId,
        c.req.valid("query").trash === "true",
      );
      return c.json({ documents });
    },
  )
  .post(
    "/v1/documents",
    requirePermission("documents:attach"),
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
    zValidator(
      "json",
      z.object({
        paperlessDocumentId: z.number().int().positive(),
        kind: documentKindInput.default("other"),
        productId: z.string().uuid().optional(),
        claimId: z.string().uuid().optional(),
      }),
    ),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          { error: "Paperless linking is unavailable in demo mode." },
          403,
        );
      }
      try {
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
    zValidator(
      "query",
      z.object({
        q: z.string().trim().min(1).max(200),
      }),
    ),
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
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
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
    requirePermission("documents:attach"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
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
    requirePermission("documents:attach"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
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
  )
  .post(
    "/v1/products/:id/notes",
    requirePermission("notes:write"),
    zValidator("param", idParamInput),
    zValidator("json", z.object({ body: z.string().min(1).max(10_000) })),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            note: {
              id: crypto.randomUUID(),
              productId: id,
              body: c.req.valid("json").body,
              createdAt: new Date().toISOString(),
            },
          },
          201,
        );
      }
      const database = requireDb();
      const product = await getProductDetail(
        database,
        c.get("actor").householdId,
        id,
        { claims: false, documents: false, notes: false },
      );
      if (!product) return c.json({ error: "Product not found" }, 404);
      const note = await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(notes)
          .values({
            householdId: c.get("actor").householdId,
            productId: id,
            authorActorId: c.get("actor").id,
            body: c.req.valid("json").body,
          })
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "note.create",
          resourceType: "note",
          resourceId: created.id,
          summary: `Added a note to ${product.name}`,
          metadata: { productId: id },
        });
        return created;
      });
      return c.json({ note }, 201);
    },
  )
  .get(
    "/v1/products/:id/notes",
    requirePermission("notes:read"),
    zValidator("param", idParamInput),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") return c.json({ notes: [] });
      const product = await getProductDetail(
        requireDb(),
        c.get("actor").householdId,
        c.req.valid("param").id,
        { claims: false, documents: false, notes: true },
      );
      return product
        ? c.json({ notes: product.notes })
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .post(
    "/v1/products/:id/claims",
    requirePermission("claims:create"),
    zValidator("param", idParamInput),
    zValidator(
      "json",
      z.object({
        issue: z.string().min(1).max(5000),
        warrantyId: z.string().uuid().optional(),
        nextAction: z.string().max(1000).optional(),
        noticedAt: z.iso.date().optional(),
        preferredResolution: z.string().max(200).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            claim: {
              id: crypto.randomUUID(),
              reference: `CLM-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
              productId: id,
              status: "draft" as const,
              ...c.req.valid("json"),
            },
          },
          201,
        );
      }
      const claim = await createClaim(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        c.req.valid("json"),
      );
      return claim
        ? c.json({ claim }, 201)
        : c.json({ error: "Product not found" }, 404);
    },
  )
  .get("/v1/claims", requirePermission("claims:read"), async (c) => {
    const claims =
      process.env.DOMINO_DEMO_MODE === "true"
        ? demoProducts.flatMap((product) =>
            product.activeClaim
              ? [
                  {
                    ...product.activeClaim,
                    issue: product.activeClaim.summary,
                    productId: product.id,
                    product: {
                      name: product.name,
                      brand: product.brand,
                      model: product.model,
                    },
                  },
                ]
              : [],
          )
        : await listClaims(requireDb(), c.get("actor").householdId);
    return c.json({ claims });
  })
  .get(
    "/v1/claims/:id",
    requirePermission("claims:read"),
    zValidator("param", idParamInput),
    async (c) => {
      const { id } = c.req.valid("param");
      const relatedAccess = relatedReadAccess(c.get("actor"));
      if (process.env.DOMINO_DEMO_MODE === "true") {
        const claim = demoProducts
          .flatMap((product) =>
            product.activeClaim
              ? [
                  {
                    ...product.activeClaim,
                    issue: product.activeClaim.summary,
                    productId: product.id,
                    product: {
                      name: product.name,
                      brand: product.brand,
                      model: product.model,
                    },
                  },
                ]
              : [],
          )
          .find((item) => item.id === id);
        return claim
          ? c.json({ claim })
          : c.json({ error: "Claim not found" }, 404);
      }
      const claim = await getClaim(
        requireDb(),
        c.get("actor").householdId,
        id,
        {
          documents: relatedAccess.documents,
          notes: relatedAccess.notes,
        },
      );
      return claim
        ? c.json({ claim })
        : c.json({ error: "Claim not found" }, 404);
    },
  )
  .get(
    "/v1/claims/:id/notes",
    requirePermission("notes:read"),
    zValidator("param", idParamInput),
    async (c) => {
      if (process.env.DOMINO_DEMO_MODE === "true") return c.json({ notes: [] });
      const claim = await getClaim(
        requireDb(),
        c.get("actor").householdId,
        c.req.valid("param").id,
        { documents: false, notes: true },
      );
      return claim
        ? c.json({ notes: claim.notes })
        : c.json({ error: "Claim not found" }, 404);
    },
  )
  .post(
    "/v1/claims/:id/notes",
    requirePermission("notes:write"),
    zValidator("param", idParamInput),
    zValidator("json", z.object({ body: z.string().min(1).max(10_000) })),
    async (c) => {
      const { id } = c.req.valid("param");
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json(
          {
            note: {
              id: crypto.randomUUID(),
              claimId: id,
              body: c.req.valid("json").body,
              createdAt: new Date().toISOString(),
            },
          },
          201,
        );
      }
      const database = requireDb();
      const claim = await getClaim(database, c.get("actor").householdId, id, {
        documents: false,
        notes: false,
      });
      if (!claim) return c.json({ error: "Claim not found" }, 404);
      const note = await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(notes)
          .values({
            householdId: c.get("actor").householdId,
            claimId: claim.id,
            productId: claim.productId,
            authorActorId: c.get("actor").id,
            body: c.req.valid("json").body,
          })
          .returning();
        await tx.insert(auditEvents).values({
          householdId: c.get("actor").householdId,
          actorId: c.get("actor").id,
          action: "claim.note.create",
          resourceType: "note",
          resourceId: created.id,
          summary: `Added a note to ${claim.reference}`,
          metadata: { claimId: claim.id, productId: claim.productId },
        });
        await tx.insert(claimEvents).values({
          claimId: claim.id,
          actorId: c.get("actor").id,
          eventType: "note_added",
          title: "Claim note added",
          detail: c.req.valid("json").body,
          metadata: { noteId: created.id },
        });
        return created;
      });
      return c.json({ note }, 201);
    },
  )
  .patch(
    "/v1/claims/:id",
    requirePermission("claims:manage"),
    zValidator("param", idParamInput),
    zValidator(
      "json",
      z.object({
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
        nextAction: z.string().max(1000).nullable().optional(),
        resolution: z.string().max(5000).nullable().optional(),
        explanation: z.string().max(5000).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      if (input.status === "resolved" && !input.resolution?.trim()) {
        if (process.env.DOMINO_DEMO_MODE === "true") {
          return c.json(
            { error: "A resolution is required before resolving a claim." },
            400,
          );
        }
        const existing = await getClaim(
          requireDb(),
          c.get("actor").householdId,
          id,
          { documents: false, notes: false },
        );
        if (!existing) return c.json({ error: "Claim not found" }, 404);
        if (!existing.resolution?.trim()) {
          return c.json(
            { error: "A resolution is required before resolving a claim." },
            400,
          );
        }
      }
      if (process.env.DOMINO_DEMO_MODE === "true") {
        return c.json({
          claim: {
            id,
            ...input,
            updatedAt: new Date().toISOString(),
          },
        });
      }
      const claim = await updateClaim(
        requireDb(),
        c.get("actor").householdId,
        c.get("actor").id,
        id,
        input,
      );
      return claim
        ? c.json({ claim })
        : c.json({ error: "Claim not found" }, 404);
    },
  );

export type AppType = typeof routes;
export { app };
