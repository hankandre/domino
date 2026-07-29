import { describe, expect, test } from "vitest";
import {
  hasPermission,
  requireAnyPagePermission,
  requirePagePermission,
} from "./authorization";

function actor(permissions: string[]): NonNullable<App.Locals["actor"]> {
  return {
    id: "actor-one",
    householdId: "household-one",
    kind: "user",
    permissions,
  };
}

describe("page authorization", () => {
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
});
