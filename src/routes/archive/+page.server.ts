import type { PageServerLoad } from "./$types";
import {
  relatedReadAccess,
  requireAnyPagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { listProductSummaries } from "$lib/server/domain/products";
import { browserPageHref, browserPageWindow } from "$lib/server/pagination";

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAnyPagePermission(locals.actor, ["products:read", "warranties:read"]);
  const { page, limit, offset } = browserPageWindow(url.searchParams);
  const rows =
    process.env.DOMINO_DEMO_MODE === "true"
      ? []
      : await listProductSummaries(
          requireDb(),
          locals.actor!.householdId,
          true,
          relatedReadAccess(locals.actor),
          { archive: "only", limit: limit + 1, offset },
        );
  const hasMore = rows.length > limit;
  return {
    products: rows.slice(0, limit),
    archivePage: {
      page,
      previousHref: page > 1 ? browserPageHref(url, page - 1) : null,
      nextHref: hasMore ? browserPageHref(url, page + 1) : null,
    },
  };
};
