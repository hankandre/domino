import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { requireDb } from "../../db";
import {
  actorClaimAccess,
  actorRoles,
  actors,
  auditEvents,
  claims,
  roles,
  userInvitations,
  users,
} from "../../db/schema";
import {
  canAdministerActorAuthority,
  canAdministerPermissions,
  claimAuthority,
  loadActorAuthority,
  type ClaimAuthority,
} from "../authorization";
import { createWebSession } from "../oidc";
import { hashPassword } from "./passwords";
import { createOneTimeToken, invitationTokenPattern } from "./tokens";

export async function createInvitation(
  householdId: string,
  invitedByActorId: string,
  input: {
    email: string;
    displayName?: string;
    roleId: string;
    claimAccess?: ClaimAuthority;
    expiresInHours?: number;
  },
) {
  const database = requireDb();
  const normalizedEmail = input.email.trim().toLowerCase();
  const { token, tokenHash } = createOneTimeToken("domino_invite");
  const expiresInHours = Math.max(
    1,
    Math.min(input.expiresInHours ?? 72, 24 * 30),
  );
  const invitation = await database.transaction(async (tx) => {
    const inviter = await loadActorAuthority(
      tx,
      invitedByActorId,
      householdId,
      { lock: true },
    );
    if (
      !inviter ||
      (!inviter.permissions.includes("*") &&
        !inviter.permissions.includes("household:manage"))
    ) {
      return null;
    }
    const [role] = await tx
      .select({
        id: roles.id,
        permissions: roles.permissions,
        system: roles.system,
      })
      .from(roles)
      .where(
        and(eq(roles.id, input.roleId), eq(roles.householdId, householdId)),
      )
      .for("update")
      .limit(1);
    if (
      !role ||
      !role.system ||
      !canAdministerPermissions(inviter.permissions, role.permissions)
    ) {
      return null;
    }
    const requestedClaimAccess =
      input.claimAccess ??
      claimAuthority(inviter.claimAccessScope, inviter.claimIds);
    if (
      !canAdministerActorAuthority(inviter, {
        permissions: role.permissions,
        ...requestedClaimAccess,
      })
    ) {
      return null;
    }
    if (
      requestedClaimAccess.claimAccessScope === "selected" &&
      requestedClaimAccess.claimIds.length
    ) {
      const validClaims = await tx
        .select({ id: claims.id })
        .from(claims)
        .where(
          and(
            eq(claims.householdId, householdId),
            inArray(claims.id, requestedClaimAccess.claimIds),
          ),
        )
        .for("share");
      if (validClaims.length !== requestedClaimAccess.claimIds.length) {
        return null;
      }
    }
    const [created] = await tx
      .insert(userInvitations)
      .values({
        householdId,
        email: normalizedEmail,
        displayName: input.displayName?.trim() || null,
        roleId: role.id,
        tokenHash,
        invitedByActorId,
        claimAccessScope: requestedClaimAccess.claimAccessScope,
        claimIds: requestedClaimAccess.claimIds ?? [],
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60_000),
      })
      .returning();
    await tx.insert(auditEvents).values({
      householdId,
      actorId: invitedByActorId,
      action: "person.invite",
      resourceType: "invitation",
      resourceId: created.id,
      summary: `Invited ${normalizedEmail}`,
      metadata: {
        roleId: role.id,
        claimAccessScope: requestedClaimAccess.claimAccessScope,
        claimIds: requestedClaimAccess.claimIds ?? [],
      },
    });
    return created;
  });
  if (!invitation) return null;
  return { invitation, token };
}

export async function inspectInvitation(token: string) {
  if (!invitationTokenPattern.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invitation] = await requireDb()
    .select({
      id: userInvitations.id,
      email: userInvitations.email,
      displayName: userInvitations.displayName,
      expiresAt: userInvitations.expiresAt,
      householdName: sql<string>`(select name from households where id = ${userInvitations.householdId})`,
    })
    .from(userInvitations)
    .where(
      and(
        eq(userInvitations.tokenHash, tokenHash),
        isNull(userInvitations.acceptedAt),
        isNull(userInvitations.revokedAt),
        gt(userInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invitation ?? null;
}

export async function acceptInvitation(
  token: string,
  displayName: string,
  password: string,
  userAgent: string | null,
) {
  const database = requireDb();
  if (!invitationTokenPattern.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  if (!(await inspectInvitation(token))) return null;
  const passwordHash = await hashPassword(password);
  const actorId = await database.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.tokenHash, tokenHash),
          isNull(userInvitations.acceptedAt),
          isNull(userInvitations.revokedAt),
          gt(userInvitations.expiresAt, new Date()),
        ),
      )
      .for("update")
      .limit(1);
    if (!invitation) return null;

    const rejectInvitation = async () => {
      await tx
        .update(userInvitations)
        .set({ revokedAt: new Date() })
        .where(eq(userInvitations.id, invitation.id));
      return null;
    };
    if (!invitation.invitedByActorId) return rejectInvitation();
    const inviter = await loadActorAuthority(
      tx,
      invitation.invitedByActorId,
      invitation.householdId,
      { lock: true },
    );
    if (
      !inviter ||
      (!inviter.permissions.includes("*") &&
        !inviter.permissions.includes("household:manage"))
    ) {
      return rejectInvitation();
    }
    const [role] = await tx
      .select({
        id: roles.id,
        permissions: roles.permissions,
        system: roles.system,
      })
      .from(roles)
      .where(
        and(
          eq(roles.id, invitation.roleId),
          eq(roles.householdId, invitation.householdId),
        ),
      )
      .for("update")
      .limit(1);
    const invitedAuthority = {
      permissions: role?.permissions ?? [],
      ...claimAuthority(invitation.claimAccessScope, invitation.claimIds),
    };
    if (
      !role?.system ||
      !canAdministerActorAuthority(inviter, invitedAuthority)
    ) {
      return rejectInvitation();
    }

    const selectedClaims =
      invitation.claimAccessScope === "selected" && invitation.claimIds.length
        ? await tx
            .select({ id: claims.id })
            .from(claims)
            .where(
              and(
                eq(claims.householdId, invitation.householdId),
                inArray(claims.id, invitation.claimIds),
              ),
            )
            .for("share")
        : [];
    if (
      invitation.claimAccessScope === "selected" &&
      selectedClaims.length !== invitation.claimIds.length
    ) {
      return rejectInvitation();
    }

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${invitation.email}`)
      .limit(1);
    if (existing) throw new Error("An account with this email already exists.");

    const [user] = await tx
      .insert(users)
      .values({
        email: invitation.email,
        displayName: displayName.trim(),
        passwordHash,
      })
      .returning({ id: users.id });
    const [actor] = await tx
      .insert(actors)
      .values({
        householdId: invitation.householdId,
        userId: user.id,
        kind: "user",
        name: displayName.trim(),
        claimAccessScope: invitation.claimAccessScope,
      })
      .returning({ id: actors.id });
    await tx.insert(actorRoles).values({
      actorId: actor.id,
      roleId: role.id,
      grantedByActorId: invitation.invitedByActorId,
    });
    if (
      invitation.claimAccessScope === "selected" &&
      invitation.claimIds.length
    ) {
      await tx.insert(actorClaimAccess).values(
        selectedClaims.map((claim) => ({
          actorId: actor.id,
          claimId: claim.id,
          grantedByActorId: invitation.invitedByActorId,
        })),
      );
    }
    await tx
      .update(userInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(userInvitations.id, invitation.id));
    await tx.insert(auditEvents).values({
      householdId: invitation.householdId,
      actorId: actor.id,
      action: "person.invite.accept",
      resourceType: "actor",
      resourceId: actor.id,
      summary: `Accepted invitation for ${invitation.email}`,
      metadata: {
        claimAccessScope: invitation.claimAccessScope,
        claimIds: invitation.claimIds,
      },
    });
    return actor.id;
  });
  return actorId ? createWebSession(actorId, userAgent) : null;
}
