import { afterEach, describe, expect, test } from "bun:test";
import { clearRateLimitsForTests, consumeRateLimit } from "./rate-limit";

afterEach(clearRateLimitsForTests);

describe("rate limiter", () => {
  test("isolates keys and resets after the configured window", () => {
    expect(consumeRateLimit("login", "alice", 2, 1_000, 100).allowed).toBe(
      true,
    );
    expect(consumeRateLimit("login", "alice", 2, 1_000, 101).allowed).toBe(
      true,
    );
    expect(consumeRateLimit("login", "alice", 2, 1_000, 102).allowed).toBe(
      false,
    );
    expect(consumeRateLimit("login", "bob", 2, 1_000, 102).allowed).toBe(true);
    expect(consumeRateLimit("login", "alice", 2, 1_000, 1_101).allowed).toBe(
      true,
    );
  });
});
