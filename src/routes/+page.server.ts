import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import {
  relatedReadAccess,
  requireAnyPagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { listProductSummaries } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals }) => {
  requireAnyPagePermission(locals.actor, ["products:read", "warranties:read"]);
  const products =
    process.env.DOMINO_DEMO_MODE === "true"
      ? demoProducts
      : await listProductSummaries(
          requireDb(),
          locals.actor!.householdId,
          false,
          relatedReadAccess(locals.actor),
        );
  return {
    products,
    openClaims: products.filter((product) => product.activeClaim).length,
    expiring: products.filter(
      (product) => product.coverageStatus === "expiring",
    ).length,
  };
};
