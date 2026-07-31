import { describe, expect, test } from "bun:test";
import {
  canAdministerActorAuthority,
  claimAuthority,
  canAdministerPermissions,
  canAdministerUserIdentity,
  hasPermission,
  requireAnyPagePermission,
  requirePagePermission,
  relatedReadAccess,
} from "./authorization";

function actor(permissions: string[]): NonNullable<App.Locals["actor"]> {
  return {
    id: "actor-one",
    householdId: "household-one",
    kind: "user",
    permissions,
    claimAccessScope: "all",
    claimIds: undefined,
  };
}

describe("page authorization", () => {
  test("normalizes claim authority sets and checks both authority dimensions", () => {
    const administrator = {
      permissions: ["claims:read", "claims:manage"],
      ...claimAuthority("selected", ["claim-a", "claim-a", "claim-b"]),
    };

    expect(administrator.claimIds).toEqual(["claim-a", "claim-b"]);
    expect(
      canAdministerActorAuthority(administrator, {
        permissions: ["claims:read"],
        ...claimAuthority("selected", ["claim-b"]),
      }),
    ).toBe(true);
    expect(
      canAdministerActorAuthority(administrator, {
        permissions: ["claims:read", "documents:read"],
        ...claimAuthority("selected", ["claim-b"]),
      }),
    ).toBe(false);
    expect(
      canAdministerActorAuthority(administrator, {
        permissions: ["claims:read"],
        ...claimAuthority("all"),
      }),
    ).toBe(false);
  });

  test("only administers roles within the administrator's authority", () => {
    expect(
      canAdministerPermissions(
        ["household:manage", "claims:read"],
        ["claims:read"],
      ),
    ).toBe(true);
    expect(
      canAdministerPermissions(
        ["household:manage", "claims:read"],
        ["claims:read", "claims:write"],
      ),
    ).toBe(false);
    expect(canAdministerPermissions(["*"], ["claims:write"])).toBe(true);
  });

  test("does not reset a user identity shared with another household", () => {
    expect(
      canAdministerUserIdentity(
        actor(["household:manage", "claims:read"]),
        "household-one",
        [
          {
            householdId: "household-one",
            permissions: ["claims:read"],
            claimAccessScope: "all",
            claimIds: undefined,
          },
          {
            householdId: "household-two",
            permissions: ["claims:read"],
            claimAccessScope: "all",
            claimIds: undefined,
          },
        ],
      ),
    ).toBe(false);
  });

  test("does not reset an identity with permissions above the manager", () => {
    expect(
      canAdministerUserIdentity(
        actor(["household:manage", "claims:read"]),
        "household-one",
        [
          {
            householdId: "household-one",
            permissions: ["claims:manage"],
            claimAccessScope: "all",
            claimIds: undefined,
          },
        ],
      ),
    ).toBe(false);
  });

  test("does not let a claim-restricted manager administer a broader identity", () => {
    expect(
      canAdministerUserIdentity(
        {
          ...actor(["household:manage", "claims:read"]),
          claimAccessScope: "selected",
          claimIds: ["claim-one"],
        },
        "household-one",
        [
          {
            householdId: "household-one",
            permissions: ["claims:read"],
            claimAccessScope: "all",
            claimIds: undefined,
          },
        ],
      ),
    ).toBe(false);
  });

  test("only administers claim selections within the manager's own scope", () => {
    const administrator = {
      ...actor(["household:manage", "claims:read"]),
      claimAccessScope: "selected" as const,
      claimIds: ["claim-one", "claim-two"],
    };

    expect(
      canAdministerActorAuthority(administrator, {
        permissions: ["claims:read"],
        claimAccessScope: "selected",
        claimIds: ["claim-two"],
      }),
    ).toBe(true);
    expect(
      canAdministerActorAuthority(administrator, {
        permissions: ["claims:read"],
        claimAccessScope: "selected",
        claimIds: ["claim-three"],
      }),
    ).toBe(false);
    expect(
      canAdministerActorAuthority(administrator, {
        permissions: ["claims:read"],
        claimAccessScope: "all",
        claimIds: undefined,
      }),
    ).toBe(false);
  });

  test("accepts an explicit permission or wildcard", () => {
    expect(hasPermission(actor(["claims:read"]), "claims:read")).toBe(true);
    expect(hasPermission(actor(["*"]), "claims:read")).toBe(true);
  });

  test("rejects direct page reads without the required permission", () => {
    try {
      requirePagePermission(actor(["warranties:read"]), "claims:read");
      throw new Error("Expected the page guard to reject the actor.");
    } catch (cause) {
      expect(cause).toMatchObject({
        status: 403,
        body: { message: "Missing permission: claims:read" },
      });
    }
  });

  test("allows settings when either management permission is present", () => {
    expect(() =>
      requireAnyPagePermission(actor(["integrations:manage"]), [
        "household:manage",
        "integrations:manage",
      ]),
    ).not.toThrow();
  });

  test("carries selected claim ids into related-data projections", () => {
    const restricted = {
      ...actor(["claims:read", "documents:read"]),
      claimAccessScope: "selected" as const,
      claimIds: ["claim-one"],
    };

    expect(relatedReadAccess(restricted)).toEqual({
      claims: true,
      claimIds: ["claim-one"],
      documents: true,
      notes: false,
    });
  });
});
