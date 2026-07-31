import { createHash } from "node:crypto";
import { afterEach, expect, test } from "bun:test";
import { and, count, eq } from "drizzle-orm";
import { app } from "../api";
import {
  actorRoles,
  actors,
  apiCredentials,
  auditEvents,
  productSerials,
  productSources,
  products,
  roles,
} from "../db/schema";
import { validateProductRecord } from "./product-records";
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
  const { household, suffix } = await database.household("Intake");
  const [role] = await db
    .insert(roles)
    .values({
      householdId: household.id,
      name: `Create only ${suffix}`,
      permissions: ["products:create"],
    })
    .returning({ id: roles.id });
  const [actor] = await db
    .insert(actors)
    .values({
      householdId: household.id,
      kind: "service",
      name: "Create-only intake agent",
    })
    .returning({ id: actors.id });
  await db.insert(actorRoles).values({ actorId: actor.id, roleId: role.id });
  const token = `domino_test_${crypto.randomUUID()}${crypto.randomUUID()}`;
  await db.insert(apiCredentials).values({
    actorId: actor.id,
    name: "Integration credential",
    tokenPrefix: token.slice(0, 12),
    tokenHash: createHash("sha256").update(token).digest("hex"),
  });
  const [existing] = await db
    .insert(products)
    .values({
      householdId: household.id,
      name: "Private compressor record",
      brand: "Acme",
      model: "Air 100",
    })
    .returning({ id: products.id });
  await db
    .insert(productSerials)
    .values({ productId: existing.id, value: "AB-123-XY" });
  return { db, household, token };
}

function recordInput() {
  return {
    product: {
      name: "Agent supplied compressor",
      serialNumbers: ["ab 123 xy"],
    },
    warranties: [],
    notes: [],
    sources: [],
  };
}

databaseIntegration("agent product intake", () => {
  test("finds normalized identifiers without disclosing product details", async () => {
    const fixture = await createFixture();
    const response = await app.request("/api/v1/product-records/validate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(recordInput()),
    });
    const body = (await response.json()) as {
      duplicates: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(body.duplicates).toEqual([{ reasons: ["serial_number"] }]);
    expect(JSON.stringify(body)).not.toContain("Private compressor record");

    const create = await app.request("/api/v1/product-records", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.token}`,
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify(recordInput()),
    });
    const conflict = (await create.json()) as {
      matches: Array<Record<string, unknown>>;
    };
    expect(create.status).toBe(409);
    expect(conflict.matches).toEqual([{ reasons: ["serial_number"] }]);
    expect(JSON.stringify(conflict)).not.toContain("Private compressor record");
  });

  test("bounds fuzzy duplicate candidates", async () => {
    const fixture = await createFixture();
    await fixture.db.insert(products).values(
      Array.from({ length: 60 }, (_, index) => ({
        householdId: fixture.household.id,
        name: "Shared appliance name",
        model: `Model ${index}`,
      })),
    );

    const matches = await validateProductRecord(
      fixture.db,
      fixture.household.id,
      {
        product: { name: "Shared appliance name" },
        warranties: [],
        notes: [],
        sources: [],
      },
    );
    expect(matches.warnings).toHaveLength(50);
  });

  test("replays idempotent intake with Paperless provenance and one audit event", async () => {
    const fixture = await createFixture();
    const idempotencyKey = `integration-${crypto.randomUUID()}`;
    const input = {
      product: {
        name: `Agent toaster ${crypto.randomUUID()}`,
        serialNumbers: [],
      },
      warranties: [],
      notes: [],
      sources: [
        {
          kind: "paperless" as const,
          label: "Paperless receipt",
          externalId: "4242",
        },
      ],
    };
    const request = (body: typeof input) =>
      app.request("/api/v1/product-records", {
        method: "POST",
        headers: {
          authorization: `Bearer ${fixture.token}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

    const created = await request(input);
    const createdBody = (await created.json()) as {
      product: { id: string };
      replayed: boolean;
    };
    const replay = await request(input);
    const replayBody = (await replay.json()) as {
      product: { id: string };
      replayed: boolean;
    };
    const conflicting = await request({
      ...input,
      product: { ...input.product, name: `${input.product.name} changed` },
    });

    expect(created.status).toBe(201);
    expect(createdBody.replayed).toBe(false);
    expect(replay.status).toBe(200);
    expect(replayBody).toMatchObject({
      product: { id: createdBody.product.id },
      replayed: true,
    });
    expect(conflicting.status).toBe(409);

    const [source] = await fixture.db
      .select()
      .from(productSources)
      .where(eq(productSources.productId, createdBody.product.id));
    expect(source).toMatchObject({
      kind: "paperless",
      externalSystem: "paperless",
      externalId: "4242",
    });
    const [auditCount] = await fixture.db
      .select({ value: count() })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.resourceId, createdBody.product.id),
          eq(auditEvents.action, "product_record.create"),
        ),
      );
    expect(auditCount.value).toBe(1);
  });
});
