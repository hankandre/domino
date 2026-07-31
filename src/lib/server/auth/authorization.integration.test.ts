import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { app } from "../api";
import { pool, requireDb } from "../db";
import {
  actorClaimAccess,
  actorRoles,
  actors,
  apiCredentials,
  auditEvents,
  claims,
  households,
  notes,
  products,
  roles,
  userInvitations,
  users,
} from "../db/schema";
import { acceptInvitation, createPasswordReset, resetPassword } from "./local";
import { createClaim } from "../domain/claims";
import { getProductDetail, listProductSummaries } from "../domain/products";
import {
  createWebSession,
  getOidcConfig,
  linkIdentityToActor,
  sessionCookieName,
} from "./oidc";
import { actions } from "../../../routes/settings/access/+page.server";
import { and, eq } from "drizzle-orm";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
const integration = databaseAvailable ? describe : describe.skip;
const originalDemoMode = process.env.DOMINO_DEMO_MODE;
const originalOrigin = process.env.ORIGIN;
const originalHouseholdId = process.env.DOMINO_OIDC_HOUSEHOLD_ID;

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let fixture: Fixture | undefined;

function formRequest(values: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      form.append(name, item);
    }
  }
  return new Request("http://domino.test/settings/access", {
    method: "POST",
    body: form,
  });
}

function locals(actor: NonNullable<App.Locals["actor"]>) {
  return { actor } as App.Locals;
}

function actionStatus(result: unknown) {
  return (result as { status?: number })?.status;
}

async function createFixture() {
  const db = requireDb();
  const suffix = crypto.randomUUID().slice(0, 8);
  const [household] = await db
    .insert(households)
    .values({ name: `Authority ${suffix}`, slug: `authority-${suffix}` })
    .returning({ id: households.id });
  const [otherHousehold] = await db
    .insert(households)
    .values({ name: `Other ${suffix}`, slug: `other-${suffix}` })
    .returning({ id: households.id });
  const [managerUser, ownerUser, broadUser] = await db
    .insert(users)
    .values([
      {
        email: `manager-${suffix}@example.test`,
        displayName: "Restricted manager",
      },
      {
        email: `owner-${suffix}@example.test`,
        displayName: "Owner",
      },
      {
        email: `broad-${suffix}@example.test`,
        displayName: "Broad person",
      },
    ])
    .returning({ id: users.id });
  const [managerRole, ownerRole, memberRole, targetRole, broadRole] = await db
    .insert(roles)
    .values([
      {
        householdId: household.id,
        name: `Manager ${suffix}`,
        permissions: [
          "household:manage",
          "service_accounts:manage",
          "claims:read",
          "claims:create",
        ],
      },
      {
        householdId: household.id,
        name: `Owner ${suffix}`,
        permissions: ["*"],
        system: true,
      },
      {
        householdId: household.id,
        name: `Member ${suffix}`,
        permissions: ["claims:read"],
        system: true,
      },
      {
        householdId: household.id,
        name: `Target ${suffix}`,
        permissions: ["claims:read"],
      },
      {
        householdId: household.id,
        name: `Broad ${suffix}`,
        permissions: ["claims:read", "claims:manage"],
      },
    ])
    .returning({ id: roles.id, permissions: roles.permissions });
  const [manager, owner, target, broadTarget, broadPerson] = await db
    .insert(actors)
    .values([
      {
        householdId: household.id,
        userId: managerUser.id,
        kind: "user",
        name: "Restricted manager",
        claimAccessScope: "selected",
      },
      {
        householdId: household.id,
        userId: ownerUser.id,
        kind: "user",
        name: "Owner",
        claimAccessScope: "all",
      },
      {
        householdId: household.id,
        kind: "service",
        name: "Scoped target",
        claimAccessScope: "selected",
      },
      {
        householdId: household.id,
        kind: "service",
        name: "Broad target",
        claimAccessScope: "all",
      },
      {
        householdId: household.id,
        userId: broadUser.id,
        kind: "user",
        name: "Broad person",
        claimAccessScope: "all",
      },
    ])
    .returning({ id: actors.id });
  await db.insert(actorRoles).values([
    { actorId: manager.id, roleId: managerRole.id },
    { actorId: owner.id, roleId: ownerRole.id },
    { actorId: target.id, roleId: targetRole.id },
    { actorId: broadTarget.id, roleId: broadRole.id },
    { actorId: broadPerson.id, roleId: broadRole.id },
  ]);
  const [product, otherProduct] = await Promise.all([
    db
      .insert(products)
      .values({ householdId: household.id, name: "Test appliance" })
      .returning({ id: products.id }),
    db
      .insert(products)
      .values({ householdId: otherHousehold.id, name: "Foreign appliance" })
      .returning({ id: products.id }),
  ]);
  const [claimA, claimB] = await db
    .insert(claims)
    .values([
      {
        householdId: household.id,
        productId: product[0].id,
        reference: `CLM-A-${suffix}`,
        issue: "Claim A",
        status: "needs_evidence",
      },
      {
        householdId: household.id,
        productId: product[0].id,
        reference: `CLM-B-${suffix}`,
        issue: "Claim B",
        status: "in_review",
      },
    ])
    .returning({ id: claims.id });
  const [foreignClaim] = await db
    .insert(claims)
    .values({
      householdId: otherHousehold.id,
      productId: otherProduct[0].id,
      reference: `CLM-X-${suffix}`,
      issue: "Foreign claim",
    })
    .returning({ id: claims.id });
  await db.insert(actorClaimAccess).values([
    { actorId: manager.id, claimId: claimA.id, grantedByActorId: owner.id },
    { actorId: target.id, claimId: claimA.id, grantedByActorId: manager.id },
  ]);

  return {
    householdId: household.id,
    otherHouseholdId: otherHousehold.id,
    manager,
    owner,
    target,
    broadTarget,
    broadPerson,
    managerRole,
    ownerRole,
    memberRole,
    targetRole,
    product: product[0],
    claimA,
    claimB,
    foreignClaim,
    managerAuthority: {
      id: manager.id,
      householdId: household.id,
      kind: "user" as const,
      permissions: managerRole.permissions,
      claimAccessScope: "selected" as const,
      claimIds: [claimA.id],
      user: {
        id: managerUser.id,
        email: `manager-${suffix}@example.test`,
        displayName: "Restricted manager",
      },
    },
    ownerAuthority: {
      id: owner.id,
      householdId: household.id,
      kind: "user" as const,
      permissions: ["*"],
      claimAccessScope: "all" as const,
      claimIds: undefined,
      user: {
        id: ownerUser.id,
        email: `owner-${suffix}@example.test`,
        displayName: "Owner",
      },
    },
  };
}

beforeEach(async () => {
  if (!databaseAvailable) return;
  process.env.DOMINO_DEMO_MODE = "false";
  process.env.ORIGIN = "http://domino.test";
  fixture = await createFixture();
});

afterEach(async () => {
  process.env.DOMINO_DEMO_MODE = originalDemoMode;
  process.env.ORIGIN = originalOrigin;
  if (originalHouseholdId === undefined)
    delete process.env.DOMINO_OIDC_HOUSEHOLD_ID;
  else process.env.DOMINO_OIDC_HOUSEHOLD_ID = originalHouseholdId;
  if (fixture) {
    await requireDb()
      .delete(households)
      .where(eq(households.id, fixture.householdId));
    await requireDb()
      .delete(households)
      .where(eq(households.id, fixture.otherHouseholdId));
    fixture = undefined;
  }
});

integration("database-backed authority boundaries", () => {
  test("rejects claim escalation and cross-household IDs during service-account editing", async () => {
    const current = fixture!;
    const expanded = await actions.claims?.({
      locals: locals(current.managerAuthority),
      request: formRequest({
        actorId: current.target.id,
        claimAccessScope: "selected",
        claimId: [current.claimA.id, current.claimB.id],
      }),
    } as never);
    expect(actionStatus(expanded)).toBe(403);

    const foreign = await actions.claims?.({
      locals: locals(current.ownerAuthority),
      request: formRequest({
        actorId: current.target.id,
        claimAccessScope: "selected",
        claimId: [current.foreignClaim.id],
      }),
    } as never);
    expect(actionStatus(foreign)).toBe(400);
  });

  test("edits service permissions only within the manager's combined authority", async () => {
    const current = fixture!;
    const allowed = await actions.permissions?.({
      locals: locals(current.managerAuthority),
      request: formRequest({
        actorId: current.target.id,
        permission: ["claims:read", "claims:create"],
      }),
    } as never);
    expect(allowed).toMatchObject({ permissionsSaved: true });

    const denied = await actions.permissions?.({
      locals: locals(current.managerAuthority),
      request: formRequest({
        actorId: current.target.id,
        permission: ["claims:read", "claims:manage"],
      }),
    } as never);
    expect(actionStatus(denied)).toBe(403);
  });

  test("refuses to mutate a role shared with a human account", async () => {
    const current = fixture!;
    await requireDb().insert(actorRoles).values({
      actorId: current.broadPerson.id,
      roleId: current.targetRole.id,
      grantedByActorId: current.owner.id,
    });

    const result = await actions.permissions?.({
      locals: locals(current.managerAuthority),
      request: formRequest({
        actorId: current.target.id,
        permission: ["claims:read", "claims:create"],
      }),
    } as never);
    expect(actionStatus(result)).toBe(404);
  });

  test("cannot disable or reset an identity with broader authority", async () => {
    const current = fixture!;
    const disabled = await actions.toggle?.({
      locals: locals(current.managerAuthority),
      request: formRequest({
        actorId: current.broadTarget.id,
        disabled: "true",
      }),
    } as never);
    expect(actionStatus(disabled)).toBe(403);

    const reset = await actions.reset?.({
      locals: locals(current.managerAuthority),
      request: formRequest({ actorId: current.broadPerson.id }),
      url: new URL("http://domino.test/settings/access"),
    } as never);
    expect(actionStatus(reset)).toBe(403);
  });

  test("persists and atomically accepts a human invitation's exact claim set", async () => {
    const current = fixture!;
    const invited = await actions.invite?.({
      locals: locals(current.managerAuthority),
      request: formRequest({
        email: `invite-${crypto.randomUUID()}@example.test`,
        displayName: "Invited person",
        roleId: current.memberRole.id,
        claimAccessScope: "selected",
        claimId: current.claimA.id,
      }),
      url: new URL("http://domino.test/settings/access"),
    } as never);
    expect(invited).toHaveProperty("invitationUrl");
    const invitationUrl = new URL(
      (invited as { invitationUrl: string }).invitationUrl,
    );
    const token = invitationUrl.pathname.split("/").at(-1)!;
    const session = await acceptInvitation(
      token,
      "Invited person",
      "a secure household password",
      "bun-test",
    );
    expect(session).toMatch(/^domino_session_/);

    const [accepted] = await requireDb()
      .select({
        actorId: actors.id,
        scope: actors.claimAccessScope,
        claimId: actorClaimAccess.claimId,
      })
      .from(actors)
      .innerJoin(users, eq(actors.userId, users.id))
      .leftJoin(actorClaimAccess, eq(actorClaimAccess.actorId, actors.id))
      .where(eq(users.displayName, "Invited person"));
    expect(accepted).toMatchObject({
      scope: "selected",
      claimId: current.claimA.id,
    });
  }, 15_000);

  test("prohibits an invitation from exceeding the inviter's claim set", async () => {
    const current = fixture!;
    const email = `escalation-${crypto.randomUUID()}@example.test`;
    const result = await actions.invite?.({
      locals: locals(current.managerAuthority),
      request: formRequest({
        email,
        displayName: "Escalated person",
        roleId: current.memberRole.id,
        claimAccessScope: "selected",
        claimId: current.claimB.id,
      }),
      url: new URL("http://domino.test/settings/access"),
    } as never);
    expect(actionStatus(result)).toBe(400);
    const [created] = await requireDb()
      .select({ id: userInvitations.id })
      .from(userInvitations)
      .where(eq(userInvitations.email, email));
    expect(created).toBeUndefined();
  });

  test("refuses service-only roles for human invitations", async () => {
    const current = fixture!;
    const email = `service-role-${crypto.randomUUID()}@example.test`;
    const result = await actions.invite?.({
      locals: locals(current.ownerAuthority),
      request: formRequest({
        email,
        displayName: "Human with service role",
        roleId: current.targetRole.id,
        claimAccessScope: "all",
      }),
      url: new URL("http://domino.test/settings/access"),
    } as never);
    expect(actionStatus(result)).toBe(400);
    const [created] = await requireDb()
      .select({ id: userInvitations.id })
      .from(userInvitations)
      .where(eq(userInvitations.email, email));
    expect(created).toBeUndefined();
  });

  test("revokes an invitation whose role becomes service-only before acceptance", async () => {
    const current = fixture!;
    const email = `stale-role-${crypto.randomUUID()}@example.test`;
    const invited = await actions.invite?.({
      locals: locals(current.ownerAuthority),
      request: formRequest({
        email,
        displayName: "Stale role invitation",
        roleId: current.memberRole.id,
        claimAccessScope: "all",
      }),
      url: new URL("http://domino.test/settings/access"),
    } as never);
    expect(invited).toHaveProperty("invitationUrl");
    const token = new URL(
      (invited as { invitationUrl: string }).invitationUrl,
    ).pathname
      .split("/")
      .at(-1)!;
    const [invitation] = await requireDb()
      .select({ id: userInvitations.id })
      .from(userInvitations)
      .where(eq(userInvitations.email, email));
    expect(invitation).toBeDefined();
    await requireDb()
      .update(userInvitations)
      .set({ roleId: current.targetRole.id })
      .where(eq(userInvitations.id, invitation!.id));

    expect(
      await acceptInvitation(
        token,
        "Stale role invitation",
        "a secure household password",
        "bun",
      ),
    ).toBeNull();
    const [revoked] = await requireDb()
      .select({ revokedAt: userInvitations.revokedAt })
      .from(userInvitations)
      .where(eq(userInvitations.id, invitation!.id));
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  test("revokes invitations when their issuer is disabled or loses authority", async () => {
    const current = fixture!;
    const createInvite = async (label: string) => {
      const invited = await actions.invite?.({
        locals: locals(current.managerAuthority),
        request: formRequest({
          email: `${label}-${crypto.randomUUID()}@example.test`,
          displayName: label,
          roleId: current.memberRole.id,
          claimAccessScope: "selected",
          claimId: current.claimA.id,
        }),
        url: new URL("http://domino.test/settings/access"),
      } as never);
      expect(invited).toHaveProperty("invitationUrl");
      return new URL(
        (invited as { invitationUrl: string }).invitationUrl,
      ).pathname
        .split("/")
        .at(-1)!;
    };

    const disabledToken = await createInvite("Disabled issuer");
    const disabled = await actions.toggle?.({
      locals: locals(current.ownerAuthority),
      request: formRequest({ actorId: current.manager.id, disabled: "true" }),
    } as never);
    expect(disabled).toMatchObject({ accountUpdated: true });
    expect(
      await acceptInvitation(
        disabledToken,
        "Disabled issuer",
        "a secure household password",
        "bun",
      ),
    ).toBeNull();

    await requireDb()
      .update(actors)
      .set({ disabled: false })
      .where(eq(actors.id, current.manager.id));
    const reducedToken = await createInvite("Reduced issuer");
    await requireDb()
      .update(roles)
      .set({ permissions: ["claims:read"] })
      .where(eq(roles.id, current.managerRole.id));
    expect(
      await acceptInvitation(
        reducedToken,
        "Reduced issuer",
        "a secure household password",
        "bun",
      ),
    ).toBeNull();
  }, 30_000);

  test("invalidates password-reset capabilities when their issuer is disabled", async () => {
    const current = fixture!;
    const token = await createPasswordReset(
      current.managerAuthority.user.id,
      current.manager.id,
      current.householdId,
    );
    expect(token).toMatch(/^domino_reset_/);
    const disabled = await actions.toggle?.({
      locals: locals(current.ownerAuthority),
      request: formRequest({ actorId: current.manager.id, disabled: "true" }),
    } as never);
    expect(disabled).toMatchObject({ accountUpdated: true });
    expect(
      await resetPassword(token!, "a replacement household password"),
    ).toBe(false);
  }, 15_000);

  test("filters product notes through selected claim authority", async () => {
    const current = fixture!;
    await requireDb()
      .insert(notes)
      .values([
        {
          householdId: current.householdId,
          productId: current.product.id,
          claimId: current.claimA.id,
          body: "Visible selected claim note",
        },
        {
          householdId: current.householdId,
          productId: current.product.id,
          claimId: current.claimB.id,
          body: "Hidden unselected claim note",
        },
        {
          householdId: current.householdId,
          productId: current.product.id,
          body: "Visible product note",
        },
      ]);
    const access = {
      claims: true,
      documents: true,
      notes: true,
      claimIds: [current.claimA.id],
    };
    const [summary] = await listProductSummaries(
      requireDb(),
      current.householdId,
      false,
      access,
      { productIds: [current.product.id] },
    );
    const detail = await getProductDetail(
      requireDb(),
      current.householdId,
      current.product.id,
      access,
    );
    expect(summary?.notes).toBe(2);
    expect(detail?.notes.map((note) => note.body).sort()).toEqual([
      "Visible product note",
      "Visible selected claim note",
    ]);
  });

  test("grants and audits claim access for a selected-scope creator", async () => {
    const current = fixture!;
    const [product] = await requireDb()
      .select({ id: products.id })
      .from(products)
      .where(eq(products.householdId, current.householdId))
      .limit(1);
    const claim = await createClaim(
      requireDb(),
      current.householdId,
      current.manager.id,
      product.id,
      { issue: "Creator-scoped claim" },
    );
    expect(claim).toBeTruthy();
    const [grant] = await requireDb()
      .select({ claimId: actorClaimAccess.claimId })
      .from(actorClaimAccess)
      .where(
        and(
          eq(actorClaimAccess.actorId, current.manager.id),
          eq(actorClaimAccess.claimId, claim!.id),
        ),
      );
    const [audit] = await requireDb()
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.resourceId, claim!.id),
          eq(auditEvents.action, "claim.access.self_grant"),
        ),
      );
    expect(grant?.claimId).toBe(claim!.id);
    expect(audit?.action).toBe("claim.access.self_grant");
  });

  test("approves a scoped device and refuses a stale or foreign grant", async () => {
    const current = fixture!;
    const session = await createWebSession(current.manager.id, "bun-test");
    expect(session).toBeTruthy();
    const started = await app.request("/api/device/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Integration agent" }),
    });
    const device = (await started.json()) as {
      userCode: string;
      deviceCode: string;
    };
    const denied = await app.request("/api/device/approve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${sessionCookieName}=${session}`,
        origin: "http://domino.test",
      },
      body: JSON.stringify({
        userCode: device.userCode,
        permissions: ["claims:read"],
        claimAccessScope: "selected",
        claimIds: [current.claimB.id],
      }),
    });
    expect(denied.status).toBe(403);

    const approved = await app.request("/api/device/approve", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${sessionCookieName}=${session}`,
        origin: "http://domino.test",
      },
      body: JSON.stringify({
        userCode: device.userCode,
        permissions: ["claims:read"],
        claimAccessScope: "selected",
        claimIds: [current.claimA.id],
      }),
    });
    expect(approved.status).toBe(200);
  });

  test("rechecks a manager whose claim scope changes while a mutation waits", async () => {
    const current = fixture!;
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM actors WHERE id = $1 FOR UPDATE", [
        current.manager.id,
      ]);
      const pending = actions.claims?.({
        locals: locals({
          ...current.managerAuthority,
          claimIds: [current.claimA.id, current.claimB.id],
        }),
        request: formRequest({
          actorId: current.target.id,
          claimAccessScope: "selected",
          claimId: current.claimB.id,
        }),
      } as never);
      await client.query("DELETE FROM actor_claim_access WHERE actor_id = $1", [
        current.manager.id,
      ]);
      await client.query(
        "INSERT INTO actor_claim_access (actor_id, claim_id, granted_by_actor_id) VALUES ($1, $2, $3)",
        [current.manager.id, current.claimA.id, current.owner.id],
      );
      await client.query("COMMIT");
      const result = await pending;
      expect(actionStatus(result)).toBe(403);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  test("revokes only service accounts within the current manager's authority", async () => {
    const current = fixture!;
    const token = `dom_${crypto.randomUUID().replaceAll("-", "")}`;
    await requireDb()
      .insert(apiCredentials)
      .values({
        actorId: current.manager.id,
        name: "Integration credential",
        tokenPrefix: token.slice(0, 12),
        tokenHash: createHash("sha256").update(token).digest("hex"),
      });
    const broad = await app.request(
      `/api/v1/service-accounts/${current.broadTarget.id}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
    );
    expect(broad.status).toBe(403);
    const scoped = await app.request(
      `/api/v1/service-accounts/${current.target.id}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
    );
    expect(scoped.status).toBe(200);
  });

  test("throttles credential activity writes without weakening authentication", async () => {
    const current = fixture!;
    const token = `dom_${crypto.randomUUID().replaceAll("-", "")}`;
    const [credential] = await requireDb()
      .insert(apiCredentials)
      .values({
        actorId: current.manager.id,
        name: "Activity throttle",
        tokenPrefix: token.slice(0, 12),
        tokenHash: createHash("sha256").update(token).digest("hex"),
        lastUsedAt: new Date(Date.now() - 10 * 60_000),
      })
      .returning({ id: apiCredentials.id });
    const request = () =>
      app.request("/api/v1/products?limit=1", {
        headers: { authorization: `Bearer ${token}` },
      });

    expect((await request()).status).toBe(403);
    const [first] = await requireDb()
      .select({ lastUsedAt: apiCredentials.lastUsedAt })
      .from(apiCredentials)
      .where(eq(apiCredentials.id, credential.id));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await request()).status).toBe(403);
    const [second] = await requireDb()
      .select({ lastUsedAt: apiCredentials.lastUsedAt })
      .from(apiCredentials)
      .where(eq(apiCredentials.id, credential.id));
    expect(second.lastUsedAt?.getTime()).toBe(first.lastUsedAt?.getTime());
  });

  test("scopes audit events and metadata to selected claims", async () => {
    const current = fixture!;
    await requireDb()
      .update(roles)
      .set({
        permissions: [...current.managerRole.permissions, "audit:read"],
      })
      .where(eq(roles.id, current.managerRole.id));
    const token = `dom_${crypto.randomUUID().replaceAll("-", "")}`;
    await requireDb()
      .insert(apiCredentials)
      .values({
        actorId: current.manager.id,
        name: "Scoped audit",
        tokenPrefix: token.slice(0, 12),
        tokenHash: createHash("sha256").update(token).digest("hex"),
      });
    const suffix = crypto.randomUUID();
    await requireDb()
      .insert(auditEvents)
      .values([
        {
          householdId: current.householdId,
          actorId: current.owner.id,
          action: `allowed.${suffix}`,
          resourceType: "claim",
          resourceId: current.claimA.id,
          summary: "Allowed claim event",
        },
        {
          householdId: current.householdId,
          actorId: current.owner.id,
          action: `denied.${suffix}`,
          resourceType: "claim",
          resourceId: current.claimB.id,
          summary: "Denied claim event",
        },
        {
          householdId: current.householdId,
          actorId: current.owner.id,
          action: `general.${suffix}`,
          resourceType: "actor",
          resourceId: current.target.id,
          summary: "General authority event",
          metadata: {
            claimIds: [current.claimA.id, current.claimB.id],
            safe: "kept",
          },
        },
      ]);

    const response = await app.request("/api/v1/audit?limit=200", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      events: Array<{
        action: string;
        summary: string;
        metadata: Record<string, unknown>;
      }>;
    };
    expect(
      body.events.some((event) => event.action === `allowed.${suffix}`),
    ).toBe(true);
    expect(
      body.events.some((event) => event.action === `denied.${suffix}`),
    ).toBe(false);
    const general = body.events.find(
      (event) => event.action === `general.${suffix}`,
    );
    expect(general?.metadata).toEqual({ safe: "kept" });

    await requireDb()
      .insert(auditEvents)
      .values({
        householdId: current.householdId,
        actorId: current.owner.id,
        action: "account.claim_access.update",
        resourceType: "actor",
        resourceId: current.target.id,
        summary: "Limited claim access to 17 selected claims",
        metadata: { scope: "all", claimIds: [current.claimA.id] },
      });
    const redactedResponse = await app.request("/api/v1/audit?limit=200", {
      headers: { authorization: `Bearer ${token}` },
    });
    const redactedBody = (await redactedResponse.json()) as typeof body;
    const authorityUpdate = redactedBody.events.find(
      (event) => event.action === "account.claim_access.update",
    );
    expect(authorityUpdate?.summary).toBe("Updated account claim access");
    expect(authorityUpdate?.metadata).toEqual({});
  });

  test("auto-provisions OIDC users with the configured default claim set", async () => {
    const current = fixture!;
    process.env.DOMINO_OIDC_HOUSEHOLD_ID = current.householdId;
    const config = getOidcConfig({
      DOMINO_OIDC_ISSUER: "https://id.example.test",
      DOMINO_OIDC_CLIENT_ID: "domino",
      DOMINO_OIDC_CLIENT_SECRET: "test-secret",
      DOMINO_SESSION_SECRET: "a-session-secret-that-is-at-least-32-characters",
      DOMINO_OIDC_DEFAULT_ROLE: `Member ${current.memberRole.id.slice(0, 8)}`,
      DOMINO_OIDC_DEFAULT_CLAIM_PRESET: "attention",
    });
    expect(config).not.toBeNull();
    if (!config) return;
    const roleName = `OIDC ${crypto.randomUUID().slice(0, 8)}`;
    await requireDb()
      .update(roles)
      .set({ name: roleName })
      .where(eq(roles.id, current.memberRole.id));
    config.defaultRole = roleName;
    const actorId = await linkIdentityToActor(config, {
      sub: crypto.randomUUID(),
      email: `oidc-${crypto.randomUUID()}@example.test`,
      email_verified: true,
      name: "OIDC person",
    });
    const grants = await requireDb()
      .select({ claimId: actorClaimAccess.claimId })
      .from(actorClaimAccess)
      .where(eq(actorClaimAccess.actorId, actorId));
    expect(grants.map((grant) => grant.claimId)).toEqual([current.claimA.id]);
  });
});
