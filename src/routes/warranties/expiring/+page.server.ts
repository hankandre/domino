import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import {
  relatedReadAccess,
  requireAnyPagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { listExpiringProductSummaries } from "$lib/server/domain/products";
import { browserPageHref, browserPageWindow } from "$lib/server/pagination";

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAnyPagePermission(locals.actor, ["products:read", "warranties:read"]);
  const { page, limit, offset } = browserPageWindow(url.searchParams);
  const rows =
    process.env.DOMINO_DEMO_MODE === "true"
      ? demoProducts
          .filter((product) => product.coverageStatus === "expiring")
          .slice(offset, offset + limit + 1)
      : await listExpiringProductSummaries(
          requireDb(),
          locals.actor!.householdId,
          relatedReadAccess(locals.actor),
          { limit: limit + 1, offset },
        );
  const hasMore = rows.length > limit;
  return {
    products: rows.slice(0, limit),
    expiringPage: {
      page,
      previousHref: page > 1 ? browserPageHref(url, page - 1) : null,
      nextHref: hasMore ? browserPageHref(url, page + 1) : null,
    },
  };
};
