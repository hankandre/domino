import Fuse from "fuse.js";
import type { ProductSummary } from "$lib/types";

export interface SearchFilters {
  query?: string;
  coverage?: "active" | "expiring" | "expired" | "lifetime" | "unknown";
  hasClaim?: boolean;
  purchasedAfter?: string;
  purchasedBefore?: string;
  expiresAfter?: string;
  expiresBefore?: string;
}

export type ProductSort = "newest" | "name" | "warranty";

export function sortProductSummaries(
  products: ProductSummary[],
  sort: ProductSort,
) {
  return products.toSorted((a, b) => {
    if (sort === "name")
      return `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`);
    if (sort === "warranty") {
      return (a.warrantyEndsAt ?? "9999-12-31").localeCompare(
        b.warrantyEndsAt ?? "9999-12-31",
      );
    }
    return b.purchasedAt.localeCompare(a.purchasedAt);
  });
}

function within(value: string | null, after?: string, before?: string) {
  if (!value) return false;
  if (after && value < after) return false;
  if (before && value > before) return false;
  return true;
}

export function searchProducts(
  products: ProductSummary[],
  filters: SearchFilters,
) {
  let result = products.filter((product) => {
    if (filters.coverage && product.coverageStatus !== filters.coverage)
      return false;
    if (
      filters.hasClaim !== undefined &&
      Boolean(product.activeClaim) !== filters.hasClaim
    )
      return false;
    if (
      (filters.purchasedAfter || filters.purchasedBefore) &&
      !within(
        product.purchasedAt,
        filters.purchasedAfter,
        filters.purchasedBefore,
      )
    ) {
      return false;
    }
    if (
      (filters.expiresAfter || filters.expiresBefore) &&
      !within(
        product.warrantyEndsAt,
        filters.expiresAfter,
        filters.expiresBefore,
      )
    ) {
      return false;
    }
    return true;
  });

  const query = filters.query?.trim();
  if (!query) return result;

  const fuse = new Fuse(result, {
    includeScore: true,
    threshold: 0.36,
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 2 },
      { name: "brand", weight: 1.6 },
      { name: "model", weight: 1.5 },
      { name: "serialNumbers", weight: 1.5 },
      { name: "orderNumber", weight: 1.4 },
      { name: "retailer", weight: 0.8 },
      { name: "category", weight: 0.7 },
      { name: "activeClaim.summary", weight: 0.6 },
    ],
  });

  result = fuse.search(query).map((match) => match.item);
  return result;
}
