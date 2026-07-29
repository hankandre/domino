import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ProductSummary } from "$lib/types";
import * as schema from "../db/schema";

type Database = NodePgDatabase<typeof schema>;

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
    claimInstructions?: Array<{
      title: string;
      detail?: string;
      required: boolean;
    }>;
  };
};

export async function listProductSummaries(
  db: Database,
  householdId: string,
  includeArchived = false,
): Promise<ProductSummary[]> {
  const productRows = await db
    .select()
    .from(schema.products)
    .where(
      includeArchived
        ? eq(schema.products.householdId, householdId)
        : and(
            eq(schema.products.householdId, householdId),
            isNull(schema.products.archivedAt),
          ),
    );
  if (!productRows.length) return [];

  const ids = productRows.map((product) => product.id);
  const [
    serialRows,
    warrantyRows,
    imageRows,
    documentRows,
    noteRows,
    claimRows,
  ] = await Promise.all([
    db
      .select()
      .from(schema.productSerials)
      .where(inArray(schema.productSerials.productId, ids)),
    db
      .select()
      .from(schema.warranties)
      .where(inArray(schema.warranties.productId, ids)),
    db
      .select()
      .from(schema.productImages)
      .where(inArray(schema.productImages.productId, ids)),
    db
      .select()
      .from(schema.documents)
      .where(
        and(
          inArray(schema.documents.productId, ids),
          eq(schema.documents.householdId, householdId),
          isNull(schema.documents.trashedAt),
        ),
      ),
    db
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
          inArray(schema.notes.productId, ids),
          eq(schema.notes.householdId, householdId),
        ),
      ),
    db
      .select()
      .from(schema.claims)
      .where(
        and(
          inArray(schema.claims.productId, ids),
          eq(schema.claims.householdId, householdId),
        ),
      ),
  ]);

  const expiryWindowDays =
    (
      await db
        .select({ days: schema.households.expiryWindowDays })
        .from(schema.households)
        .where(eq(schema.households.id, householdId))
        .limit(1)
    )[0]?.days ?? 60;
  const today = new Date();
  const expiryCutoff = new Date(today);
  expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() + expiryWindowDays);
  const todayIso = today.toISOString().slice(0, 10);
  const cutoffIso = expiryCutoff.toISOString().slice(0, 10);

  return productRows.map((product) => {
    const productWarranties = warrantyRows.filter(
      (row) => row.productId === product.id,
    );
    const selectedWarranty =
      productWarranties.find((row) => row.lifetime) ??
      productWarranties
        .filter((row) => row.endsAt)
        .toSorted((a, b) => (b.endsAt ?? "").localeCompare(a.endsAt ?? ""))[0];
    const coverageStatus = selectedWarranty?.lifetime
      ? "lifetime"
      : !selectedWarranty?.endsAt
        ? "unknown"
        : selectedWarranty.endsAt < todayIso
          ? "expired"
          : selectedWarranty.endsAt <= cutoffIso
            ? "expiring"
            : "active";
    const activeClaim = claimRows
      .filter(
        (row) =>
          row.productId === product.id &&
          !["resolved", "closed"].includes(row.status),
      )
      .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const primaryImage =
      imageRows.find((row) => row.productId === product.id && row.primary) ??
      imageRows.find((row) => row.productId === product.id);

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
        ? `/api/v1/product-images/${primaryImage.id}/content`
        : (primaryImage?.sourceUrl ?? null),
      documents: documentRows.filter((row) => row.productId === product.id)
        .length,
      notes: noteRows.filter((row) => row.productId === product.id).length,
      serialNumbers: serialRows
        .filter((row) => row.productId === product.id)
        .map((row) => row.value),
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
  });
}

export async function getProductDetail(
  db: Database,
  householdId: string,
  productId: string,
) {
  const summaries = await listProductSummaries(db, householdId, true);
  const summary = summaries.find((product) => product.id === productId);
  if (!summary) return null;

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
  const [warranties, notes, documents, claimRows, images] = await Promise.all([
    db
      .select()
      .from(schema.warranties)
      .where(eq(schema.warranties.productId, productId)),
    db
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
        ),
      )
      .orderBy(desc(schema.notes.createdAt)),
    db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.productId, productId),
          eq(schema.documents.householdId, householdId),
          isNull(schema.documents.trashedAt),
        ),
      ),
    db
      .select()
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.productId, productId),
          eq(schema.claims.householdId, householdId),
        ),
      ),
    db
      .select()
      .from(schema.productImages)
      .where(eq(schema.productImages.productId, productId)),
  ]);
  return {
    ...summary,
    productUrl: product.productUrl,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    purchasePriceMinor: product.purchasePriceMinor,
    currency: product.currency,
    warranties,
    notes,
    documents,
    claims: claimRows,
    images,
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

export async function setProductArchived(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  archived: boolean,
) {
  const [product] = await db
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
  await db.insert(schema.auditEvents).values({
    householdId,
    actorId,
    action: archived ? "product.archive" : "product.restore",
    resourceType: "product",
    resourceId: product.id,
    summary: `${archived ? "Archived" : "Restored"} ${product.name}`,
  });
  return product;
}
