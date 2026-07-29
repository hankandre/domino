import { describe, expect, test } from "vitest";
import { suggestProductImage } from "./image-suggestions";

describe("product image URL safety", () => {
  test("rejects IPv4 loopback targets", async () => {
    await expect(
      suggestProductImage("http://127.0.0.1/product"),
    ).rejects.toThrow("Private addresses are not allowed");
  });

  test("rejects IPv6 unique-local targets", async () => {
    await expect(
      suggestProductImage("http://[fc00::1]/product"),
    ).rejects.toThrow("Private addresses are not allowed");
  });
});
