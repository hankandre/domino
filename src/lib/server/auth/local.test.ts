import { describe, expect, test } from "vitest";
import {
  consumeLoginAttempt,
  inspectInvitation,
  inspectPasswordReset,
} from "./local";

describe("local login throttling", () => {
  test("limits an address even when it rotates email addresses", () => {
    const address = `test-${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(
        consumeLoginAttempt(address, `person-${attempt}@example.test`),
      ).toBe(true);
    }
    expect(consumeLoginAttempt(address, "another@example.test")).toBe(false);
  });

  test("rejects malformed public tokens before reaching the database", async () => {
    await expect(inspectInvitation("not-an-invitation")).resolves.toBeNull();
    await expect(inspectPasswordReset("not-a-reset")).resolves.toBeNull();
  });
});
