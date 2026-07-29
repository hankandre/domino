import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import { requireDb } from "$lib/server/db";
import { listProductSummaries } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals, url }) => ({
  products:
    process.env.DOMINO_DEMO_MODE !== "false"
      ? demoProducts
      : await listProductSummaries(requireDb(), locals.actor!.householdId),
  selectedProductId: url.searchParams.get("product"),
});
