import { describe } from "bun:test";
import { eq } from "drizzle-orm";
import { requireDb } from "$lib/server/db";
import { households } from "$lib/server/db/schema";

export const databaseAvailable = Boolean(process.env.DATABASE_URL);
export const databaseIntegration = databaseAvailable ? describe : describe.skip;

export function createDatabaseFixture() {
  const householdIds: string[] = [];
  return {
    get db() {
      return requireDb();
    },
    async household(prefix: string) {
      const suffix = crypto.randomUUID().slice(0, 8);
      const [household] = await requireDb()
        .insert(households)
        .values({
          name: `${prefix} ${suffix}`,
          slug: `${prefix.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${suffix}`,
        })
        .returning({ id: households.id });
      householdIds.push(household.id);
      return { household, suffix };
    },
    trackHousehold(id: string) {
      householdIds.push(id);
    },
    async cleanup() {
      if (!databaseAvailable) return;
      for (const householdId of householdIds.splice(0)) {
        await requireDb()
          .delete(households)
          .where(eq(households.id, householdId));
      }
    },
  };
}
