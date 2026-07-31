import { and, eq, sql } from "drizzle-orm";
import { requireDb } from "../../db";
import {
  actorClaimAccess,
  actorRoles,
  actors,
  auditEvents,
  claims as warrantyClaims,
  households,
  oidcIdentities,
  roles,
  users,
} from "../../db/schema";
import { roleTemplates } from "../permissions";
import { initialDocumentBackend, type OidcConfig } from "./config";
import type { IdentityClaims } from "./types";

export async function linkIdentityToActor(
  config: OidcConfig,
  claims: IdentityClaims,
) {
  const database = requireDb();
  const email = claims.email.trim().toLowerCase();
  const displayName = (
    claims.name ||
    claims.preferred_username ||
    email.split("@")[0]
  ).trim();

  return database.transaction(async (tx) => {
    const [linked] = await tx
      .select({ userId: oidcIdentities.userId })
      .from(oidcIdentities)
      .where(
        and(
          eq(oidcIdentities.issuer, config.issuer),
          eq(oidcIdentities.subject, claims.sub!),
        ),
      )
      .limit(1);

    let userId = linked?.userId;
    if (!userId) {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      if (existingUser) {
        if (!config.linkExistingByEmail) {
          throw new Error(
            "An existing Domino account uses this email. An administrator must explicitly link its OIDC identity.",
          );
        }
        if (claims.email_verified !== true) {
          throw new Error(
            "A verified email address is required to link an existing Domino account.",
          );
        }
        userId = existingUser.id;
      } else {
        if (!config.autoProvision)
          throw new Error("Your account has not been provisioned in Domino.");
        const [createdUser] = await tx
          .insert(users)
          .values({ email, displayName })
          .returning({ id: users.id });
        userId = createdUser.id;
      }

      await tx.insert(oidcIdentities).values({
        userId,
        issuer: config.issuer,
        subject: claims.sub!,
        emailAtLogin: email,
        claims: {
          name: claims.name,
          preferred_username: claims.preferred_username,
          groups: claims.groups,
        },
      });
    } else {
      await tx
        .update(oidcIdentities)
        .set({
          emailAtLogin: email,
          claims: {
            name: claims.name,
            preferred_username: claims.preferred_username,
            groups: claims.groups,
          },
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(oidcIdentities.issuer, config.issuer),
            eq(oidcIdentities.subject, claims.sub!),
          ),
        );
    }

    const configuredHouseholdId = process.env.DOMINO_OIDC_HOUSEHOLD_ID;
    const actorConditions = [eq(actors.userId, userId)];
    if (configuredHouseholdId)
      actorConditions.push(eq(actors.householdId, configuredHouseholdId));
    const [existingActor] = await tx
      .select({ id: actors.id, disabled: actors.disabled })
      .from(actors)
      .where(and(...actorConditions))
      .limit(1);
    const existingActorId = resolveExistingActor(existingActor);
    if (existingActorId) return existingActorId;
    if (!config.autoProvision)
      throw new Error("Your account does not have household access.");

    const household = await resolveProvisioningHousehold(tx, email);
    if (household.bootstrapped && claims.email_verified !== true) {
      throw new Error(
        "A verified email address is required to bootstrap the first Domino owner.",
      );
    }
    const [createdActor] = await tx
      .insert(actors)
      .values({
        householdId: household.id,
        userId,
        kind: "user",
        name: displayName,
        claimAccessScope:
          household.bootstrapped || config.defaultClaimPreset === "all"
            ? "all"
            : "selected",
      })
      .returning({ id: actors.id });
    const assignedRoleName = household.bootstrapped
      ? "Owner"
      : config.defaultRole;
    const [defaultRole] = await tx
      .select({ id: roles.id, system: roles.system })
      .from(roles)
      .where(
        and(
          eq(roles.householdId, household.id),
          sql`lower(${roles.name}) = ${assignedRoleName.toLowerCase()}`,
        ),
      )
      .for("share")
      .limit(1);
    if (!defaultRole?.system) {
      throw new Error(
        `The configured role "${assignedRoleName}" does not exist in this household.`,
      );
    }
    await tx
      .insert(actorRoles)
      .values({ actorId: createdActor.id, roleId: defaultRole.id });
    const provisionedClaimIds =
      household.bootstrapped || config.defaultClaimPreset === "all"
        ? []
        : config.defaultClaimPreset === "none"
          ? []
          : (
              await tx
                .select({ id: warrantyClaims.id })
                .from(warrantyClaims)
                .where(
                  and(
                    eq(warrantyClaims.householdId, household.id),
                    config.defaultClaimPreset === "attention"
                      ? sql`${warrantyClaims.status} in ('draft', 'needs_evidence', 'denied')`
                      : sql`${warrantyClaims.status} not in ('resolved', 'closed')`,
                  ),
                )
                .for("share")
            ).map((claim) => claim.id);
    if (provisionedClaimIds.length) {
      await tx.insert(actorClaimAccess).values(
        provisionedClaimIds.map((claimId) => ({
          actorId: createdActor.id,
          claimId,
          grantedByActorId: null,
        })),
      );
    }
    await tx.insert(auditEvents).values({
      householdId: household.id,
      actorId: createdActor.id,
      action: "person.oidc.provision",
      resourceType: "actor",
      resourceId: createdActor.id,
      summary: `Provisioned ${displayName} through OIDC`,
      metadata: {
        roleId: defaultRole.id,
        claimPreset: household.bootstrapped ? "all" : config.defaultClaimPreset,
        claimIds: provisionedClaimIds,
      },
    });
    return createdActor.id;
  });
}

export function resolveExistingActor(
  actor: { id: string; disabled: boolean } | undefined,
) {
  if (actor?.disabled)
    throw new Error("Your Domino household account is disabled.");
  return actor?.id ?? null;
}

type Transaction = Parameters<
  Parameters<ReturnType<typeof requireDb>["transaction"]>[0]
>[0];

async function resolveProvisioningHousehold(tx: Transaction, email: string) {
  if (process.env.DOMINO_OIDC_HOUSEHOLD_ID) {
    const [configured] = await tx
      .select({ id: households.id })
      .from(households)
      .where(eq(households.id, process.env.DOMINO_OIDC_HOUSEHOLD_ID))
      .limit(1);
    if (!configured)
      throw new Error("DOMINO_OIDC_HOUSEHOLD_ID does not match a household.");
    return { id: configured.id, bootstrapped: false };
  }

  const existing = await tx
    .select({ id: households.id })
    .from(households)
    .limit(2);
  if (existing.length === 1) return { id: existing[0].id, bootstrapped: false };
  if (existing.length > 1) {
    throw new Error(
      "DOMINO_OIDC_HOUSEHOLD_ID is required when more than one household exists.",
    );
  }

  const bootstrapEmail =
    process.env.DOMINO_OIDC_BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  if (!bootstrapEmail || bootstrapEmail !== email) {
    throw new Error(
      "No household exists. Set DOMINO_OIDC_BOOTSTRAP_OWNER_EMAIL to create the first owner.",
    );
  }

  const [household] = await tx
    .insert(households)
    .values({
      name: process.env.DOMINO_HOUSEHOLD_NAME?.trim() || "Home",
      slug: process.env.DOMINO_HOUSEHOLD_SLUG?.trim() || "home",
      defaultDocumentBackend: initialDocumentBackend(),
    })
    .returning({ id: households.id });
  await tx.insert(roles).values([
    {
      householdId: household.id,
      name: roleTemplates.owner.name,
      description: roleTemplates.owner.description,
      permissions: [...roleTemplates.owner.permissions],
      system: true,
    },
    {
      householdId: household.id,
      name: roleTemplates.member.name,
      description: roleTemplates.member.description,
      permissions: [...roleTemplates.member.permissions],
      system: true,
    },
    {
      householdId: household.id,
      name: roleTemplates["agent-reader"].name,
      description: roleTemplates["agent-reader"].description,
      permissions: [...roleTemplates["agent-reader"].permissions],
      system: true,
    },
    {
      householdId: household.id,
      name: roleTemplates["claim-assistant"].name,
      description: roleTemplates["claim-assistant"].description,
      permissions: [...roleTemplates["claim-assistant"].permissions],
      system: true,
    },
    {
      householdId: household.id,
      name: roleTemplates["inventory-contributor"].name,
      description: roleTemplates["inventory-contributor"].description,
      permissions: [...roleTemplates["inventory-contributor"].permissions],
      system: true,
    },
    {
      householdId: household.id,
      name: roleTemplates["household-agent"].name,
      description: roleTemplates["household-agent"].description,
      permissions: [...roleTemplates["household-agent"].permissions],
      system: true,
    },
  ]);
  process.env.DOMINO_OIDC_HOUSEHOLD_ID = household.id;
  return { id: household.id, bootstrapped: true };
}
