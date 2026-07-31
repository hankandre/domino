import { describe, expect, test } from "bun:test";
import {
  consumeLoginAttempt,
  inspectInvitation,
  inspectPasswordReset,
} from "./local";

describe("local login throttling", () => {
  test("does not let a shared reverse-proxy address lock out other identities", () => {
    const address = `test-${crypto.randomUUID()}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(consumeLoginAttempt(address, "first-person@example.test")).toBe(
        true,
      );
    }
    expect(consumeLoginAttempt(address, "first-person@example.test")).toBe(
      false,
    );
    expect(consumeLoginAttempt(address, "another@example.test")).toBe(true);
  });

  test("rejects malformed public tokens before reaching the database", async () => {
    await expect(inspectInvitation("not-an-invitation")).resolves.toBeNull();
    await expect(inspectPasswordReset("not-a-reset")).resolves.toBeNull();
  });
});
