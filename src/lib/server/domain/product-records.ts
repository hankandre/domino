import { createHash } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
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

function normalizedIdentifierColumn(column: unknown) {
  return sql<string>`upper(regexp_replace(coalesce(${column}, ''), '[^A-Za-z0-9]', '', 'g'))`;
}

function normalizedTextColumn(column: unknown) {
  return sql<string>`lower(regexp_replace(trim(coalesce(${column}, '')), '[[:space:]]+', ' ', 'g'))`;
}

export function productRecordRequestHash(input: ProductRecordInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function duplicateMatches(
  db: Database,
  householdId: string,
  input: ProductRecordInput,
) {
  const submittedSerials = [
    ...new Set(
      (input.product.serialNumbers ?? [])
        .map(normalizedIdentifier)
        .filter(Boolean),
    ),
  ];
  const submittedExternal = input.sources
    .filter(
      (source): source is Extract<ProductSourceInput, { kind: "external" }> =>
        source.kind === "external",
    )
    .map(
      (source) =>
        `${normalizedText(source.externalSystem)}:${normalizedIdentifier(source.externalId)}`,
    );
  const retailer = normalizedText(input.product.retailer);
  const orderNumber = normalizedText(input.product.orderNumber);
  const brand = normalizedText(input.product.brand);
  const model = normalizedText(input.product.model);
  const name = normalizedText(input.product.name);
  const [serialMatches, externalMatches, orderMatches, similarMatches] =
    await Promise.all([
      submittedSerials.length
        ? db
            .select({
              productId: schema.products.id,
              name: schema.products.name,
            })
            .from(schema.productSerials)
            .innerJoin(
              schema.products,
              eq(schema.productSerials.productId, schema.products.id),
            )
            .where(
              and(
                eq(schema.products.householdId, householdId),
                inArray(
                  normalizedIdentifierColumn(schema.productSerials.value),
                  submittedSerials,
                ),
              ),
            )
            .limit(50)
        : Promise.resolve([]),
      submittedExternal.length
        ? db
            .select({
              productId: schema.products.id,
              name: schema.products.name,
            })
            .from(schema.productSources)
            .innerJoin(
              schema.products,
              eq(schema.productSources.productId, schema.products.id),
            )
            .where(
              and(
                eq(schema.productSources.householdId, householdId),
                inArray(
                  sql<string>`${normalizedTextColumn(schema.productSources.externalSystem)} || ':' || ${normalizedIdentifierColumn(schema.productSources.externalId)}`,
                  submittedExternal,
                ),
              ),
            )
            .limit(50)
        : Promise.resolve([]),
      retailer && orderNumber && brand && model
        ? db
            .select({
              productId: schema.products.id,
              name: schema.products.name,
            })
            .from(schema.products)
            .where(
              and(
                eq(schema.products.householdId, householdId),
                eq(normalizedTextColumn(schema.products.retailer), retailer),
                eq(
                  normalizedTextColumn(schema.products.orderNumber),
                  orderNumber,
                ),
                eq(normalizedTextColumn(schema.products.brand), brand),
                eq(normalizedTextColumn(schema.products.model), model),
              ),
            )
            .limit(50)
        : Promise.resolve([]),
      db
        .select({
          productId: schema.products.id,
          name: schema.products.name,
          sameName: sql<boolean>`${normalizedTextColumn(schema.products.name)} = ${name}`,
          sameBrandModel: sql<boolean>`${normalizedTextColumn(schema.products.brand)} = ${brand} and ${normalizedTextColumn(schema.products.model)} = ${model}`,
        })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.householdId, householdId),
            or(
              eq(normalizedTextColumn(schema.products.name), name),
              brand && model
                ? and(
                    eq(normalizedTextColumn(schema.products.brand), brand),
                    eq(normalizedTextColumn(schema.products.model), model),
                  )
                : undefined,
            ),
          ),
        )
        .limit(50),
    ]);

  const exactByProduct = new Map<string, DuplicateMatch>();
  const addExact = (
    match: { productId: string; name: string },
    reason: string,
  ) => {
    const existing = exactByProduct.get(match.productId);
    if (existing) existing.reasons.push(reason);
    else exactByProduct.set(match.productId, { ...match, reasons: [reason] });
  };
  for (const match of serialMatches) addExact(match, "serial_number");
  for (const match of externalMatches) addExact(match, "external_source");
  for (const match of orderMatches) addExact(match, "retailer_order_product");

  const warnings = similarMatches
    .filter((match) => !exactByProduct.has(match.productId))
    .map((match) => ({
      productId: match.productId,
      name: match.name,
      reasons: [match.sameBrandModel ? "similar_brand_model" : "similar_name"],
    }));
  return { exact: [...exactByProduct.values()], warnings };
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
              submissionMethods: warranty.submissionMethods ?? [],
              requiredEvidence: warranty.requiredEvidence ?? [],
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
