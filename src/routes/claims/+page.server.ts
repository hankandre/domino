import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import { requirePagePermission } from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { listClaims } from "$lib/server/domain/claims";
import { browserPageHref, browserPageWindow } from "$lib/server/pagination";

export const load: PageServerLoad = async ({ locals, url }) => {
  requirePagePermission(locals.actor, "claims:read");
  const { page, limit, offset } = browserPageWindow(url.searchParams);
  const rows =
    process.env.DOMINO_DEMO_MODE === "true"
      ? demoProducts.flatMap((product) =>
          product.activeClaim
            ? [
                {
                  ...product.activeClaim,
                  issue: product.activeClaim.summary,
                  productId: product.id,
                  product: {
                    name: product.name,
                    brand: product.brand,
                    model: product.model,
                  },
                  createdAt: new Date("2026-05-17T14:42:00Z"),
                  updatedAt: new Date("2026-05-18T14:42:00Z"),
                },
              ]
            : [],
        )
      : await listClaims(
          requireDb(),
          locals.actor!.householdId,
          locals.actor!.claimIds,
          { limit: limit + 1, offset },
        );
  const pageRows =
    process.env.DOMINO_DEMO_MODE === "true"
      ? rows.slice(offset, offset + limit + 1)
      : rows;
  const hasMore = pageRows.length > limit;
  return {
    claims: pageRows.slice(0, limit),
    claimsPage: {
      page,
      previousHref: page > 1 ? browserPageHref(url, page - 1) : null,
      nextHref: hasMore ? browserPageHref(url, page + 1) : null,
    },
  };
};
