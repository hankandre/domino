import { describe, expect, test } from "vitest";
import { projectClaimRelatedData } from "./claims";
import { projectProductRelatedData } from "./products";

describe("permission-aware related-data projections", () => {
  test("removes related records from a warranty-only product detail", () => {
    const projected = projectProductRelatedData(
      {
        id: "product-one",
        activeClaim: { id: "claim-one", issue: "Private claim" },
        claims: [{ id: "claim-one" }],
        documents: [{ id: "document-one", name: "Private document" }],
        notes: [{ id: "note-one", body: "Private note" }],
      },
      { claims: false, documents: false, notes: false },
    );

    expect(projected.activeClaim).toBeUndefined();
    expect(projected.claims).toEqual([]);
    expect(projected.documents).toEqual([]);
    expect(projected.notes).toEqual([]);
  });

  test("removes documents and notes from claim detail independently", () => {
    const projected = projectClaimRelatedData(
      {
        id: "claim-one",
        documents: [{ id: "document-one" }],
        notes: [{ id: "note-one" }],
      },
      { documents: false, notes: true },
    );

    expect(projected.documents).toEqual([]);
    expect(projected.notes).toEqual([{ id: "note-one" }]);
  });
});
