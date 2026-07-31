import { afterEach, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { actors, auditEvents, products, warranties } from "../db/schema";
import { setProductArchived, updateProductRecord } from "./products";
import {
  createDatabaseFixture,
  databaseIntegration,
} from "../../../test/server/database-fixture";

const database = createDatabaseFixture();

afterEach(async () => {
  await database.cleanup();
});

async function createFixture() {
  const db = database.db;
  const { household } = await database.household("Product");
  const [actor] = await db
    .insert(actors)
    .values({
      householdId: household.id,
      kind: "service",
      name: "Product test actor",
    })
    .returning({ id: actors.id });
  const [product] = await db
    .insert(products)
    .values({ householdId: household.id, name: "Original product" })
    .returning({ id: products.id });
  const [warranty] = await db
    .insert(warranties)
    .values({ productId: product.id, provider: "Original provider" })
    .returning({ id: warranties.id });
  return { db, household, actor, product, warranty };
}

databaseIntegration("product mutation transactions", () => {
  test("persists structured claim guidance in aggregate warranty edits", async () => {
    const fixture = await createFixture();

    await updateProductRecord(
      fixture.db,
      fixture.household.id,
      fixture.actor.id,
      fixture.product.id,
      {
        product: {},
        warranty: {
          id: fixture.warranty.id,
          submissionMethods: ["web", "phone"],
          requiredEvidence: [
            { label: "Proof of purchase", required: true },
            { label: "Damage photo", required: false },
          ],
          claimInstructions: [
            {
              title: "Open a support request",
              detail: "Save the confirmation number.",
              required: true,
            },
          ],
        },
      },
    );

    const [warranty] = await fixture.db
      .select({
        submissionMethods: warranties.submissionMethods,
        requiredEvidence: warranties.requiredEvidence,
        claimInstructions: warranties.claimInstructions,
      })
      .from(warranties)
      .where(eq(warranties.id, fixture.warranty.id));

    expect(warranty.submissionMethods).toEqual(["web", "phone"]);
    expect(warranty.requiredEvidence).toEqual([
      { label: "Proof of purchase", required: true },
      { label: "Damage photo", required: false },
    ]);
    expect(warranty.claimInstructions).toEqual([
      {
        title: "Open a support request",
        detail: "Save the confirmation number.",
        required: true,
      },
    ]);
  });

  test("rolls back aggregate product and warranty edits when auditing fails", async () => {
    const fixture = await createFixture();

    await expect(
      updateProductRecord(
        fixture.db,
        fixture.household.id,
        crypto.randomUUID(),
        fixture.product.id,
        {
          product: { name: "Changed product" },
          warranty: {
            id: fixture.warranty.id,
            provider: "Changed provider",
          },
        },
      ),
    ).rejects.toThrow();

    const [product] = await fixture.db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, fixture.product.id));
    const [warranty] = await fixture.db
      .select({ provider: warranties.provider })
      .from(warranties)
      .where(eq(warranties.id, fixture.warranty.id));
    const events = await fixture.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.resourceId, fixture.product.id));

    expect(product.name).toBe("Original product");
    expect(warranty.provider).toBe("Original provider");
    expect(events).toHaveLength(0);
  });

  test("rolls back archive state when its audit event cannot be written", async () => {
    const fixture = await createFixture();

    await expect(
      setProductArchived(
        fixture.db,
        fixture.household.id,
        crypto.randomUUID(),
        fixture.product.id,
        true,
      ),
    ).rejects.toThrow();

    const [productAfterFailure] = await fixture.db
      .select({ archivedAt: products.archivedAt })
      .from(products)
      .where(eq(products.id, fixture.product.id));
    expect(productAfterFailure.archivedAt).toBeNull();

    await setProductArchived(
      fixture.db,
      fixture.household.id,
      fixture.actor.id,
      fixture.product.id,
      true,
    );
    const [archivedProduct] = await fixture.db
      .select({ archivedAt: products.archivedAt })
      .from(products)
      .where(eq(products.id, fixture.product.id));
    const events = await fixture.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.resourceType, "product"),
          eq(auditEvents.resourceId, fixture.product.id),
        ),
      );

    expect(archivedProduct.archivedAt).toBeInstanceOf(Date);
    expect(events).toEqual([{ action: "product.archive" }]);
  });
});
