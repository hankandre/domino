import { describe, expect, it } from "vitest";
import { demoProducts } from "$lib/demo";
import { searchProducts } from "./search";

describe("searchProducts", () => {
  it("fuzzy matches a misspelled product name", () => {
    const results = searchProducts(demoProducts, { query: "kitchenaid mixr" });
    expect(results[0]?.id).toBe("kitchenaid-mixer");
  });

  it("filters coverage by expiration window", () => {
    const results = searchProducts(demoProducts, {
      expiresAfter: "2026-01-01",
      expiresBefore: "2026-03-01",
    });
    expect(results.map((product) => product.id).sort()).toEqual([
      "dyson-vacuum",
      "kitchenaid-mixer",
    ]);
  });

  it("finds only products with an open claim", () => {
    const results = searchProducts(demoProducts, { hasClaim: true });
    expect(results).toHaveLength(2);
    expect(results.every((product) => product.activeClaim)).toBe(true);
  });

  it("matches an order identifier", () => {
    const results = searchProducts(demoProducts, { query: "HD-5128347" });
    expect(results[0]?.id).toBe("bosch-dishwasher");
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
});
