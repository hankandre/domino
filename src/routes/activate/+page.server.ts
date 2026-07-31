import type { PageServerLoad } from "./$types";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requirePagePermission } from "$lib/server/auth/authorization";
import {
  agentPermissionPresets,
  serviceAccountPermissions,
} from "$lib/server/auth/permissions";
import { requireDb } from "$lib/server/db";
import { claims, products } from "$lib/server/db/schema";

export const load: PageServerLoad = async ({ locals }) => {
  requirePagePermission(locals.actor, "service_accounts:manage");
  const actor = locals.actor!;
  const grantablePermissions = serviceAccountPermissions.filter(
    (permission) =>
      actor.permissions.includes("*") || actor.permissions.includes(permission),
  );
  const permissionPresets = agentPermissionPresets.filter((preset) =>
    preset.permissions.every((permission) =>
      grantablePermissions.includes(permission),
    ),
  );

  if (process.env.DOMINO_DEMO_MODE === "true") {
    return {
      claims: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          reference: "CLM-2026-A1B2C3D4",
          issue: "Dishwasher leaking",
          status: "needs_evidence",
          productName: "800 Series Dishwasher",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          reference: "CLM-2026-E5F6G7H8",
          issue: "Display intermittently blanks",
          status: "in_review",
          productName: "OLED Television",
        },
        {
          id: "00000000-0000-4000-8000-000000000003",
          reference: "CLM-2025-Z9Y8X7W6",
          issue: "Replacement received",
          status: "resolved",
          productName: "Cordless Drill",
        },
      ],
      permissionPresets,
      grantablePermissions,
      canGrantAllClaims: true,
    };
  }

  const householdClaims = await requireDb()
    .select({
      id: claims.id,
      reference: claims.reference,
      issue: claims.issue,
      status: claims.status,
      productName: products.name,
    })
    .from(claims)
    .innerJoin(products, eq(claims.productId, products.id))
    .where(
      and(
        eq(claims.householdId, actor.householdId),
        actor.claimIds === undefined
          ? undefined
          : actor.claimIds.length
            ? inArray(claims.id, actor.claimIds)
            : sql`false`,
      ),
    );

  return {
    claims: householdClaims,
    permissionPresets,
    grantablePermissions,
    canGrantAllClaims: actor.claimIds === undefined,
  };
};
