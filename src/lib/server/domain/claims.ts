import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

type Database = NodePgDatabase<typeof schema>;

export type ClaimRelatedReadAccess = {
  documents: boolean;
  notes: boolean;
};

export function projectClaimRelatedData<
  T extends {
    documents?: unknown[];
    notes?: unknown[];
    events?: Array<{ eventType: string }>;
  },
>(claim: T, access: ClaimRelatedReadAccess): T {
  return {
    ...claim,
    ...("documents" in claim
      ? { documents: access.documents ? claim.documents : [] }
      : {}),
    ...("notes" in claim ? { notes: access.notes ? claim.notes : [] } : {}),
    ...("events" in claim
      ? {
          events: (claim.events ?? []).filter(
            (event) =>
              (access.notes || event.eventType !== "note_added") &&
              (access.documents || !event.eventType.startsWith("document_")),
          ),
        }
      : {}),
  } as T;
}

export async function listClaims(
  db: Database,
  householdId: string,
  claimIds?: string[],
) {
  if (claimIds?.length === 0) return [];
  const rows = await db
    .select({
      claim: schema.claims,
      productName: schema.products.name,
      productBrand: schema.products.brand,
      productModel: schema.products.model,
    })
    .from(schema.claims)
    .innerJoin(schema.products, eq(schema.claims.productId, schema.products.id))
    .where(
      and(
        eq(schema.claims.householdId, householdId),
        eq(schema.products.householdId, householdId),
        claimIds === undefined
          ? undefined
          : inArray(schema.claims.id, claimIds),
      ),
    )
    .orderBy(desc(schema.claims.updatedAt));
  return rows.map(({ claim, productName, productBrand, productModel }) => ({
    ...claim,
    product: {
      name: productName,
      brand: productBrand,
      model: productModel,
    },
  }));
}

export async function getClaim(
  db: Database,
  householdId: string,
  claimId: string,
  access: ClaimRelatedReadAccess,
  claimIds?: string[],
) {
  if (claimIds && !claimIds.includes(claimId)) return null;
  const [row] = await db
    .select({
      claim: schema.claims,
      productName: schema.products.name,
      productBrand: schema.products.brand,
      productModel: schema.products.model,
    })
    .from(schema.claims)
    .innerJoin(schema.products, eq(schema.claims.productId, schema.products.id))
    .where(
      and(
        eq(schema.claims.id, claimId),
        eq(schema.claims.householdId, householdId),
        eq(schema.products.householdId, householdId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [events, notes, documents, warrantyRows] = await Promise.all([
    db
      .select({
        id: schema.claimEvents.id,
        eventType: schema.claimEvents.eventType,
        title: schema.claimEvents.title,
        detail: schema.claimEvents.detail,
        metadata: schema.claimEvents.metadata,
        occurredAt: schema.claimEvents.occurredAt,
        actorName: schema.actors.name,
      })
      .from(schema.claimEvents)
      .leftJoin(schema.actors, eq(schema.claimEvents.actorId, schema.actors.id))
      .where(eq(schema.claimEvents.claimId, claimId))
      .orderBy(schema.claimEvents.occurredAt),
    access.notes
      ? db
          .select({
            id: schema.notes.id,
            body: schema.notes.body,
            createdAt: schema.notes.createdAt,
            updatedAt: schema.notes.updatedAt,
            authorName: schema.actors.name,
          })
          .from(schema.notes)
          .leftJoin(
            schema.actors,
            eq(schema.notes.authorActorId, schema.actors.id),
          )
          .where(
            and(
              eq(schema.notes.claimId, claimId),
              eq(schema.notes.householdId, householdId),
            ),
          )
          .orderBy(desc(schema.notes.createdAt))
      : Promise.resolve([]),
    access.documents
      ? db
          .select()
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.claimId, claimId),
              eq(schema.documents.householdId, householdId),
              isNull(schema.documents.trashedAt),
            ),
          )
      : Promise.resolve([]),
    db
      .select()
      .from(schema.warranties)
      .where(eq(schema.warranties.productId, row.claim.productId)),
  ]);
  const warranty =
    warrantyRows.find((item) => item.id === row.claim.warrantyId) ??
    warrantyRows[0] ??
    null;
  return projectClaimRelatedData(
    {
      ...row.claim,
      product: {
        name: row.productName,
        brand: row.productBrand,
        model: row.productModel,
      },
      events,
      notes,
      documents,
      warranty,
    },
    access,
  );
}

export async function createClaim(
  db: Database,
  householdId: string,
  actorId: string,
  productId: string,
  input: {
    issue: string;
    warrantyId?: string;
    nextAction?: string;
    noticedAt?: string;
    preferredResolution?: string;
  },
) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: schema.products.id })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, productId),
          eq(schema.products.householdId, householdId),
        ),
      )
      .limit(1);
    if (!product) return null;
    if (input.warrantyId) {
      const [warranty] = await tx
        .select({ id: schema.warranties.id })
        .from(schema.warranties)
        .where(
          and(
            eq(schema.warranties.id, input.warrantyId),
            eq(schema.warranties.productId, productId),
          ),
        )
        .limit(1);
      if (!warranty) return null;
    }

    const reference = `CLM-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const [claim] = await tx
      .insert(schema.claims)
      .values({
        householdId,
        productId,
        warrantyId: input.warrantyId,
        reference,
        issue: input.issue,
        noticedAt: input.noticedAt,
        preferredResolution: input.preferredResolution,
        nextAction: input.nextAction,
        openedByActorId: actorId,
      })
      .returning();
    const [actor] = await tx
      .select({ claimAccessScope: schema.actors.claimAccessScope })
      .from(schema.actors)
      .where(eq(schema.actors.id, actorId))
      .limit(1);
    if (actor?.claimAccessScope === "selected") {
      await tx
        .insert(schema.actorClaimAccess)
        .values({ actorId, claimId: claim.id, grantedByActorId: actorId })
        .onConflictDoNothing();
    }
    await tx.insert(schema.claimEvents).values({
      claimId: claim.id,
      actorId,
      eventType: "created",
      title: "Claim opened",
      detail: input.issue,
    });
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "claim.create",
      resourceType: "claim",
      resourceId: claim.id,
      summary: `Opened ${reference}`,
    });
    return claim;
  });
}

export async function updateClaim(
  db: Database,
  householdId: string,
  actorId: string,
  claimId: string,
  input: {
    status?: (typeof schema.claimStatus.enumValues)[number];
    nextAction?: string | null;
    resolution?: string | null;
    explanation?: string;
  },
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.id, claimId),
          eq(schema.claims.householdId, householdId),
        ),
      )
      .limit(1);
    if (!existing) return null;

    const [claim] = await tx
      .update(schema.claims)
      .set({
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.nextAction === undefined
          ? {}
          : { nextAction: input.nextAction }),
        ...(input.resolution === undefined
          ? {}
          : { resolution: input.resolution }),
        ...(input.status === "submitted" && !existing.filedAt
          ? { filedAt: new Date() }
          : {}),
        ...(["resolved", "closed"].includes(input.status ?? "")
          ? { resolvedAt: new Date() }
          : input.status !== undefined
            ? { resolvedAt: null }
            : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.claims.id, claimId))
      .returning();

    const statusChanged = input.status && input.status !== existing.status;
    const detailsChanged =
      input.nextAction !== undefined || input.resolution !== undefined;
    if (statusChanged || detailsChanged || input.explanation) {
      await tx.insert(schema.claimEvents).values({
        claimId,
        actorId,
        eventType: statusChanged ? "status_changed" : "details_updated",
        title: statusChanged
          ? `Status changed from ${existing.status} to ${input.status}`
          : "Claim details updated",
        detail: input.explanation,
        metadata: {
          ...(statusChanged
            ? { previousStatus: existing.status, status: input.status }
            : {}),
          ...(input.nextAction !== undefined
            ? {
                previousNextAction: existing.nextAction,
                nextAction: input.nextAction,
              }
            : {}),
          ...(input.resolution !== undefined
            ? {
                previousResolution: existing.resolution,
                resolution: input.resolution,
              }
            : {}),
        },
      });
    }
    await tx.insert(schema.auditEvents).values({
      householdId,
      actorId,
      action: "claim.update",
      resourceType: "claim",
      resourceId: claimId,
      summary: `Updated ${existing.reference}`,
      metadata: statusChanged
        ? { previousStatus: existing.status, status: input.status }
        : {},
    });
    return claim;
  });
}
