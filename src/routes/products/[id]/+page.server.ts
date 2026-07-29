import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import { requireDb } from "$lib/server/db";
import { getProductDetail } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals, params }) => {
  const product =
    process.env.DOMINO_DEMO_MODE !== "false"
      ? demoProducts.find((item) => item.id === params.id)
      : await getProductDetail(
          requireDb(),
          locals.actor!.householdId,
          params.id,
        );
  if (!product) throw error(404, "Product not found");
  return { product };
};
