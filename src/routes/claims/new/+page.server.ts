import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import { requirePagePermission } from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { listProductSummaries } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals, url }) => {
  requirePagePermission(locals.actor, "claims:create");
  requirePagePermission(locals.actor, "warranties:read");
  return {
    products:
      process.env.DOMINO_DEMO_MODE === "true"
        ? demoProducts
        : await listProductSummaries(
            requireDb(),
            locals.actor!.householdId,
            false,
            { claims: false, documents: false, notes: false },
          ),
    selectedProductId: url.searchParams.get("product"),
  };
};
