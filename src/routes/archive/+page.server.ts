import type { PageServerLoad } from "./$types";
import {
  relatedReadAccess,
  requirePagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { listProductSummaries } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals }) => {
  requirePagePermission(locals.actor, "warranties:read");
  return {
    products:
      process.env.DOMINO_DEMO_MODE === "true"
        ? []
        : (
            await listProductSummaries(
              requireDb(),
              locals.actor!.householdId,
              true,
              relatedReadAccess(locals.actor),
            )
          ).filter((product) => product.archivedAt),
  };
};
