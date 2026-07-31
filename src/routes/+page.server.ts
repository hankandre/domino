import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import {
  relatedReadAccess,
  requireAnyPagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import {
  countHouseholdAttention,
  listProductSummaries,
} from "$lib/server/domain/products";

import {
  browserPageHref,
  browserPageWindow,
  MAX_SEARCH_CANDIDATES,
} from "$lib/server/pagination";
import {
  searchProducts,
  sortProductSummaries,
  type ProductSort,
  type SearchFilters,
} from "$lib/server/search";

const inventoryFilters = [
  "all",
  "claims",
  "expiring",
  "active",
  "expired",
  "unknown",
] as const;
type InventoryFilter = (typeof inventoryFilters)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAnyPagePermission(locals.actor, ["products:read", "warranties:read"]);
  const demoMode = process.env.DOMINO_DEMO_MODE === "true";
  const access = relatedReadAccess(locals.actor);
  const { page, limit, offset } = browserPageWindow(url.searchParams);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const requestedFilter = url.searchParams.get("filter");
  const filter: InventoryFilter = inventoryFilters.includes(
    requestedFilter as InventoryFilter,
  )
    ? (requestedFilter as InventoryFilter)
    : "all";
  const requestedSort = url.searchParams.get("sort");
  const sort: ProductSort = ["name", "warranty"].includes(requestedSort ?? "")
    ? (requestedSort as ProductSort)
    : "newest";
  const filters: SearchFilters = {
    query: query || undefined,
    hasClaim: filter === "claims" ? true : undefined,
    coverage: filter !== "all" && filter !== "claims" ? filter : undefined,
  };
  const hasSearch = Boolean(query || filter !== "all");
  const sourceRows = demoMode
    ? demoProducts
    : await listProductSummaries(
        requireDb(),
        locals.actor!.householdId,
        false,
        access,
        hasSearch
          ? { limit: MAX_SEARCH_CANDIDATES + 1, sort }
          : { limit: limit + 1, offset, sort },
      );
  const candidatesTruncated =
    hasSearch && sourceRows.length > MAX_SEARCH_CANDIDATES;
  const searched = hasSearch
    ? sortProductSummaries(
        searchProducts(sourceRows.slice(0, MAX_SEARCH_CANDIDATES), filters),
        sort,
      )
    : sourceRows;
  const products = hasSearch
    ? searched.slice(offset, offset + limit)
    : searched.slice(0, limit);
  const hasMore = hasSearch
    ? products.length === limit &&
      (offset + products.length < searched.length || candidatesTruncated)
    : sourceRows.length > limit;
  const attention = demoMode
    ? {
        openClaims: demoProducts.filter((product) => product.activeClaim)
          .length,
        expiring: demoProducts.filter(
          (product) => product.coverageStatus === "expiring",
        ).length,
      }
    : await countHouseholdAttention(
        requireDb(),
        locals.actor!.householdId,
        access,
      );
  return {
    products,
    inventoryPage: {
      page,
      hasMore,
      previousHref: page > 1 ? browserPageHref(url, page - 1) : null,
      nextHref: hasMore ? browserPageHref(url, page + 1) : null,
      query,
      filter,
      sort,
      total: hasSearch ? searched.length : null,
      totalIsExact: hasSearch ? !candidatesTruncated : false,
    },
    ...attention,
  };
};
