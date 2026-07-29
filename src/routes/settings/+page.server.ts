import { fail } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types";
import { requireDb } from "$lib/server/db";
import { auditEvents, households, integrations } from "$lib/server/db/schema";
import {
  hasPermission,
  requireAnyPagePermission,
} from "$lib/server/auth/authorization";
import {
  disconnectPaperless,
  paperlessClientForHousehold,
  paperlessIntegrationStatus,
  savePaperlessConfiguration,
} from "$lib/server/integrations/paperless";

const paperlessInput = z.object({
  paperlessUrl: z.url().max(2_048),
  paperlessToken: z
    .string()
    .max(4_096)
    .optional()
    .transform((value) => value?.trim() || undefined),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAnyPagePermission(locals.actor, [
    "household:manage",
    "integrations:manage",
  ]);
  if (process.env.DOMINO_DEMO_MODE === "true") {
    return {
      settings: { defaultDocumentBackend: "paperless", expiryWindowDays: 60 },
      paperless: {
        configured: true,
        baseUrl: "https://paperless.home.example",
        enabled: true,
        source: "database" as const,
        configurationError: null,
      },
      canManageHousehold: true,
      canManagePaperless: true,
    };
  }
  const canManageHousehold = hasPermission(locals.actor, "household:manage");
  const canManagePaperless = hasPermission(locals.actor, "integrations:manage");
  const database = requireDb();
  const [household, paperless] = await Promise.all([
    canManageHousehold
      ? database
          .select({
            defaultDocumentBackend: households.defaultDocumentBackend,
            expiryWindowDays: households.expiryWindowDays,
          })
          .from(households)
          .where(eq(households.id, locals.actor!.householdId))
          .limit(1)
      : Promise.resolve([
          {
            defaultDocumentBackend: "local" as const,
            expiryWindowDays: 60,
          },
        ]),
    canManagePaperless
      ? paperlessIntegrationStatus(database, locals.actor!.householdId)
      : Promise.resolve({
          enabled: false,
          configured: false,
          baseUrl: "",
          source: null,
          configurationError: null,
        }),
  ]);
  return {
    settings: household[0],
    paperless,
    canManageHousehold,
    canManagePaperless,
  };
};

export const actions: Actions = {
  save: async ({ locals, request }) => {
    if (!hasPermission(locals.actor, "household:manage")) {
      return fail(403, { settingsError: "Not authorized." });
    }
    const form = await request.formData();
    const backend = form.get("backend");
    const expiryWindowDays = Number(form.get("expiryWindowDays"));
    if (!["local", "paperless"].includes(String(backend))) {
      return fail(400, { settingsError: "Choose a valid document backend." });
    }
    if (
      !Number.isInteger(expiryWindowDays) ||
      expiryWindowDays < 1 ||
      expiryWindowDays > 365
    ) {
      return fail(400, {
        settingsError: "The review window must be between 1 and 365 days.",
      });
    }
    if (
      backend === "paperless" &&
      !(await paperlessClientForHousehold(
        requireDb(),
        locals.actor!.householdId,
      ))
    ) {
      return fail(400, {
        settingsError:
          "Save a Paperless URL and API token before making it authoritative.",
      });
    }
    await requireDb().transaction(async (tx) => {
      await tx
        .update(households)
        .set({
          defaultDocumentBackend: backend as "local" | "paperless",
          expiryWindowDays,
          updatedAt: new Date(),
        })
        .where(eq(households.id, locals.actor!.householdId));
      await tx.insert(auditEvents).values({
        householdId: locals.actor!.householdId,
        actorId: locals.actor!.id,
        action: "household.settings.update",
        resourceType: "household",
        resourceId: locals.actor!.householdId,
        summary: "Updated household settings",
        metadata: { defaultDocumentBackend: backend, expiryWindowDays },
      });
    });
    return { settingsSaved: true };
  },
  savePaperless: async ({ locals, request }) => {
    if (!hasPermission(locals.actor, "integrations:manage")) {
      return fail(403, { paperlessError: "Not authorized." });
    }
    const form = await request.formData();
    const parsed = paperlessInput.safeParse({
      paperlessUrl: String(form.get("paperlessUrl") ?? "").trim(),
      paperlessToken: String(form.get("paperlessToken") ?? ""),
    });
    if (!parsed.success) {
      return fail(400, {
        paperlessError:
          "Enter a valid HTTP(S) Paperless URL. API tokens may be at most 4,096 characters.",
        paperlessUrl: String(form.get("paperlessUrl") ?? ""),
      });
    }
    if (process.env.DOMINO_DEMO_MODE === "true") {
      return { paperlessSaved: true };
    }
    try {
      await requireDb().transaction(async (tx) => {
        const saved = await savePaperlessConfiguration(
          tx,
          locals.actor!.householdId,
          {
            baseUrl: parsed.data.paperlessUrl,
            token: parsed.data.paperlessToken,
          },
        );
        await tx.insert(auditEvents).values({
          householdId: locals.actor!.householdId,
          actorId: locals.actor!.id,
          action: "integration.paperless.update",
          resourceType: "integration",
          resourceId: saved.id,
          summary: "Updated Paperless-ngx connection",
          metadata: {
            baseUrl: saved.baseUrl,
            credentialRotated: Boolean(parsed.data.paperlessToken),
          },
        });
      });
      return { paperlessSaved: true };
    } catch (cause) {
      return fail(400, {
        paperlessError:
          cause instanceof Error
            ? cause.message
            : "Paperless settings could not be saved.",
        paperlessUrl: parsed.data.paperlessUrl,
      });
    }
  },
  testPaperless: async ({ locals }) => {
    if (!hasPermission(locals.actor, "integrations:manage")) {
      return fail(403, { paperlessError: "Not authorized." });
    }
    try {
      if (process.env.DOMINO_DEMO_MODE === "true")
        return { paperlessHealthy: true };
      const client = await paperlessClientForHousehold(
        requireDb(),
        locals.actor!.householdId,
      );
      if (!client)
        return fail(400, {
          paperlessError: "Save the Paperless connection before testing it.",
        });
      await client.health();
      await requireDb()
        .update(integrations)
        .set({ lastSyncAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(
          and(
            eq(integrations.householdId, locals.actor!.householdId),
            eq(integrations.kind, "paperless"),
          ),
        );
      return { paperlessHealthy: true };
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Paperless connection failed.";
      await requireDb()
        .update(integrations)
        .set({ lastError: message, updatedAt: new Date() })
        .where(
          and(
            eq(integrations.householdId, locals.actor!.householdId),
            eq(integrations.kind, "paperless"),
          ),
        )
        .catch(() => undefined);
      return fail(502, {
        paperlessError: `${message} Check the URL, token, and network path, then try again.`,
      });
    }
  },
  disconnectPaperless: async ({ locals }) => {
    if (!hasPermission(locals.actor, "integrations:manage")) {
      return fail(403, { paperlessError: "Not authorized." });
    }
    if (process.env.DOMINO_DEMO_MODE === "true")
      return { paperlessDisconnected: true };
    await requireDb().transaction(async (tx) => {
      const disconnected = await disconnectPaperless(
        tx,
        locals.actor!.householdId,
      );
      await tx
        .update(households)
        .set({
          defaultDocumentBackend: "local",
          updatedAt: new Date(),
        })
        .where(eq(households.id, locals.actor!.householdId));
      await tx.insert(auditEvents).values({
        householdId: locals.actor!.householdId,
        actorId: locals.actor!.id,
        action: "integration.paperless.disconnect",
        resourceType: "integration",
        resourceId: disconnected.id,
        summary: "Disconnected Paperless-ngx",
      });
    });
    return { paperlessDisconnected: true };
  },
};
