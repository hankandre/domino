import { describe, expect, it } from "bun:test";
import { DEMO_PRODUCT_IDS, demoProducts } from "$lib/demo";
import { idParamInput } from "./api/common.schemas";
import { searchQuery } from "./api/products.schemas";
import { searchProducts } from "./search";

describe("searchProducts", () => {
  it("uses API-compatible identifiers for every demo product and claim", () => {
    for (const product of demoProducts) {
      expect(idParamInput.safeParse({ id: product.id }).success).toBe(true);
      if (product.activeClaim) {
        expect(
          idParamInput.safeParse({ id: product.activeClaim.id }).success,
        ).toBe(true);
      }
    }
  });

  it("fuzzy matches a misspelled product name", () => {
    const results = searchProducts(demoProducts, { query: "kitchenaid mixr" });
    expect(results[0]?.id).toBe(DEMO_PRODUCT_IDS.kitchenaidMixer);
  });

  it("filters coverage by expiration window", () => {
    const results = searchProducts(demoProducts, {
      expiresAfter: "2026-01-01",
      expiresBefore: "2026-03-01",
    });
    expect(results.map((product) => product.id).sort()).toEqual([
      DEMO_PRODUCT_IDS.kitchenaidMixer,
      DEMO_PRODUCT_IDS.dysonVacuum,
    ]);
  });

  it("finds only products with an open claim", () => {
    const results = searchProducts(demoProducts, { hasClaim: true });
    expect(results).toHaveLength(2);
    expect(results.every((product) => product.activeClaim)).toBe(true);
  });

  it("matches an order identifier", () => {
    const results = searchProducts(demoProducts, { query: "HD-5128347" });
    expect(results[0]?.id).toBe(DEMO_PRODUCT_IDS.boschDishwasher);
  });

  it("distinguishes missing coverage from expired coverage", () => {
    const product = {
      ...demoProducts[0],
      id: "coverage-missing",
      warrantyEndsAt: null,
      coverageStatus: "unknown" as const,
    };
    expect(
      searchProducts([product], { coverage: "unknown" }).map((item) => item.id),
    ).toEqual(["coverage-missing"]);
    expect(searchProducts([product], { coverage: "expired" })).toEqual([]);
  });

  it("accepts real ISO dates and rejects impossible search dates", () => {
    expect(
      searchQuery.parse({
        purchasedAfter: "2024-02-29",
        expiresBefore: "2027-12-31",
      }),
    ).toMatchObject({
      purchasedAfter: "2024-02-29",
      expiresBefore: "2027-12-31",
    });
    expect(
      searchQuery.safeParse({ purchasedAfter: "2026-02-30" }).success,
    ).toBe(false);
    expect(searchQuery.safeParse({ expiresBefore: "07/31/2026" }).success).toBe(
      false,
    );
  });

  it("treats date range endpoints as inclusive", () => {
    const product = demoProducts[0];
    expect(
      searchProducts([product], {
        purchasedAfter: product.purchasedAt,
        purchasedBefore: product.purchasedAt,
        expiresAfter: product.warrantyEndsAt ?? undefined,
        expiresBefore: product.warrantyEndsAt ?? undefined,
      }),
    ).toEqual([product]);
  });
});
