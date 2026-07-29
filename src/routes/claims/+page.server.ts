import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import { requireDb } from "$lib/server/db";
import { listClaims } from "$lib/server/domain/claims";

export const load: PageServerLoad = async ({ locals }) => ({
  claims:
    process.env.DOMINO_DEMO_MODE !== "false"
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
      : await listClaims(requireDb(), locals.actor!.householdId),
});
