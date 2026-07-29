import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { paperlessClientForHousehold } from "../integrations/paperless";

type Database = NodePgDatabase<typeof schema>;
type DocumentKind = (typeof schema.documentKind.enumValues)[number];

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function storageRoot() {
  return resolve(process.env.DOMINO_UPLOAD_DIR ?? "/data/uploads");
}

async function assertAssociation(
  db: Database,
  householdId: string,
  productId?: string,
  claimId?: string,
) {
  if (productId) {
    const [product] = await db
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, productId),
          eq(schema.products.householdId, householdId),
        ),
      )
      .limit(1);
    if (!product) return false;
  }
  if (claimId) {
    const [claim] = await db
      .select({ id: schema.claims.id, productId: schema.claims.productId })
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.id, claimId),
          eq(schema.claims.householdId, householdId),
        ),
      )
      .limit(1);
    if (!claim) return false;
    if (productId && claim.productId !== productId) return false;
  }
  return true;
}

export async function listDocuments(
  db: Database,
  householdId: string,
  includeTrash = false,
) {
  const rows = await db
    .select()
    .from(schema.documents)
    .where(
      includeTrash
        ? eq(schema.documents.householdId, householdId)
        : and(
            eq(schema.documents.householdId, householdId),
            isNull(schema.documents.trashedAt),
          ),
    )
    .orderBy(schema.documents.createdAt);
  return rows;
}

export async function attachDocument(
  db: Database,
  householdId: string,
  actorId: string,
  input: {
    file: File;
    name?: string;
    kind: DocumentKind;
    backend?: "local" | "paperless";
    productId?: string;
    claimId?: string;
  },
) {
  if (input.file.size <= 0 || input.file.size > MAX_FILE_BYTES) {
    throw new Error("Attachments must be between 1 byte and 50 MiB.");
  }
  if (
    !(await assertAssociation(db, householdId, input.productId, input.claimId))
  )
    return null;
  const [household] = await db
    .select({ backend: schema.households.defaultDocumentBackend })
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
    .limit(1);
  const backend = household?.backend ?? "local";
  if (input.backend && input.backend !== backend) {
    throw new Error(
      `This household uses ${backend === "paperless" ? "Paperless-ngx" : "Domino storage"} as its authoritative document backend.`,
    );
  }
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const name = (input.name || input.file.name || "attachment").slice(0, 255);

  if (backend === "paperless") {
    const client = await paperlessClientForHousehold(db, householdId);
    if (!client) {
      throw new Error(
        "Paperless-ngx is authoritative, but its URL or token is not configured.",
      );
    }
    const task = await client.upload(
      new Blob([bytes], { type: input.file.type }),
      name,
    );
    const taskId = String(task);
    return db.transaction(async (tx) => {
      const [document] = await tx
        .insert(schema.documents)
        .values({
          householdId,
          productId: input.productId,
          claimId: input.claimId,
          kind: input.kind,
          backend,
          name,
          mimeType: input.file.type || "application/octet-stream",
          sizeBytes: input.file.size,
          sha256,
          paperlessTaskId: taskId,
          processingStatus: "processing",
          uploadedByActorId: actorId,
        })
        .returning();
      await tx.insert(schema.auditEvents).values({
        householdId,
        actorId,
        action: "document.attach",
        resourceType: "document",
        resourceId: document.id,
        summary: `Attached ${name}`,
        metadata: { backend, kind: input.kind },
      });
      if (input.claimId) {
        await tx.insert(schema.claimEvents).values({
          claimId: input.claimId,
          actorId,
          eventType: "document_attached",
          title: `Attached ${input.kind}`,
          detail: name,
          metadata: { documentId: document.id, backend },
        });
      }
      return document;
    });
  }

  const key = join(
    sha256.slice(0, 2),
    `${randomBytes(20).toString("hex")}.bin`,
  );
  const destination = resolve(storageRoot(), key);
  if (!destination.startsWith(`${storageRoot()}/`))
    throw new Error("Invalid storage path.");
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, bytes, { mode: 0o600, flag: "wx" });
  try {
    return await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(schema.documents)
        .values({
          householdId,
          productId: input.productId,
          claimId: input.claimId,
          kind: input.kind,
          backend,
          name,
          mimeType: input.file.type || "application/octet-stream",
          sizeBytes: input.file.size,
          sha256,
          localStorageKey: key,
          processingStatus: "ready",
          uploadedByActorId: actorId,
        })
        .returning();
      await tx.insert(schema.auditEvents).values({
        householdId,
        actorId,
        action: "document.attach",
        resourceType: "document",
        resourceId: document.id,
        summary: `Attached ${name}`,
        metadata: { backend, kind: input.kind },
      });
      if (input.claimId) {
        await tx.insert(schema.claimEvents).values({
          claimId: input.claimId,
          actorId,
          eventType: "document_attached",
          title: `Attached ${input.kind}`,
          detail: name,
          metadata: { documentId: document.id, backend },
        });
      }
      return document;
    });
  } catch (cause) {
    await unlink(destination).catch(() => undefined);
    throw cause;
  }
}

export async function linkPaperlessDocument(
  db: Database,
  householdId: string,
  actorId: string,
  input: {
    paperlessDocumentId: number;
    kind: DocumentKind;
    productId?: string;
    claimId?: string;
  },
) {
  if (
    !(await assertAssociation(db, householdId, input.productId, input.claimId))
  )
    return null;
  const [household] = await db
    .select({ backend: schema.households.defaultDocumentBackend })
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
    .limit(1);
  if (household?.backend !== "paperless") {
    throw new Error(
      "Paperless-ngx is not this household’s authoritative document backend.",
    );
  }
  const client = await paperlessClientForHousehold(db, householdId);
  if (!client) throw new Error("Paperless-ngx is not configured.");
  const source = await client.getDocument(input.paperlessDocumentId);
  return db.transaction(async (tx) => {
    const [document] = await tx
      .insert(schema.documents)
      .values({
        householdId,
        productId: input.productId,
        claimId: input.claimId,
        kind: input.kind,
        backend: "paperless",
        name: source.title,
        paperlessDocumentId: source.id,
        paperlessUrl: client.documentUrl(source.id),
        processingStatus: "ready",
        uploadedByActorId: actorId,
      })
      .returning();
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "document.link",
      resourceType: "document",
      resourceId: document.id,
      summary: `Linked ${source.title} from Paperless-ngx`,
      metadata: { paperlessDocumentId: source.id, kind: input.kind },
    });
    if (input.claimId) {
      await tx.insert(schema.claimEvents).values({
        claimId: input.claimId,
        actorId,
        eventType: "document_attached",
        title: `Linked ${input.kind}`,
        detail: source.title,
        metadata: { documentId: document.id, backend: "paperless" },
      });
    }
    return document;
  });
}

export async function refreshPaperlessDocument(
  db: Database,
  householdId: string,
  documentId: string,
) {
  const [document] = await db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.id, documentId),
        eq(schema.documents.householdId, householdId),
      ),
    )
    .limit(1);
  if (!document?.paperlessTaskId || document.backend !== "paperless")
    return document ?? null;
  const client = await paperlessClientForHousehold(db, householdId);
  if (!client) throw new Error("Paperless-ngx is not configured.");
  const task = await client.getTask(document.paperlessTaskId);
  if (!task || !["SUCCESS", "FAILURE"].includes(task.status)) return document;
  const documentIdNumber =
    task.status === "SUCCESS" ? Number(task.result) : null;
  const [updated] = await db
    .update(schema.documents)
    .set({
      processingStatus: task.status === "SUCCESS" ? "ready" : "failed",
      paperlessDocumentId: Number.isInteger(documentIdNumber)
        ? documentIdNumber
        : null,
      paperlessUrl:
        documentIdNumber !== null && Number.isInteger(documentIdNumber)
          ? client.documentUrl(documentIdNumber)
          : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.documents.id, document.id))
    .returning();
  return updated;
}

export async function openLocalDocument(
  db: Database,
  householdId: string,
  documentId: string,
) {
  const [document] = await db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.id, documentId),
        eq(schema.documents.householdId, householdId),
        eq(schema.documents.backend, "local"),
        isNull(schema.documents.trashedAt),
      ),
    )
    .limit(1);
  if (!document?.localStorageKey) return null;
  const path = resolve(storageRoot(), document.localStorageKey);
  if (!path.startsWith(`${storageRoot()}/`)) return null;
  const fileStat = await stat(path).catch(() => null);
  if (!fileStat?.isFile()) return null;
  return {
    document,
    body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
  };
}

export async function trashDocument(
  db: Database,
  householdId: string,
  actorId: string,
  documentId: string,
) {
  const [document] = await db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.id, documentId),
        eq(schema.documents.householdId, householdId),
      ),
    )
    .limit(1);
  if (!document) return null;
  if (document.backend === "paperless") {
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.documents)
        .where(eq(schema.documents.id, document.id));
      await tx.insert(schema.auditEvents).values({
        householdId,
        actorId,
        action: "document.unlink",
        resourceType: "document",
        resourceId: document.id,
        summary: `Unlinked ${document.name} from Domino`,
        metadata: { backend: "paperless" },
      });
      if (document.claimId) {
        await tx.insert(schema.claimEvents).values({
          claimId: document.claimId,
          actorId,
          eventType: "document_removed",
          title: "Document unlinked",
          detail: document.name,
          metadata: { documentId: document.id, backend: "paperless" },
        });
      }
    });
    return { unlinked: true, trashed: false };
  }
  const purgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.documents)
      .set({ trashedAt: new Date(), purgeAfter, updatedAt: new Date() })
      .where(eq(schema.documents.id, document.id));
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "document.trash",
      resourceType: "document",
      resourceId: document.id,
      summary: `Moved ${document.name} to trash`,
      metadata: { purgeAfter: purgeAfter.toISOString() },
    });
    if (document.claimId) {
      await tx.insert(schema.claimEvents).values({
        claimId: document.claimId,
        actorId,
        eventType: "document_removed",
        title: "Document moved to trash",
        detail: document.name,
        metadata: { documentId: document.id },
      });
    }
  });
  return { unlinked: false, trashed: true, purgeAfter };
}

export async function restoreDocument(
  db: Database,
  householdId: string,
  actorId: string,
  documentId: string,
) {
  return db.transaction(async (tx) => {
    const [document] = await tx
      .update(schema.documents)
      .set({ trashedAt: null, purgeAfter: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.householdId, householdId),
        ),
      )
      .returning();
    if (!document) return null;
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "document.restore",
      resourceType: "document",
      resourceId: document.id,
      summary: `Restored ${document.name}`,
    });
    if (document.claimId) {
      await tx.insert(schema.claimEvents).values({
        claimId: document.claimId,
        actorId,
        eventType: "document_restored",
        title: "Document restored",
        detail: document.name,
        metadata: { documentId: document.id },
      });
    }
    return document;
  });
}

export async function purgeExpiredDocuments(db: Database) {
  const expired = await db
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.backend, "local"),
        lt(schema.documents.purgeAfter, new Date()),
      ),
    );
  for (const document of expired) {
    if (document.localStorageKey) {
      await unlink(resolve(storageRoot(), document.localStorageKey)).catch(
        () => undefined,
      );
    }
    await db
      .delete(schema.documents)
      .where(eq(schema.documents.id, document.id));
  }
  return expired.length;
}
