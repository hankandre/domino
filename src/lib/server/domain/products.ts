import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ProductSummary } from "$lib/types";
import type {
  ClaimInstruction,
  RequiredEvidence,
  SubmissionMethod,
} from "$lib/claim-guidance";
import * as schema from "../db/schema";
import {
  MAX_SEARCH_CANDIDATES,
  normalizeListWindow,
  type ListWindow,
} from "../pagination";

type Database = NodePgDatabase<typeof schema>;
const MAX_PRODUCT_RELATED_RECORDS = 200;
const MAX_PRODUCT_SERIALS = 20;

export type ProductRelatedReadAccess = {
  claims: boolean;
  claimIds?: readonly string[];
  documents: boolean;
  notes: boolean;
};

export type ProductListWindow = ListWindow & {
  archive?: "active" | "all" | "only";
  productIds?: readonly string[];
  sort?: "updated" | "newest" | "name" | "warranty";
};

export async function listProductOptions(
  db: Database,
  householdId: string,
  window: ListWindow & { query?: string } = {},
) {
  const { limit, offset } = normalizeListWindow(window);
  const query = window.query?.trim().slice(0, 200);
  const pattern = query ? `%${query}%` : undefined;
  return db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      brand: schema.products.brand,
      model: schema.products.model,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.householdId, householdId),
        isNull(schema.products.archivedAt),
        pattern
          ? or(
              ilike(schema.products.name, pattern),
              ilike(schema.products.brand, pattern),
              ilike(schema.products.model, pattern),
              ilike(schema.products.category, pattern),
              ilike(schema.products.retailer, pattern),
              ilike(schema.products.orderNumber, pattern),
              sql`${schema.products.purchaseDate}::text ilike ${pattern}`,
              sql`exists (
                select 1 from ${schema.productSerials}
                where ${schema.productSerials.productId} = ${schema.products.id}
                  and ${schema.productSerials.value} ilike ${pattern}
              )`,
            )
          : undefined,
      ),
    )
    .orderBy(
      asc(sql`lower(coalesce(${schema.products.brand}, ''))`),
      asc(sql`lower(${schema.products.name})`),
      asc(schema.products.id),
    )
    .limit(limit)
    .offset(offset);
}

export async function getProductOption(
  db: Database,
  householdId: string,
  productId: string,
) {
  const [product] = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      brand: schema.products.brand,
      model: schema.products.model,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.id, productId),
        eq(schema.products.householdId, householdId),
        isNull(schema.products.archivedAt),
      ),
    )
    .limit(1);
  return product ?? null;
}

export async function getHouseholdProductIdentity(
  db: Database,
  householdId: string,
  productId: string,
) {
  const [product] = await db
    .select({
      id: schema.products.id,
      name: schema.products.name,
      brand: schema.products.brand,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.id, productId),
        eq(schema.products.householdId, householdId),
      ),
    )
    .limit(1);
  return product ?? null;
}

export async function listProductNotes(
  db: Database,
  householdId: string,
  productId: string,
  claimIds: readonly string[] | undefined,
  window?: ListWindow,
) {
  const { limit, offset } = normalizeListWindow(
    window,
    MAX_PRODUCT_RELATED_RECORDS + 1,
  );
  return db
    .select({
      id: schema.notes.id,
      productId: schema.notes.productId,
      body: schema.notes.body,
      createdAt: schema.notes.createdAt,
      updatedAt: schema.notes.updatedAt,
      authorName: schema.actors.name,
    })
    .from(schema.notes)
    .leftJoin(schema.actors, eq(schema.notes.authorActorId, schema.actors.id))
    .where(
      and(
        eq(schema.notes.productId, productId),
        eq(schema.notes.householdId, householdId),
        claimIds === undefined
          ? undefined
          : claimIds.length
            ? or(
                isNull(schema.notes.claimId),
                inArray(schema.notes.claimId, claimIds),
              )
            : isNull(schema.notes.claimId),
      ),
    )
    .orderBy(desc(schema.notes.createdAt), desc(schema.notes.id))
    .limit(limit)
    .offset(offset);
}

export function projectProductRelatedData<
  T extends {
    activeClaim?: unknown;
    claims?: unknown[];
    documents?: number | unknown[];
    notes?: number | unknown[];
  },
>(product: T, access: ProductRelatedReadAccess): T {
  return {
    ...product,
    activeClaim: access.claims ? product.activeClaim : undefined,
    ...("claims" in product
      ? { claims: access.claims ? product.claims : [] }
      : {}),
    ...("documents" in product
      ? {
          documents: access.documents
            ? product.documents
            : Array.isArray(product.documents)
              ? []
              : 0,
        }
      : {}),
    ...("notes" in product
      ? {
          notes: access.notes
            ? product.notes
            : Array.isArray(product.notes)
              ? []
              : 0,
        }
      : {}),
  } as T;
}

export type ProductCreateInput = {
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  retailer?: string;
  orderNumber?: string;
  productUrl?: string | null;
  purchaseDate?: string | null;
  purchasePriceMinor?: number;
  currency?: string;
  serialNumbers?: string[];
  notes?: string;
  warranty?: {
    provider?: string;
    kind?: string;
    startsAt?: string;
    endsAt?: string | null;
    lifetime?: boolean;
    terms?: string;
    claimUrl?: string | null;
    claimPhone?: string | null;
    claimEmail?: string | null;
    eligibilityNotes?: string | null;
    claimDeadline?: string | null;
    submissionMethods?: SubmissionMethod[];
    requiredEvidence?: RequiredEvidence[];
    claimInstructions?: ClaimInstruction[];
  };
};

function groupByProduct<T extends { productId: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.productId) continue;
    const existing = grouped.get(row.productId);
    if (existing) existing.push(row);
    else grouped.set(row.productId, [row]);
  }
  return grouped;
}

function buildProductSummary(
  product: typeof schema.products.$inferSelect,
  related: {
    serials: Array<{ productId: string; value: string }>;
    warranties: Array<{
      productId: string;
      lifetime: boolean;
      endsAt: string | null;
    }>;
    images: Array<{
      id: string;
      productId: string;
      primary: boolean;
      storageKey: string | null;
      thumbnailStorageKey: string | null;
      sourceUrl: string | null;
    }>;
    documents: number | Array<{ productId: string | null }>;
    notes: number | Array<{ productId: string | null }>;
    claims: Array<{
      id: string;
      productId: string;
      reference: string;
      status: (typeof schema.claims.$inferSelect)["status"];
      issue: string;
      nextAction: string | null;
      updatedAt: Date;
    }>;
  },
  expiryWindowDays: number,
): ProductSummary {
  const selectedWarranty =
    related.warranties.find((row) => row.lifetime) ??
    related.warranties
      .filter((row) => row.endsAt)
      .toSorted((a, b) => (b.endsAt ?? "").localeCompare(a.endsAt ?? ""))[0];
  const today = new Date();
  const expiryCutoff = new Date(today);
  expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() + expiryWindowDays);
  const todayIso = today.toISOString().slice(0, 10);
  const cutoffIso = expiryCutoff.toISOString().slice(0, 10);
  const coverageStatus = selectedWarranty?.lifetime
    ? "lifetime"
    : !selectedWarranty?.endsAt
      ? "unknown"
      : selectedWarranty.endsAt < todayIso
        ? "expired"
        : selectedWarranty.endsAt <= cutoffIso
          ? "expiring"
          : "active";
  const activeClaim = related.claims
    .filter((row) => !["resolved", "closed"].includes(row.status))
    .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  const primaryImage =
    related.images.find((row) => row.primary) ?? related.images[0];

  return {
    id: product.id,
    name: product.name,
    brand: product.brand ?? "",
    model: product.model ?? "",
    category: product.category ?? "",
    purchasedAt: product.purchaseDate ?? "",
    warrantyEndsAt: selectedWarranty?.lifetime
      ? null
      : (selectedWarranty?.endsAt ?? null),
    coverageStatus,
    imageUrl: primaryImage?.storageKey
      ? `/api/v1/product-images/${primaryImage.id}/content?variant=thumbnail`
      : (primaryImage?.sourceUrl ?? null),
    documents:
      typeof related.documents === "number"
        ? related.documents
        : related.documents.length,
    notes:
      typeof related.notes === "number" ? related.notes : related.notes.length,
    serialNumbers: related.serials.map((row) => row.value),
    retailer: product.retailer ?? "",
    orderNumber: product.orderNumber ?? "",
    archivedAt: product.archivedAt?.toISOString() ?? null,
    activeClaim: activeClaim
      ? {
          id: activeClaim.id,
          reference: activeClaim.reference,
          status: activeClaim.status,
          summary: activeClaim.issue,
          nextAction: activeClaim.nextAction ?? "Review claim details",
        }
      : undefined,
  };
}

export async function listProductSummaries(
  db: Database,
  householdId: string,
  includeArchived: boolean,
  access: ProductRelatedReadAccess,
  window: ProductListWindow = {},
): Promise<ProductSummary[]> {
  if (window.productIds?.length === 0) return [];
  const { limit, offset } = normalizeListWindow(
    window,
    MAX_SEARCH_CANDIDATES + 1,
  );
  const archive = window.archive ?? (includeArchived ? "all" : "active");
  const warrantyEnd = sql<string>`(
    select max(w."ends_at")
    from "warranties" w
    where w."product_id" = ${schema.products.id}
      and w."lifetime" = false
  )`;
  const order =
    window.sort === "name"
      ? [
          asc(sql`lower(coalesce(${schema.products.brand}, ''))`),
          asc(sql`lower(${schema.products.name})`),
          asc(schema.products.id),
        ]
      : window.sort === "warranty"
        ? [asc(sql`${warrantyEnd} nulls last`), asc(schema.products.id)]
        : window.sort === "newest"
          ? [
              desc(sql`${schema.products.purchaseDate} nulls last`),
              desc(schema.products.id),
            ]
          : [desc(schema.products.updatedAt), desc(schema.products.id)];
  const productRows = await db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.householdId, householdId),
        archive === "active"
          ? isNull(schema.products.archivedAt)
          : archive === "only"
            ? isNotNull(schema.products.archivedAt)
            : undefined,
        window.productIds
          ? inArray(schema.products.id, window.productIds)
          : undefined,
      ),
    )
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  if (!productRows.length) return [];

  const ids = productRows.map((product) => product.id);
  const rankedSerials = db
    .select({
      productId: schema.productSerials.productId,
      value: schema.productSerials.value,
      rank: sql<number>`row_number() over (
        partition by ${schema.productSerials.productId}
        order by ${schema.productSerials.createdAt}, ${schema.productSerials.id}
      )`.as("serial_rank"),
    })
    .from(schema.productSerials)
    .where(inArray(schema.productSerials.productId, ids))
    .as("ranked_product_serials");
  const [
    serialRows,
    warrantyRows,
    imageRows,
    documentRows,
    noteRows,
    claimRows,
  ] = await Promise.all([
    db
      .select({
        productId: rankedSerials.productId,
        value: rankedSerials.value,
      })
      .from(rankedSerials)
      .where(lte(rankedSerials.rank, 20)),
    db
      .selectDistinctOn([schema.warranties.productId], {
        productId: schema.warranties.productId,
        lifetime: schema.warranties.lifetime,
        endsAt: schema.warranties.endsAt,
      })
      .from(schema.warranties)
      .where(inArray(schema.warranties.productId, ids))
      .orderBy(
        schema.warranties.productId,
        desc(schema.warranties.lifetime),
        desc(schema.warranties.endsAt),
        desc(schema.warranties.id),
      ),
    db
      .selectDistinctOn([schema.productImages.productId], {
        id: schema.productImages.id,
        productId: schema.productImages.productId,
        primary: schema.productImages.primary,
        storageKey: schema.productImages.storageKey,
        thumbnailStorageKey: schema.productImages.thumbnailStorageKey,
        sourceUrl: schema.productImages.sourceUrl,
      })
      .from(schema.productImages)
      .where(inArray(schema.productImages.productId, ids))
      .orderBy(
        schema.productImages.productId,
        desc(schema.productImages.primary),
        desc(schema.productImages.createdAt),
        desc(schema.productImages.id),
      ),
    access.documents
      ? db
          .select({
            productId: schema.documents.productId,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.documents)
          .where(
            and(
              inArray(schema.documents.productId, ids),
              eq(schema.documents.householdId, householdId),
              isNull(schema.documents.trashedAt),
              access.claimIds === undefined
                ? undefined
                : access.claimIds.length
                  ? or(
                      isNull(schema.documents.claimId),
                      inArray(schema.documents.claimId, access.claimIds),
                    )
                  : isNull(schema.documents.claimId),
            ),
          )
          .groupBy(schema.documents.productId)
      : Promise.resolve([]),
    access.notes
      ? db
          .select({
            productId: schema.notes.productId,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.notes)
          .where(
            and(
              inArray(schema.notes.productId, ids),
              eq(schema.notes.householdId, householdId),
              access.claimIds === undefined
                ? undefined
                : access.claimIds.length
                  ? or(
                      isNull(schema.notes.claimId),
                      inArray(schema.notes.claimId, access.claimIds),
                    )
                  : isNull(schema.notes.claimId),
            ),
          )
          .groupBy(schema.notes.productId)
      : Promise.resolve([]),
    access.claims &&
    (access.claimIds === undefined || access.claimIds.length > 0)
      ? db
          .selectDistinctOn([schema.claims.productId], {
            id: schema.claims.id,
            productId: schema.claims.productId,
            reference: schema.claims.reference,
            status: schema.claims.status,
            issue: schema.claims.issue,
            nextAction: schema.claims.nextAction,
            updatedAt: schema.claims.updatedAt,
          })
          .from(schema.claims)
          .where(
            and(
              inArray(schema.claims.productId, ids),
              eq(schema.claims.householdId, householdId),
              access.claimIds === undefined
                ? undefined
                : inArray(schema.claims.id, access.claimIds),
              sql`${schema.claims.status} not in ('resolved', 'closed')`,
            ),
          )
          .orderBy(
            schema.claims.productId,
            desc(schema.claims.updatedAt),
            desc(schema.claims.id),
          )
      : Promise.resolve([]),
  ]);

  const expiryWindowDays =
    (
      await db
        .select({ days: schema.households.expiryWindowDays })
        .from(schema.households)
        .where(eq(schema.households.id, householdId))
        .limit(1)
    )[0]?.days ?? 60;
  const serialsByProduct = groupByProduct(serialRows);
  const warrantiesByProduct = groupByProduct(warrantyRows);
  const imagesByProduct = groupByProduct(imageRows);
  const documentsByProduct = new Map(
    documentRows.flatMap((row) =>
      row.productId ? [[row.productId, row.count] as const] : [],
    ),
  );
  const notesByProduct = new Map(
    noteRows.flatMap((row) =>
      row.productId ? [[row.productId, row.count] as const] : [],
    ),
  );
  const claimsByProduct = groupByProduct(claimRows);

  const summaries = productRows.map((product) =>
    buildProductSummary(
      product,
      {
        serials: serialsByProduct.get(product.id) ?? [],
        warranties: warrantiesByProduct.get(product.id) ?? [],
        images: imagesByProduct.get(product.id) ?? [],
        documents: documentsByProduct.get(product.id) ?? 0,
        notes: notesByProduct.get(product.id) ?? 0,
        claims: claimsByProduct.get(product.id) ?? [],
      },
      expiryWindowDays,
    ),
  );
  if (!window.productIds) return summaries;
  const positions = new Map(window.productIds.map((id, index) => [id, index]));
  return summaries.toSorted(
    (left, right) =>
      (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export async function listExpiringProductSummaries(
  db: Database,
  householdId: string,
  access: ProductRelatedReadAccess,
  window?: ListWindow,
) {
  const { limit, offset } = normalizeListWindow(window);
  const expiryWindowDays =
    (
      await db
        .select({ days: schema.households.expiryWindowDays })
        .from(schema.households)
        .where(eq(schema.households.id, householdId))
        .limit(1)
    )[0]?.days ?? 60;
  const selectedEnd = sql<string>`(
    select max(w."ends_at")
    from "warranties" w
    where w."product_id" = ${schema.products.id}
      and w."lifetime" = false
  )`;
  const productRows = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.householdId, householdId),
        isNull(schema.products.archivedAt),
        sql`not exists (
          select 1 from "warranties" w
          where w."product_id" = ${schema.products.id}
            and w."lifetime" = true
        )`,
        sql`${selectedEnd} between current_date and current_date + (${expiryWindowDays} * interval '1 day')`,
      ),
    )
    .orderBy(selectedEnd, schema.products.id)
    .limit(limit)
    .offset(offset);
  return listProductSummaries(db, householdId, false, access, {
    limit: productRows.length || 1,
    productIds: productRows.map((product) => product.id),
  });
}

export async function countHouseholdAttention(
  db: Database,
  householdId: string,
  access: ProductRelatedReadAccess,
) {
  const expiryWindowDays =
    (
      await db
        .select({ days: schema.households.expiryWindowDays })
        .from(schema.households)
        .where(eq(schema.households.id, householdId))
        .limit(1)
    )[0]?.days ?? 60;
  const [expiring, openClaims] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.householdId, householdId),
          isNull(schema.products.archivedAt),
          sql`not exists (
            select 1 from "warranties" w
            where w."product_id" = ${schema.products.id}
              and w."lifetime" = true
          )`,
          sql`(
            select max(w."ends_at") from "warranties" w
            where w."product_id" = ${schema.products.id}
              and w."lifetime" = false
          ) between current_date and current_date + (${expiryWindowDays} * interval '1 day')`,
        ),
      ),
    access.claims &&
    (access.claimIds === undefined || access.claimIds.length > 0)
      ? db
          .select({
            count: sql<number>`count(distinct ${schema.claims.productId})::int`,
          })
          .from(schema.claims)
          .innerJoin(
            schema.products,
            eq(schema.claims.productId, schema.products.id),
          )
          .where(
            and(
              eq(schema.claims.householdId, householdId),
              eq(schema.products.householdId, householdId),
              isNull(schema.products.archivedAt),
              sql`${schema.claims.status} not in ('resolved', 'closed')`,
              access.claimIds === undefined
                ? undefined
                : inArray(schema.claims.id, access.claimIds),
            ),
          )
      : Promise.resolve([{ count: 0 }]),
  ]);
  return {
    expiring: expiring[0]?.count ?? 0,
    openClaims: openClaims[0]?.count ?? 0,
  };
}

export async function getProductDetail(
  db: Database,
  householdId: string,
  productId: string,
  access: ProductRelatedReadAccess,
) {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(
      and(
        eq(schema.products.id, productId),
        eq(schema.products.householdId, householdId),
      ),
    )
    .limit(1);
  if (!product) return null;
  const [
    warranties,
    notes,
    documents,
    claimRows,
    images,
    sources,
    serials,
    household,
  ] = await Promise.all([
    db
      .select()
      .from(schema.warranties)
      .where(eq(schema.warranties.productId, productId))
      .orderBy(
        desc(schema.warranties.lifetime),
        desc(schema.warranties.endsAt),
        desc(schema.warranties.id),
      )
      .limit(MAX_PRODUCT_RELATED_RECORDS + 1),
    access.notes
      ? db
          .select({
            id: schema.notes.id,
            productId: schema.notes.productId,
            body: schema.notes.body,
            createdAt: schema.notes.createdAt,
            updatedAt: schema.notes.updatedAt,
            authorName: schema.actors.name,
          })
          .from(schema.notes)
          .leftJoin(
            schema.actors,
            eq(schema.notes.authorActorId, schema.actors.id),
          )
          .where(
            and(
              eq(schema.notes.productId, productId),
              eq(schema.notes.householdId, householdId),
              access.claimIds === undefined
                ? undefined
                : access.claimIds.length
                  ? or(
                      isNull(schema.notes.claimId),
                      inArray(schema.notes.claimId, access.claimIds),
                    )
                  : isNull(schema.notes.claimId),
            ),
          )
          .orderBy(desc(schema.notes.createdAt), desc(schema.notes.id))
          .limit(MAX_PRODUCT_RELATED_RECORDS + 1)
      : Promise.resolve([]),
    access.documents
      ? db
          .select()
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.productId, productId),
              eq(schema.documents.householdId, householdId),
              isNull(schema.documents.trashedAt),
              access.claimIds === undefined
                ? undefined
                : access.claimIds.length
                  ? or(
                      isNull(schema.documents.claimId),
                      inArray(schema.documents.claimId, access.claimIds),
                    )
                  : isNull(schema.documents.claimId),
            ),
          )
          .orderBy(desc(schema.documents.createdAt), desc(schema.documents.id))
          .limit(MAX_PRODUCT_RELATED_RECORDS + 1)
      : Promise.resolve([]),
    access.claims &&
    (access.claimIds === undefined || access.claimIds.length > 0)
      ? db
          .select()
          .from(schema.claims)
          .where(
            and(
              eq(schema.claims.productId, productId),
              eq(schema.claims.householdId, householdId),
              access.claimIds === undefined
                ? undefined
                : inArray(schema.claims.id, access.claimIds),
            ),
          )
          .orderBy(
            desc(sql`${schema.claims.status} not in ('resolved', 'closed')`),
            desc(schema.claims.updatedAt),
            desc(schema.claims.id),
          )
          .limit(MAX_PRODUCT_RELATED_RECORDS + 1)
      : Promise.resolve([]),
    db
      .select()
      .from(schema.productImages)
      .where(eq(schema.productImages.productId, productId))
      .orderBy(
        desc(schema.productImages.primary),
        desc(schema.productImages.createdAt),
        desc(schema.productImages.id),
      )
      .limit(MAX_PRODUCT_RELATED_RECORDS + 1),
    db
      .select({
        id: schema.productSources.id,
        kind: schema.productSources.kind,
        label: schema.productSources.label,
        url: schema.productSources.url,
        externalSystem: schema.productSources.externalSystem,
        externalId: schema.productSources.externalId,
        createdAt: schema.productSources.createdAt,
        addedByName: schema.actors.name,
      })
      .from(schema.productSources)
      .leftJoin(
        schema.actors,
        eq(schema.productSources.addedByActorId, schema.actors.id),
      )
      .where(eq(schema.productSources.productId, productId))
      .orderBy(
        desc(schema.productSources.createdAt),
        desc(schema.productSources.id),
      )
      .limit(MAX_PRODUCT_RELATED_RECORDS + 1),
    db
      .select()
      .from(schema.productSerials)
      .where(eq(schema.productSerials.productId, productId))
      .orderBy(schema.productSerials.createdAt, schema.productSerials.id)
      .limit(MAX_PRODUCT_SERIALS + 1),
    db
      .select({ expiryWindowDays: schema.households.expiryWindowDays })
      .from(schema.households)
      .where(eq(schema.households.id, householdId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  const [creator] = product.createdByActorId
    ? await db
        .select({ id: schema.actors.id, name: schema.actors.name })
        .from(schema.actors)
        .where(eq(schema.actors.id, product.createdByActorId))
        .limit(1)
    : [];
  const summary = buildProductSummary(
    product,
    {
      serials: serials.slice(0, MAX_PRODUCT_SERIALS),
      warranties,
      images,
      documents,
      notes,
      claims: claimRows,
    },
    household?.expiryWindowDays ?? 60,
  );
  return {
    ...summary,
    imageUrl: images[0]?.storageKey
      ? `/api/v1/product-images/${images[0].id}/content`
      : summary.imageUrl,
    productUrl: product.productUrl,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    purchasePriceMinor: product.purchasePriceMinor,
    currency: product.currency,
    warranties: warranties.slice(0, MAX_PRODUCT_RELATED_RECORDS),
    notes: notes.slice(0, MAX_PRODUCT_RELATED_RECORDS),
    documents: documents.slice(0, MAX_PRODUCT_RELATED_RECORDS),
    claims: claimRows.slice(0, MAX_PRODUCT_RELATED_RECORDS),
    images: images.slice(0, MAX_PRODUCT_RELATED_RECORDS),
    sources: sources.slice(0, MAX_PRODUCT_RELATED_RECORDS),
    relatedPage: {
      warrantiesTruncated: warranties.length > MAX_PRODUCT_RELATED_RECORDS,
      notesTruncated: notes.length > MAX_PRODUCT_RELATED_RECORDS,
      documentsTruncated: documents.length > MAX_PRODUCT_RELATED_RECORDS,
      claimsTruncated: claimRows.length > MAX_PRODUCT_RELATED_RECORDS,
      imagesTruncated: images.length > MAX_PRODUCT_RELATED_RECORDS,
      sourcesTruncated: sources.length > MAX_PRODUCT_RELATED_RECORDS,
      serialNumbersTruncated: serials.length > MAX_PRODUCT_SERIALS,
    },
    createdBy: creator ?? null,
  };
}

export async function createProduct(
  db: Database,
  householdId: string,
  actorId: string,
  input: ProductCreateInput,
) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .insert(schema.products)
      .values({
        householdId,
        name: input.name,
        brand: input.brand,
        model: input.model,
        category: input.category,
        retailer: input.retailer,
        orderNumber: input.orderNumber,
        productUrl: input.productUrl,
        purchaseDate: input.purchaseDate,
        purchasePriceMinor: input.purchasePriceMinor,
        currency: input.currency ?? "USD",
        createdByActorId: actorId,
      })
      .returning();

    if (input.serialNumbers?.length) {
      await tx
        .insert(schema.productSerials)
        .values(
          [
            ...new Set(
              input.serialNumbers.map((value) => value.trim()).filter(Boolean),
            ),
          ].map((value) => ({ productId: product.id, value })),
        );
    }
    if (input.warranty) {
      await tx.insert(schema.warranties).values({
        productId: product.id,
        provider: input.warranty.provider,
        kind: input.warranty.kind ?? "manufacturer",
        startsAt: input.warranty.startsAt,
        endsAt: input.warranty.lifetime ? null : input.warranty.endsAt,
        lifetime: input.warranty.lifetime ?? false,
        terms: input.warranty.terms,
        claimUrl: input.warranty.claimUrl,
        claimPhone: input.warranty.claimPhone,
        claimEmail: input.warranty.claimEmail,
        eligibilityNotes: input.warranty.eligibilityNotes,
        claimDeadline: input.warranty.claimDeadline,
        submissionMethods: input.warranty.submissionMethods ?? [],
        requiredEvidence: input.warranty.requiredEvidence ?? [],
        claimInstructions: input.warranty.claimInstructions ?? [],
      });
    }
    if (input.notes?.trim()) {
      await tx.insert(schema.notes).values({
        householdId,
        productId: product.id,
        authorActorId: actorId,
        body: input.notes.trim(),
      });
    }
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "product.create",
      resourceType: "product",
      resourceId: product.id,
      summary: `Added ${product.name}`,
    });
    return product;
  });
}

export async function updateProduct(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  input: Partial<
    Omit<ProductCreateInput, "warranty" | "notes" | "serialNumbers">
  > & {
    serialNumbers?: string[];
  },
) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .update(schema.products)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.brand === undefined ? {} : { brand: input.brand }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.retailer === undefined ? {} : { retailer: input.retailer }),
        ...(input.orderNumber === undefined
          ? {}
          : { orderNumber: input.orderNumber }),
        ...(input.productUrl === undefined
          ? {}
          : { productUrl: input.productUrl }),
        ...(input.purchaseDate === undefined
          ? {}
          : { purchaseDate: input.purchaseDate }),
        ...(input.purchasePriceMinor === undefined
          ? {}
          : { purchasePriceMinor: input.purchasePriceMinor }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.products.id, productId),
          eq(schema.products.householdId, householdId),
        ),
      )
      .returning();
    if (!product) return null;

    if (input.serialNumbers) {
      await tx
        .delete(schema.productSerials)
        .where(eq(schema.productSerials.productId, productId));
      const values = [
        ...new Set(
          input.serialNumbers.map((value) => value.trim()).filter(Boolean),
        ),
      ];
      if (values.length) {
        await tx
          .insert(schema.productSerials)
          .values(values.map((value) => ({ productId, value })));
      }
    }
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "product.update",
      resourceType: "product",
      resourceId: product.id,
      summary: `Updated ${product.name}`,
    });
    return product;
  });
}

export async function updateProductRecord(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  input: {
    product: Partial<
      Omit<ProductCreateInput, "warranty" | "notes" | "serialNumbers">
    > & { serialNumbers?: string[] };
    warranty?: NonNullable<ProductCreateInput["warranty"]> & { id?: string };
  },
) {
  return db.transaction(async (tx) => {
    if (input.warranty?.id) {
      const [existingWarranty] = await tx
        .select({ id: schema.warranties.id })
        .from(schema.warranties)
        .where(
          and(
            eq(schema.warranties.id, input.warranty.id),
            eq(schema.warranties.productId, productId),
          ),
        )
        .for("update")
        .limit(1);
      if (!existingWarranty) return null;
    }
    const [product] = await tx
      .update(schema.products)
      .set({
        ...(input.product.name === undefined
          ? {}
          : { name: input.product.name }),
        ...(input.product.brand === undefined
          ? {}
          : { brand: input.product.brand }),
        ...(input.product.model === undefined
          ? {}
          : { model: input.product.model }),
        ...(input.product.category === undefined
          ? {}
          : { category: input.product.category }),
        ...(input.product.retailer === undefined
          ? {}
          : { retailer: input.product.retailer }),
        ...(input.product.orderNumber === undefined
          ? {}
          : { orderNumber: input.product.orderNumber }),
        ...(input.product.productUrl === undefined
          ? {}
          : { productUrl: input.product.productUrl }),
        ...(input.product.purchaseDate === undefined
          ? {}
          : { purchaseDate: input.product.purchaseDate }),
        ...(input.product.purchasePriceMinor === undefined
          ? {}
          : { purchasePriceMinor: input.product.purchasePriceMinor }),
        ...(input.product.currency === undefined
          ? {}
          : { currency: input.product.currency }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.products.id, productId),
          eq(schema.products.householdId, householdId),
        ),
      )
      .returning();
    if (!product) return null;

    if (input.product.serialNumbers) {
      await tx
        .delete(schema.productSerials)
        .where(eq(schema.productSerials.productId, productId));
      const serialNumbers = [
        ...new Set(
          input.product.serialNumbers
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];
      if (serialNumbers.length) {
        await tx.insert(schema.productSerials).values(
          serialNumbers.map((value) => ({
            productId,
            value,
          })),
        );
      }
    }

    let warranty = null;
    if (input.warranty) {
      const { id, ...values } = input.warranty;
      if (id) {
        const [updated] = await tx
          .update(schema.warranties)
          .set({
            ...values,
            ...(values.lifetime ? { endsAt: null } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.warranties.id, id),
              eq(schema.warranties.productId, productId),
            ),
          )
          .returning();
        if (!updated) throw new Error("Warranty disappeared during update.");
        warranty = updated;
      } else {
        [warranty] = await tx
          .insert(schema.warranties)
          .values({
            productId,
            ...values,
            endsAt: values.lifetime ? null : values.endsAt,
          })
          .returning();
      }
      await tx.insert(schema.auditEvents).values({
        householdId,
        actorId,
        action: id ? "warranty.update" : "warranty.create",
        resourceType: "warranty",
        resourceId: warranty.id,
        summary: id ? "Updated warranty coverage" : "Added warranty coverage",
        metadata: { productId },
      });
    }
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "product.update",
      resourceType: "product",
      resourceId: product.id,
      summary: `Updated ${product.name}`,
      metadata: { aggregate: Boolean(input.warranty) },
    });
    return { product, warranty };
  });
}

export async function setProductArchived(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  archived: boolean,
) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .update(schema.products)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.products.id, productId),
          eq(schema.products.householdId, householdId),
        ),
      )
      .returning();
    if (!product) return null;
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: archived ? "product.archive" : "product.restore",
      resourceType: "product",
      resourceId: product.id,
      summary: `${archived ? "Archived" : "Restored"} ${product.name}`,
    });
    return product;
  });
}
