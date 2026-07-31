import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { demoProducts } from "$lib/demo";
import {
  relatedReadAccess,
  requireAnyPagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { getProductDetail } from "$lib/server/domain/products";

export const load: PageServerLoad = async ({ locals, params }) => {
  requireAnyPagePermission(locals.actor, ["products:read", "warranties:read"]);
  const product =
    process.env.DOMINO_DEMO_MODE === "true"
      ? (() => {
          const item = demoProducts.find((product) => product.id === params.id);
          return item
            ? {
                ...item,
                createdBy: { id: "demo-hermes", name: "Hermes" },
                sources: [
                  {
                    id: "demo-source",
                    kind: "external",
                    label: "Household intake",
                    url: null,
                    externalSystem: "hermes",
                    externalId: `demo-${item.id}`,
                  },
                ],
              }
            : undefined;
        })()
      : await getProductDetail(
          requireDb(),
          locals.actor!.householdId,
          params.id,
          relatedReadAccess(locals.actor),
        );
  if (!product) throw error(404, "Product not found");
  return { product };
};
