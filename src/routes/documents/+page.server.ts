import type { PageServerLoad } from "./$types";
import { and, eq, inArray } from "drizzle-orm";
import { requirePagePermission } from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { households, products } from "$lib/server/db/schema";
import {
  listDocuments,
  refreshPaperlessDocument,
} from "$lib/server/domain/documents";
import { paperlessClientForHousehold } from "$lib/server/integrations/paperless";
import { browserPageHref, browserPageWindow } from "$lib/server/pagination";

async function refreshInBatches<T>(
  rows: T[],
  refresh: (row: T) => Promise<T>,
  concurrency = 6,
) {
  const refreshed: T[] = [];
  for (let index = 0; index < rows.length; index += concurrency) {
    refreshed.push(
      ...(await Promise.all(
        rows.slice(index, index + concurrency).map(refresh),
      )),
    );
  }
  return refreshed;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  requirePagePermission(locals.actor, "documents:read");
  const actorPermissions = locals.actor!.permissions;
  const hasPermission = (permission: string) =>
    actorPermissions.includes("*") || actorPermissions.includes(permission);
  const capabilities = {
    canAttachDocuments: hasPermission("documents:attach"),
    canManageDocuments: hasPermission("documents:manage"),
    canDiscoverPaperless: hasPermission("paperless:discover"),
  };
  const { page, limit, offset } = browserPageWindow(url.searchParams);
  if (process.env.DOMINO_DEMO_MODE === "true")
    return {
      documents: [],
      productNames: {},
      defaultDocumentBackend: "paperless" as const,
      documentsPage: {
        page: 1,
        previousHref: null,
        nextHref: null,
      },
      ...capabilities,
    };
  const [documentRows, household] = await Promise.all([
    listDocuments(
      requireDb(),
      locals.actor!.householdId,
      false,
      locals.actor!.claimIds,
      { limit: limit + 1, offset },
    ),
    requireDb()
      .select({
        defaultDocumentBackend: households.defaultDocumentBackend,
      })
      .from(households)
      .where(eq(households.id, locals.actor!.householdId))
      .limit(1),
  ]);
  const hasMore = documentRows.length > limit;
  const initialDocuments = documentRows.slice(0, limit);
  const refreshableIds = new Set(
    initialDocuments
      .filter(
        (document) =>
          document.backend === "paperless" &&
          document.processingStatus === "processing",
      )
      .slice(0, 12)
      .map((document) => document.id),
  );
  const paperlessClient = refreshableIds.size
    ? await paperlessClientForHousehold(
        requireDb(),
        locals.actor!.householdId,
      ).catch(() => null)
    : null;
  const refreshedDocuments = paperlessClient
    ? await refreshInBatches(
        initialDocuments.filter((document) => refreshableIds.has(document.id)),
        (document) =>
          refreshPaperlessDocument(
            requireDb(),
            locals.actor!.householdId,
            document.id,
            paperlessClient,
          ).catch(() => document),
      )
    : [];
  const refreshedById = new Map(
    refreshedDocuments.map((document) => [document.id, document]),
  );
  const documents = initialDocuments.map(
    (document) => refreshedById.get(document.id) ?? document,
  );
  const productIds = [
    ...new Set(
      documents
        .map((document) => document.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const productRows = productIds.length
    ? await requireDb()
        .select({ id: products.id, brand: products.brand, name: products.name })
        .from(products)
        .where(
          and(
            eq(products.householdId, locals.actor!.householdId),
            inArray(products.id, productIds),
          ),
        )
    : [];
  return {
    documents,
    productNames: Object.fromEntries(
      productRows.map((product) => [
        product.id,
        `${product.brand} ${product.name}`.trim(),
      ]),
    ),
    defaultDocumentBackend: household[0]?.defaultDocumentBackend ?? "local",
    documentsPage: {
      page,
      previousHref: page > 1 ? browserPageHref(url, page - 1) : null,
      nextHref: hasMore ? browserPageHref(url, page + 1) : null,
    },
    ...capabilities,
  };
};
