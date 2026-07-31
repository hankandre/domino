import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { requireDb } from "../db";
import {
  claims,
  claimEvents,
  documents,
  households,
  notes,
  productSerials,
  products,
  warranties,
} from "../db/schema";
import { getClaim, listClaims } from "./claims";
import { listDocuments } from "./documents";
import {
  countHouseholdAttention,
  getProductDetail,
  listExpiringProductSummaries,
  listProductSummaries,
} from "./products";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
const integration = databaseAvailable ? describe : describe.skip;
const householdIds: string[] = [];

afterEach(async () => {
  if (!databaseAvailable) return;
  for (const householdId of householdIds.splice(0)) {
    await requireDb().delete(households).where(eq(households.id, householdId));
  }
});

async function createFixture() {
  const db = requireDb();
  const suffix = crypto.randomUUID().slice(0, 8);
  const [household] = await db
    .insert(households)
    .values({ name: `Bounds ${suffix}`, slug: `bounds-${suffix}` })
    .returning({ id: households.id });
  householdIds.push(household.id);
  const productRows = await db
    .insert(products)
    .values(
      ["Mixer", "Vacuum", "Washer"].map((name) => ({
        householdId: household.id,
        name,
      })),
    )
    .returning({ id: products.id });
  const claimRows = await db
    .insert(claims)
    .values(
      productRows.map((product, index) => ({
        householdId: household.id,
        productId: product.id,
        reference: `BOUND-${index}`,
        issue: `Issue ${index}`,
      })),
    )
    .returning({ id: claims.id });
  await db.insert(documents).values(
    productRows.map((product, index) => ({
      householdId: household.id,
      productId: product.id,
      backend: "local" as const,
      name: `Document ${index}`,
    })),
  );
  const date = (days: number) => {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  await db.insert(warranties).values([
    { productId: productRows[0]!.id, endsAt: date(30) },
    { productId: productRows[1]!.id, lifetime: true },
    { productId: productRows[2]!.id, endsAt: date(-30) },
  ]);
  await db
    .update(products)
    .set({ archivedAt: new Date() })
    .where(eq(products.id, productRows[2]!.id));
  return { db, household, productRows, claimRows };
}

integration("bounded collection reads", () => {
  test("applies stable limit and offset windows to core collections", async () => {
    const fixture = await createFixture();
    const access = { claims: true, documents: true, notes: true };

    const [productsPageOne, productsPageTwo, claimsPage, documentsPage] =
      await Promise.all([
        listProductSummaries(fixture.db, fixture.household.id, false, access, {
          limit: 1,
        }),
        listProductSummaries(fixture.db, fixture.household.id, false, access, {
          limit: 1,
          offset: 1,
        }),
        listClaims(fixture.db, fixture.household.id, undefined, { limit: 2 }),
        listDocuments(fixture.db, fixture.household.id, false, undefined, {
          limit: 2,
          offset: 1,
        }),
      ]);

    expect(productsPageOne).toHaveLength(1);
    expect(productsPageTwo).toHaveLength(1);
    expect(productsPageTwo[0]?.id).not.toBe(productsPageOne[0]?.id);
    expect(claimsPage).toHaveLength(2);
    expect(documentsPage).toHaveLength(2);
  });

  test("selects archive and expiration views before applying their bounds", async () => {
    const fixture = await createFixture();
    const access = { claims: true, documents: true, notes: true };

    const [archived, expiring, attention] = await Promise.all([
      listProductSummaries(fixture.db, fixture.household.id, true, access, {
        archive: "only",
      }),
      listExpiringProductSummaries(fixture.db, fixture.household.id, access),
      countHouseholdAttention(fixture.db, fixture.household.id, access),
    ]);

    expect(archived.map((product) => product.name)).toEqual(["Washer"]);
    expect(expiring.map((product) => product.name)).toEqual(["Mixer"]);
    expect(attention).toEqual({ expiring: 1, openClaims: 2 });
  });

  test("bounds nested detail records while keeping summary counts exact", async () => {
    const fixture = await createFixture();
    const productId = fixture.productRows[0]!.id;
    const access = { claims: true, documents: true, notes: true };

    await Promise.all([
      fixture.db.insert(productSerials).values(
        Array.from({ length: 25 }, (_, index) => ({
          productId,
          value: `SERIAL-${index.toString().padStart(2, "0")}`,
        })),
      ),
      fixture.db.insert(notes).values(
        Array.from({ length: 205 }, (_, index) => ({
          householdId: fixture.household.id,
          productId,
          body: `Note ${index}`,
        })),
      ),
      fixture.db.insert(documents).values(
        Array.from({ length: 205 }, (_, index) => ({
          householdId: fixture.household.id,
          productId,
          backend: "local" as const,
          name: `Extra document ${index}`,
        })),
      ),
      fixture.db.insert(warranties).values(
        Array.from({ length: 205 }, (_, index) => ({
          productId,
          provider: `Provider ${index}`,
        })),
      ),
      fixture.db.insert(claims).values(
        Array.from({ length: 205 }, (_, index) => ({
          householdId: fixture.household.id,
          productId,
          reference: `MANY-${index}`,
          issue: `Issue ${index}`,
        })),
      ),
    ]);

    const [summary] = await listProductSummaries(
      fixture.db,
      fixture.household.id,
      false,
      access,
      { productIds: [productId] },
    );
    const detail = await getProductDetail(
      fixture.db,
      fixture.household.id,
      productId,
      access,
    );

    expect(summary).toMatchObject({ documents: 206, notes: 205 });
    expect(summary?.serialNumbers).toHaveLength(20);
    expect(detail?.warranties).toHaveLength(200);
    expect(detail?.documents).toHaveLength(200);
    expect(detail?.notes).toHaveLength(200);
    expect(detail?.claims).toHaveLength(200);
    expect(detail?.relatedPage).toMatchObject({
      warrantiesTruncated: true,
      documentsTruncated: true,
      notesTruncated: true,
      claimsTruncated: true,
      serialNumbersTruncated: true,
    });
  });

  test("bounds claim timelines and related evidence", async () => {
    const fixture = await createFixture();
    const claimId = fixture.claimRows[0]!.id;

    await Promise.all([
      fixture.db.insert(claimEvents).values(
        Array.from({ length: 205 }, (_, index) => ({
          claimId,
          eventType: "details_updated" as const,
          title: `Event ${index}`,
        })),
      ),
      fixture.db.insert(notes).values(
        Array.from({ length: 205 }, (_, index) => ({
          householdId: fixture.household.id,
          claimId,
          body: `Claim note ${index}`,
        })),
      ),
      fixture.db.insert(documents).values(
        Array.from({ length: 205 }, (_, index) => ({
          householdId: fixture.household.id,
          claimId,
          backend: "local" as const,
          name: `Claim evidence ${index}`,
        })),
      ),
    ]);

    const claim = await getClaim(fixture.db, fixture.household.id, claimId, {
      documents: true,
      notes: true,
    });

    expect(claim?.events).toHaveLength(200);
    expect(claim?.notes).toHaveLength(200);
    expect(claim?.documents).toHaveLength(200);
    expect(claim?.relatedPage).toEqual({
      eventsTruncated: true,
      notesTruncated: true,
      documentsTruncated: true,
    });
  });
});
