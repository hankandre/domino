import type { PageServerLoad } from "./$types";
import { requireDb } from "$lib/server/db";
import { listProductSummaries } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals }) => ({
  products:
    process.env.DOMINO_DEMO_MODE !== "false"
      ? []
      : (
          await listProductSummaries(
            requireDb(),
            locals.actor!.householdId,
            true,
          )
        ).filter((product) => product.archivedAt),
});
