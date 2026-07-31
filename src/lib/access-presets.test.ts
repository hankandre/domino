import { describe, expect, test } from "bun:test";
import {
  claimIdsForPreset,
  isAttentionClaimStatus,
  isOpenClaimStatus,
  resolveClaimPreset,
  sameSelection,
} from "./access-presets";

const claims = [
  { id: "draft", status: "draft" },
  { id: "review", status: "in_review" },
  { id: "denied", status: "denied" },
  { id: "resolved", status: "resolved" },
  { id: "closed", status: "closed" },
];

describe("claim access presets", () => {
  test("resolves all preset meanings independently", () => {
    expect(resolveClaimPreset("all", claims)).toEqual({
      scope: "all",
      claimIds: claims.map((claim) => claim.id),
    });
    expect(claimIdsForPreset("open", claims)).toEqual([
      "draft",
      "review",
      "denied",
    ]);
    expect(claimIdsForPreset("attention", claims)).toEqual(["draft", "denied"]);
    expect(claimIdsForPreset("none", claims)).toEqual([]);
  });

  test("keeps preset identity separate when an empty household yields equal sets", () => {
    expect(resolveClaimPreset("open", [])).toEqual({
      scope: "selected",
      claimIds: [],
    });
    expect(resolveClaimPreset("attention", [])).toEqual({
      scope: "selected",
      claimIds: [],
    });
    expect(resolveClaimPreset("none", [])).toEqual({
      scope: "selected",
      claimIds: [],
    });
  });

  test("resolves one-claim households without collapsing preset identity", () => {
    const oneClaim = [{ id: "only", status: "needs_evidence" }];
    expect(resolveClaimPreset("all", oneClaim)).toEqual({
      scope: "all",
      claimIds: ["only"],
    });
    expect(resolveClaimPreset("open", oneClaim)).toEqual({
      scope: "selected",
      claimIds: ["only"],
    });
    expect(resolveClaimPreset("attention", oneClaim)).toEqual({
      scope: "selected",
      claimIds: ["only"],
    });
    expect(resolveClaimPreset("none", oneClaim)).toEqual({
      scope: "selected",
      claimIds: [],
    });
  });

  test("compares manual selections without depending on order", () => {
    expect(sameSelection(["one", "two"], ["two", "one"])).toBe(true);
    expect(sameSelection(["one"], ["one", "two"])).toBe(false);
  });

  test("groups every claim status for open and attention views", () => {
    const statuses = [
      "draft",
      "needs_evidence",
      "submitted",
      "in_review",
      "approved",
      "denied",
      "resolved",
      "closed",
    ];

    expect(statuses.filter(isOpenClaimStatus)).toEqual([
      "draft",
      "needs_evidence",
      "submitted",
      "in_review",
      "approved",
      "denied",
    ]);
    expect(statuses.filter(isAttentionClaimStatus)).toEqual([
      "draft",
      "needs_evidence",
      "denied",
    ]);
  });
});
