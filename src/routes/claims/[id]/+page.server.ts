import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { requireDb } from "$lib/server/db";
import { getClaim } from "$lib/server/domain/claims";

export const load: PageServerLoad = async ({ locals, params }) => {
  if (process.env.DOMINO_DEMO_MODE !== "false") {
    return {
      claim: {
        id: params.id,
        productId: "bosch-dishwasher",
        reference: params.id,
        issue: "Dishwasher leak",
        status: "needs_evidence",
        nextAction: "Add a clear photo of the lower seal.",
        noticedAt: "2026-05-17",
        preferredResolution: "repair",
        resolution: null,
        createdAt: new Date("2026-05-17T14:42:00Z"),
        product: {
          name: "800 Series Dishwasher",
          brand: "Bosch",
          model: "SHPM88Z75N",
        },
        events: [],
        notes: [],
        documents: [],
        warranty: {
          provider: "Bosch",
          claimPhone: "1-800-944-2904",
          claimEmail: null,
          claimUrl: "https://www.bosch-home.com/us/owner-support/contact-us",
          eligibilityNotes:
            "Coverage requires proof of purchase and the appliance serial number.",
          claimDeadline: "2027-05-14",
          claimInstructions: [],
        },
      },
    };
  }
  const claim = await getClaim(
    requireDb(),
    locals.actor!.householdId,
    params.id,
  );
  if (!claim) throw error(404, "Claim not found");
  return { claim };
};
