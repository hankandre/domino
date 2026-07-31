import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { requireDb } from "../db";
import { documentPurgeJobs, documents, households } from "../db/schema";
import { purgeExpiredDocuments } from "./documents";

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

integration("failure-safe document purging", () => {
  test("processes only the requested maintenance batch", async () => {
    const db = requireDb();
    const [household] = await db
      .insert(households)
      .values({ name: "Bounded purge", slug: `purge-${crypto.randomUUID()}` })
      .returning({ id: households.id });
    householdIds.push(household.id);
    await db.insert(documents).values(
      Array.from({ length: 3 }, (_, index) => ({
        householdId: household.id,
        kind: "manual" as const,
        backend: "local" as const,
        name: `Manual ${index}.pdf`,
        trashedAt: new Date(Date.now() - 60_000),
        purgeAfter: new Date(Date.now() - 30_000 + index),
      })),
    );

    expect(await purgeExpiredDocuments(db, { limit: 1 })).toBe(1);
    const remaining = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.householdId, household.id));
    expect(remaining).toHaveLength(2);
  });

  test("removes the database record first and retries failed file cleanup", async () => {
    const db = requireDb();
    const directory = await mkdtemp("/tmp/domino-document-purge-");
    temporaryDirectories.push(directory);
    process.env.DOMINO_UPLOAD_DIR = directory;
    const storageKey = "ab/document.bin";
    const destination = join(directory, storageKey);
    await mkdir(join(directory, "ab"), { recursive: true });
    await writeFile(destination, "warranty manual");

    const [household] = await db
      .insert(households)
      .values({
        name: "Purge test",
        slug: `purge-${crypto.randomUUID()}`,
      })
      .returning({ id: households.id });
    householdIds.push(household.id);
    const [document] = await db
      .insert(documents)
      .values({
        householdId: household.id,
        kind: "manual",
        backend: "local",
        name: "Manual.pdf",
        mimeType: "application/pdf",
        localStorageKey: storageKey,
        processingStatus: "ready",
        trashedAt: new Date(Date.now() - 60_000),
        purgeAfter: new Date(Date.now() - 30_000),
      })
      .returning({ id: documents.id });
    const firstRun = new Date();
    await purgeExpiredDocuments(db, {
      now: firstRun,
      unlinkFile: async () => {
        throw new Error("simulated storage outage");
      },
    });

    const [remainingDocument] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, document.id));
    const [retry] = await db
      .select()
      .from(documentPurgeJobs)
      .where(eq(documentPurgeJobs.documentId, document.id));
    expect(remainingDocument).toBeUndefined();
    expect(retry).toMatchObject({
      attempts: 1,
      lastError: "simulated storage outage",
    });
    await expect(stat(destination)).resolves.toBeTruthy();

    await purgeExpiredDocuments(db, {
      now: new Date(firstRun.getTime() + 3 * 60_000),
    });
    const [completed] = await db
      .select({ id: documentPurgeJobs.id })
      .from(documentPurgeJobs)
      .where(eq(documentPurgeJobs.documentId, document.id));
    expect(completed).toBeUndefined();
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
