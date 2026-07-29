import type { PageServerLoad } from "./$types";
import { eq } from "drizzle-orm";
import { requirePagePermission } from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { households } from "$lib/server/db/schema";
import {
  listDocuments,
  refreshPaperlessDocument,
} from "$lib/server/domain/documents";
import { listProductSummaries } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals }) => {
  requirePagePermission(locals.actor, "documents:read");
  if (process.env.DOMINO_DEMO_MODE === "true")
    return {
      documents: [],
      productNames: {},
      defaultDocumentBackend: "paperless" as const,
    };
  const [initialDocuments, products, household] = await Promise.all([
    listDocuments(requireDb(), locals.actor!.householdId),
    listProductSummaries(requireDb(), locals.actor!.householdId, false, {
      claims: false,
      documents: false,
      notes: false,
    }),
    requireDb()
      .select({
        defaultDocumentBackend: households.defaultDocumentBackend,
      })
      .from(households)
      .where(eq(households.id, locals.actor!.householdId))
      .limit(1),
  ]);
  const documents = await Promise.all(
    initialDocuments.map((document) =>
      document.backend === "paperless" &&
      document.processingStatus === "processing"
        ? refreshPaperlessDocument(
            requireDb(),
            locals.actor!.householdId,
            document.id,
          ).catch(() => document)
        : document,
    ),
  );
  return {
    documents,
    productNames: Object.fromEntries(
      products.map((product) => [
        product.id,
        `${product.brand} ${product.name}`.trim(),
      ]),
    ),
    defaultDocumentBackend: household[0]?.defaultDocumentBackend ?? "local",
  };
};
