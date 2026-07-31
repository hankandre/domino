import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { DEMO_PRODUCT_IDS, demoProducts } from "$lib/demo";
import {
  relatedReadAccess,
  requirePagePermission,
} from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { getClaim } from "$lib/server/domain/claims";

export const load: PageServerLoad = async ({ locals, params }) => {
  requirePagePermission(locals.actor, "claims:read");
  const access = relatedReadAccess(locals.actor);
  if (process.env.DOMINO_DEMO_MODE === "true") {
    const product = demoProducts.find(
      (candidate) => candidate.activeClaim?.id === params.id,
    );
    if (!product?.activeClaim) throw error(404, "Claim not found");
    return {
      claim: {
        id: params.id,
        productId: product.id,
        reference: product.activeClaim.reference,
        issue: product.activeClaim.summary,
        status: product.activeClaim.status,
        nextAction: product.activeClaim.nextAction,
        noticedAt: "2026-05-17",
        preferredResolution: "repair",
        resolution: null,
        createdAt: new Date("2026-05-17T14:42:00Z"),
        product: {
          name: product.name,
          brand: product.brand,
          model: product.model,
        },
        events: [],
        notes: [],
        documents: [],
        warranty: {
          provider:
            product.id === DEMO_PRODUCT_IDS.boschDishwasher
              ? "Bosch"
              : product.brand,
          claimPhone: "1-800-944-2904",
          claimEmail: null,
          claimUrl: "https://www.bosch-home.com/us/owner-support/contact-us",
          eligibilityNotes:
            "Coverage requires proof of purchase and the appliance serial number.",
          claimDeadline: "2027-05-14",
          submissionMethods: ["web", "phone"] as const,
          requiredEvidence: [
            { label: "Proof of purchase", required: true },
            { label: "Serial number photo", required: true },
          ],
          claimInstructions: [],
        },
      },
    };
  }
  const claim = await getClaim(
    requireDb(),
    locals.actor!.householdId,
    params.id,
    { documents: access.documents, notes: access.notes },
    locals.actor!.claimIds,
  );
  if (!claim) throw error(404, "Claim not found");
  return { claim };
};
