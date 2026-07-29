import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import {
  relatedReadAccess,
  requirePagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { getProductDetail } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals, params }) => {
  requirePagePermission(locals.actor, "warranties:read");
  const product =
    process.env.DOMINO_DEMO_MODE === "true"
      ? demoProducts.find((item) => item.id === params.id)
      : await getProductDetail(
          requireDb(),
          locals.actor!.householdId,
          params.id,
          relatedReadAccess(locals.actor),
        );
  if (!product) throw error(404, "Product not found");
  return { product };
};
