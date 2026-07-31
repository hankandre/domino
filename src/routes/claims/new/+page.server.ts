import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import {
  requireAnyPagePermission,
  requirePagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import {
  getProductOption,
  listProductOptions,
} from "$lib/server/domain/products";
import { browserPageHref, browserPageWindow } from "$lib/server/pagination";

export const load: PageServerLoad = async ({ locals, url }) => {
  requirePagePermission(locals.actor, "claims:create");
  requireAnyPagePermission(locals.actor, ["products:read", "warranties:read"]);
  const { page, limit, offset } = browserPageWindow(url.searchParams);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const selectedProductId = url.searchParams.get("product");
  const rows =
    process.env.DOMINO_DEMO_MODE === "true"
      ? demoProducts
          .filter((product) =>
            `${product.brand} ${product.name} ${product.model} ${product.serialNumbers.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .slice(offset, offset + limit + 1)
          .map(({ id, name, brand, model }) => ({ id, name, brand, model }))
      : await listProductOptions(requireDb(), locals.actor!.householdId, {
          query: query || undefined,
          limit: limit + 1,
          offset,
        });
  const hasMore = rows.length > limit;
  const products = rows.slice(0, limit);
  if (
    selectedProductId &&
    !products.some(({ id }) => id === selectedProductId)
  ) {
    const selected =
      process.env.DOMINO_DEMO_MODE === "true"
        ? (demoProducts.find(({ id }) => id === selectedProductId) ?? null)
        : await getProductOption(
            requireDb(),
            locals.actor!.householdId,
            selectedProductId,
          );
    if (selected) products.unshift(selected);
  }
  return {
    products,
    selectedProductId,
    productSearch: {
      query,
      page,
      previousHref: page > 1 ? browserPageHref(url, page - 1) : null,
      nextHref: hasMore ? browserPageHref(url, page + 1) : null,
    },
  };
};
