import { describe, expect, test } from "vitest";
import { consumeLoginAttempt } from "./local";

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
});
