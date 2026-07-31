import { mkdtemp, rm, stat } from "node:fs/promises";
import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { requireDb } from "../db";
import { actors, households, productImages, products } from "../db/schema";
import { openProductImage, saveUploadedProductImage } from "./images";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
const integration = databaseAvailable ? describe : describe.skip;
const originalUploadDirectory = process.env.DOMINO_UPLOAD_DIR;
const householdIds: string[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  if (databaseAvailable) {
    for (const householdId of householdIds.splice(0)) {
      await requireDb()
        .delete(households)
        .where(eq(households.id, householdId));
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
  if (originalUploadDirectory === undefined)
    delete process.env.DOMINO_UPLOAD_DIR;
  else process.env.DOMINO_UPLOAD_DIR = originalUploadDirectory;
});

integration("product image variants", () => {
  test("creates and serves a bounded thumbnail beside the original", async () => {
    const db = requireDb();
    const directory = await mkdtemp("/tmp/domino-image-variants-");
    temporaryDirectories.push(directory);
    process.env.DOMINO_UPLOAD_DIR = directory;
    const [household] = await db
      .insert(households)
      .values({ name: "Image test", slug: `image-${crypto.randomUUID()}` })
      .returning({ id: households.id });
    householdIds.push(household.id);
    const [actor] = await db
      .insert(actors)
      .values({ householdId: household.id, kind: "service", name: "Test" })
      .returning({ id: actors.id });
    const [product] = await db
      .insert(products)
      .values({ householdId: household.id, name: "Camera" })
      .returning({ id: products.id });
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    const image = await saveUploadedProductImage(
      db,
      household.id,
      actor.id,
      product.id,
      new File([png], "camera.png", { type: "image/png" }),
    );
    expect(image?.thumbnailStorageKey).toMatch(
      /^images\/thumbnails\/.+\.webp$/,
    );
    await expect(
      stat(`${directory}/${image!.thumbnailStorageKey}`),
    ).resolves.toMatchObject({ size: expect.any(Number) });

    const original = await openProductImage(db, household.id, image!.id);
    const thumbnail = await openProductImage(
      db,
      household.id,
      image!.id,
      "thumbnail",
    );
    expect(original?.contentType).toBe("image/png");
    expect(thumbnail?.contentType).toBe("image/webp");
    expect(
      (await new Response(thumbnail!.body).arrayBuffer()).byteLength,
    ).toBeGreaterThan(0);

    const [stored] = await db
      .select({ thumbnailStorageKey: productImages.thumbnailStorageKey })
      .from(productImages)
      .where(eq(productImages.id, image!.id));
    expect(stored.thumbnailStorageKey).toBe(image!.thumbnailStorageKey);

    await db
      .update(productImages)
      .set({ thumbnailStorageKey: null })
      .where(eq(productImages.id, image!.id));
    const upgradedThumbnail = await openProductImage(
      db,
      household.id,
      image!.id,
      "thumbnail",
    );
    expect(upgradedThumbnail?.contentType).toBe("image/webp");
    const [upgraded] = await db
      .select({ thumbnailStorageKey: productImages.thumbnailStorageKey })
      .from(productImages)
      .where(eq(productImages.id, image!.id));
    expect(upgraded.thumbnailStorageKey).toMatch(
      /^images\/thumbnails\/.+\.webp$/,
    );
    expect(upgraded.thumbnailStorageKey).not.toBe(image!.thumbnailStorageKey);
  });
});
