import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { downloadProductImage } from "../image-suggestions";

type Database = NodePgDatabase<typeof schema>;

function storageRoot() {
  return resolve(process.env.DOMINO_UPLOAD_DIR ?? "/data/uploads");
}

async function productExists(
  db: Database,
  householdId: string,
  productId: string,
) {
  return (
    await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, productId),
          eq(schema.products.householdId, householdId),
        ),
      )
      .limit(1)
  )[0];
}

async function saveImage(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  bytes: Buffer,
  contentType: string,
  sourceUrl?: string,
) {
  if (!(await productExists(db, householdId, productId))) return null;
  const supportedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
  ]);
  if (
    !supportedTypes.has(contentType) ||
    bytes.length === 0 ||
    bytes.length > 10 * 1024 * 1024
  ) {
    throw new Error(
      "Product images must be a supported image no larger than 10 MiB.",
    );
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await db
    .select()
    .from(schema.productImages)
    .where(
      and(
        eq(schema.productImages.productId, productId),
        sourceUrl
          ? eq(schema.productImages.sourceUrl, sourceUrl)
          : eq(schema.productImages.sha256, sha256),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(schema.productImages)
      .set({ primary: sql`(${schema.productImages.id} = ${existing.id})` })
      .where(eq(schema.productImages.productId, productId));
    return existing;
  }
  const extension =
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
      "image/gif": "gif",
    }[contentType] ?? "img";
  const key = `images/${randomBytes(24).toString("hex")}.${extension}`;
  const path = resolve(storageRoot(), key);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  try {
    return await db.transaction(async (tx) => {
      await tx
        .update(schema.productImages)
        .set({ primary: false })
        .where(eq(schema.productImages.productId, productId));
      const [image] = await tx
        .insert(schema.productImages)
        .values({
          productId,
          sourceUrl,
          storageKey: key,
          sha256,
          altText: "Product image",
          primary: true,
          confirmedByActorId: actorId,
        })
        .returning();
      await tx.insert(schema.auditEvents).values({
        householdId,
        actorId,
        action: "product.image.confirm",
        resourceType: "product_image",
        resourceId: image.id,
        summary: "Confirmed a product image",
        metadata: { productId, source: sourceUrl ? "remote" : "upload" },
      });
      return image;
    });
  } catch (cause) {
    await unlink(path).catch(() => undefined);
    throw cause;
  }
}

export async function saveUploadedProductImage(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  file: File,
) {
  return saveImage(
    db,
    householdId,
    actorId,
    productId,
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
}

export async function saveFetchedProductImage(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  sourceUrl: string,
) {
  const image = await downloadProductImage(sourceUrl);
  return saveImage(
    db,
    householdId,
    actorId,
    productId,
    image.bytes,
    image.contentType,
    sourceUrl,
  );
}

export async function openProductImage(
  db: Database,
  householdId: string,
  imageId: string,
) {
  const [image] = await db
    .select({
      id: schema.productImages.id,
      storageKey: schema.productImages.storageKey,
    })
    .from(schema.productImages)
    .innerJoin(
      schema.products,
      eq(schema.productImages.productId, schema.products.id),
    )
    .where(
      and(
        eq(schema.productImages.id, imageId),
        eq(schema.products.householdId, householdId),
      ),
    )
    .limit(1);
  if (!image?.storageKey) return null;
  const path = resolve(storageRoot(), image.storageKey);
  if (!path.startsWith(`${storageRoot()}/`)) return null;
  if (!(await stat(path).catch(() => null))?.isFile()) return null;
  const extension = path.split(".").at(-1);
  const contentType =
    {
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      avif: "image/avif",
      gif: "image/gif",
    }[extension ?? ""] ?? "application/octet-stream";
  return {
    body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
    contentType,
  };
}
