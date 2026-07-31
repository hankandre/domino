import type { PageServerLoad } from "./$types";
import { eq } from "drizzle-orm";
import { requireAnyPagePermission } from "$lib/server/auth/authorization";
import { requireDb } from "$lib/server/db";
import { households } from "$lib/server/db/schema";

export const load: PageServerLoad = async ({ locals }) => {
  requireAnyPagePermission(locals.actor, [
    "products:create",
    "warranties:write",
  ]);
  if (process.env.DOMINO_DEMO_MODE === "true")
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
