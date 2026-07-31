import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  mkdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { downloadProductImage } from "../image-suggestions";
import { stageUpload, type UploadSource } from "./upload-staging";

type Database = NodePgDatabase<typeof schema>;

const maximumImageBytes = 10 * 1024 * 1024;

export class ImageUploadSizeError extends Error {
  constructor() {
    super("Product images must be a supported image no larger than 10 MiB.");
  }
}

type ImagePayload = {
  size: number;
  sha256: string;
  persist: (destination: string) => Promise<void>;
};

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

async function writeThumbnail(sourcePath: string, destinationPath: string) {
  await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
  await sharp(sourcePath, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: 640,
      height: 480,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 78 })
    .toFile(destinationPath);
  await chmod(destinationPath, 0o600);
}

async function saveImage(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  payload: ImagePayload,
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
    payload.size === 0 ||
    payload.size > maximumImageBytes
  ) {
    throw new Error(
      "Product images must be a supported image no larger than 10 MiB.",
    );
  }
  const sha256 = payload.sha256;
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
  const thumbnailKey = `images/thumbnails/${randomBytes(24).toString("hex")}.webp`;
  const path = resolve(storageRoot(), key);
  const thumbnailPath = resolve(storageRoot(), thumbnailKey);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await payload.persist(path);
  try {
    await writeThumbnail(path, thumbnailPath);
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
          thumbnailStorageKey: thumbnailKey,
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
    await unlink(thumbnailPath).catch(() => undefined);
    throw cause;
  }
}

export async function saveUploadedProductImage(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  file: UploadSource,
) {
  if (
    file.size !== undefined &&
    (file.size <= 0 || file.size > maximumImageBytes)
  ) {
    throw new ImageUploadSizeError();
  }
  const staged = await stageUpload(
    file,
    maximumImageBytes,
    () => new ImageUploadSizeError(),
  );
  try {
    return await saveImage(
      db,
      householdId,
      actorId,
      productId,
      {
        size: staged.size,
        sha256: staged.sha256,
        persist: (destination) => rename(staged.path, destination),
      },
      file.type,
    );
  } finally {
    await unlink(staged.path).catch(() => undefined);
  }
}

export async function saveFetchedProductImage(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  sourceUrl: string,
) {
  const image = await downloadProductImage(sourceUrl);
  const sha256 = createHash("sha256").update(image.bytes).digest("hex");
  return saveImage(
    db,
    householdId,
    actorId,
    productId,
    {
      size: image.bytes.length,
      sha256,
      persist: (destination) =>
        writeFile(destination, image.bytes, { flag: "wx", mode: 0o600 }),
    },
    image.contentType,
    sourceUrl,
  );
}

export async function openProductImage(
  db: Database,
  householdId: string,
  imageId: string,
  variant: "original" | "thumbnail" = "original",
) {
  const [image] = await db
    .select({
      id: schema.productImages.id,
      storageKey: schema.productImages.storageKey,
      thumbnailStorageKey: schema.productImages.thumbnailStorageKey,
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
  let storageKey = image.storageKey;
  if (variant === "thumbnail") {
    storageKey = image.thumbnailStorageKey ?? image.storageKey;
    if (!image.thumbnailStorageKey) {
      const originalPath = resolve(storageRoot(), image.storageKey);
      if (!originalPath.startsWith(`${storageRoot()}/`)) return null;
      const generatedKey = `images/thumbnails/${randomBytes(24).toString("hex")}.webp`;
      const generatedPath = resolve(storageRoot(), generatedKey);
      try {
        await writeThumbnail(originalPath, generatedPath);
        const [updated] = await db
          .update(schema.productImages)
          .set({ thumbnailStorageKey: generatedKey })
          .where(
            and(
              eq(schema.productImages.id, image.id),
              isNull(schema.productImages.thumbnailStorageKey),
            ),
          )
          .returning({
            thumbnailStorageKey: schema.productImages.thumbnailStorageKey,
          });
        if (updated?.thumbnailStorageKey) {
          storageKey = updated.thumbnailStorageKey;
        } else {
          await unlink(generatedPath).catch(() => undefined);
          const [current] = await db
            .select({
              thumbnailStorageKey: schema.productImages.thumbnailStorageKey,
            })
            .from(schema.productImages)
            .where(eq(schema.productImages.id, image.id))
            .limit(1);
          storageKey = current?.thumbnailStorageKey ?? image.storageKey;
        }
      } catch {
        await unlink(generatedPath).catch(() => undefined);
      }
    }
  }
  const path = resolve(storageRoot(), storageKey);
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
    body: Readable.toWeb(
      createReadStream(path),
    ) as unknown as ReadableStream<Uint8Array>,
    contentType,
  };
}
