import type { PageServerLoad } from "./$types";
import { eq } from "drizzle-orm";
import { requireDb } from "$lib/server/db";
import { households } from "$lib/server/db/schema";

export const load: PageServerLoad = async ({ locals }) => {
  if (process.env.DOMINO_DEMO_MODE !== "false")
    return { defaultDocumentBackend: "paperless" };
  const [household] = await requireDb()
    .select({ defaultDocumentBackend: households.defaultDocumentBackend })
    .from(households)
    .where(eq(households.id, locals.actor!.householdId))
    .limit(1);
  return {
    defaultDocumentBackend: household?.defaultDocumentBackend ?? "local",
  };
};
