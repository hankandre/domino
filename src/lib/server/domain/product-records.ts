import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import type { ProductCreateInput } from "./products";

type Database = NodePgDatabase<typeof schema>;

export type ProductSourceInput =
  | { kind: "url"; label?: string; url: string }
  | {
      kind: "external";
      label?: string;
      url?: string;
      externalSystem: string;
      externalId: string;
    }
  | { kind: "paperless"; label?: string; externalId: string };

export type ProductRecordInput = {
  product: Omit<ProductCreateInput, "warranty" | "notes">;
  warranties: NonNullable<ProductCreateInput["warranty"]>[];
  notes: string[];
  sources: ProductSourceInput[];
  allowDuplicateOf?: string;
};

export type DuplicateMatch = {
  productId: string;
  name: string;
  reasons: string[];
};

export class IdempotencyConflictError extends Error {
  constructor() {
    super("The idempotency key was already used with different content.");
  }
}

export class DuplicateProductError extends Error {
  constructor(readonly matches: DuplicateMatch[]) {
    super("A product with the same durable identifier already exists.");
  }
}

function normalizedIdentifier(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "");
}

function normalizedText(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase().replaceAll(/\s+/g, " ");
}

export function productRecordRequestHash(input: ProductRecordInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function duplicateMatches(
  db: Database,
  householdId: string,
  input: ProductRecordInput,
) {
  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.householdId, householdId));
  if (products.length === 0) return { exact: [], warnings: [] };
  const productIds = products.map((product) => product.id);
  const [serials, sources] = await Promise.all([
    db
      .select()
      .from(schema.productSerials)
      .where(inArray(schema.productSerials.productId, productIds)),
    db
      .select()
      .from(schema.productSources)
      .where(eq(schema.productSources.householdId, householdId)),
  ]);
  const submittedSerials = new Set(
    (input.product.serialNumbers ?? [])
      .map(normalizedIdentifier)
      .filter(Boolean),
  );
  const submittedExternal = input.sources
    .filter(
      (source): source is Extract<ProductSourceInput, { kind: "external" }> =>
        source.kind === "external",
    )
    .map(
      (source) =>
        `${normalizedText(source.externalSystem)}:${normalizedIdentifier(source.externalId)}`,
    );
  const exact: DuplicateMatch[] = [];
  const warnings: DuplicateMatch[] = [];

  for (const product of products) {
    const reasons: string[] = [];
    const productSerials = serials
      .filter((serial) => serial.productId === product.id)
      .map((serial) => normalizedIdentifier(serial.value));
    if (
      submittedSerials.size > 0 &&
      productSerials.some((serial) => submittedSerials.has(serial))
    ) {
      reasons.push("serial_number");
    }
    const productExternal = new Set(
      sources
        .filter(
          (source) =>
            source.productId === product.id &&
            source.externalSystem &&
            source.externalId,
        )
        .map(
          (source) =>
            `${normalizedText(source.externalSystem)}:${normalizedIdentifier(source.externalId)}`,
        ),
    );
    if (submittedExternal.some((source) => productExternal.has(source))) {
      reasons.push("external_source");
    }
    if (
      normalizedText(input.product.retailer) &&
      normalizedText(input.product.orderNumber) &&
      normalizedText(input.product.brand) &&
      normalizedText(input.product.model) &&
      normalizedText(input.product.retailer) ===
        normalizedText(product.retailer) &&
      normalizedText(input.product.orderNumber) ===
        normalizedText(product.orderNumber) &&
      normalizedText(input.product.brand) === normalizedText(product.brand) &&
      normalizedText(input.product.model) === normalizedText(product.model)
    ) {
      reasons.push("retailer_order_product");
    }
    if (reasons.length) {
      exact.push({ productId: product.id, name: product.name, reasons });
      continue;
    }
    const sameBrandModel =
      normalizedText(input.product.brand) &&
      normalizedText(input.product.model) &&
      normalizedText(input.product.brand) === normalizedText(product.brand) &&
      normalizedText(input.product.model) === normalizedText(product.model);
    const sameName =
      normalizedText(input.product.name) === normalizedText(product.name);
    if (sameBrandModel || sameName) {
      warnings.push({
        productId: product.id,
        name: product.name,
        reasons: [sameBrandModel ? "similar_brand_model" : "similar_name"],
      });
    }
  }
  return { exact, warnings };
}

export async function validateProductRecord(
  db: Database,
  householdId: string,
  input: ProductRecordInput,
) {
  return duplicateMatches(db, householdId, input);
}

export async function createProductRecord(
  db: Database,
  householdId: string,
  actorId: string,
  idempotencyKey: string,
  requestHash: string,
  input: ProductRecordInput,
) {
  const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${actorId}:product-record:${keyHash}`}))`,
    );
    const [prior] = await tx
      .select()
      .from(schema.idempotencyKeys)
      .where(
        and(
          eq(schema.idempotencyKeys.actorId, actorId),
          eq(schema.idempotencyKeys.scope, "product-record"),
          eq(schema.idempotencyKeys.keyHash, keyHash),
        ),
      )
      .limit(1);
    if (prior) {
      if (prior.requestHash !== requestHash) {
        throw new IdempotencyConflictError();
      }
      return { ...prior.response, replayed: true };
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`household-products:${householdId}`}))`,
    );
    const matches = await duplicateMatches(tx, householdId, input);
    const overrideAccepted =
      input.allowDuplicateOf &&
      matches.exact.some((match) => match.productId === input.allowDuplicateOf);
    if (matches.exact.length && !overrideAccepted) {
      throw new DuplicateProductError(matches.exact);
    }

    const [product] = await tx
      .insert(schema.products)
      .values({
        householdId,
        name: input.product.name,
        brand: input.product.brand,
        model: input.product.model,
        category: input.product.category,
        retailer: input.product.retailer,
        orderNumber: input.product.orderNumber,
        productUrl: input.product.productUrl,
        purchaseDate: input.product.purchaseDate,
        purchasePriceMinor: input.product.purchasePriceMinor,
        currency: input.product.currency ?? "USD",
        createdByActorId: actorId,
      })
      .returning();
    const serialValues = [
      ...new Set(
        (input.product.serialNumbers ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (serialValues.length) {
      await tx.insert(schema.productSerials).values(
        serialValues.map((value) => ({
          productId: product.id,
          value,
        })),
      );
    }
    const createdWarranties = input.warranties.length
      ? await tx
          .insert(schema.warranties)
          .values(
            input.warranties.map((warranty) => ({
              productId: product.id,
              provider: warranty.provider,
              kind: warranty.kind ?? "manufacturer",
              startsAt: warranty.startsAt,
              endsAt: warranty.lifetime ? null : warranty.endsAt,
              lifetime: warranty.lifetime ?? false,
              terms: warranty.terms,
              claimUrl: warranty.claimUrl,
              claimPhone: warranty.claimPhone,
              claimEmail: warranty.claimEmail,
              eligibilityNotes: warranty.eligibilityNotes,
              claimDeadline: warranty.claimDeadline,
              claimInstructions: warranty.claimInstructions ?? [],
            })),
          )
          .returning()
      : [];
    const noteValues = input.notes.map((body) => body.trim()).filter(Boolean);
    const createdNotes = noteValues.length
      ? await tx
          .insert(schema.notes)
          .values(
            noteValues.map((body) => ({
              householdId,
              productId: product.id,
              authorActorId: actorId,
              body,
            })),
          )
          .returning()
      : [];
    const createdSources = input.sources.length
      ? await tx
          .insert(schema.productSources)
          .values(
            input.sources.map((source) => ({
              householdId,
              productId: product.id,
              kind: source.kind,
              label: source.label,
              url: "url" in source ? source.url : undefined,
              externalSystem:
                source.kind === "external"
                  ? source.externalSystem
                  : source.kind === "paperless"
                    ? "paperless"
                    : undefined,
              externalId:
                source.kind === "external" || source.kind === "paperless"
                  ? source.externalId
                  : undefined,
              addedByActorId: actorId,
            })),
          )
          .returning()
      : [];
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "product_record.create",
      resourceType: "product",
      resourceId: product.id,
      summary: `Added ${product.name} from an agent record`,
      metadata: {
        sourceCount: createdSources.length,
        warrantyCount: createdWarranties.length,
        noteCount: createdNotes.length,
        duplicateOverride: input.allowDuplicateOf ?? null,
      },
    });
    const response = {
      product,
      warranties: createdWarranties,
      notes: createdNotes,
      sources: createdSources,
      warnings: matches.warnings,
      replayed: false,
    };
    await tx.insert(schema.idempotencyKeys).values({
      householdId,
      actorId,
      scope: "product-record",
      keyHash,
      requestHash,
      statusCode: 201,
      response,
    });
    return response;
  });
}
