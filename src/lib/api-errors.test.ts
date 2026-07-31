import { describe, expect, test } from "bun:test";
import { networkError, responseError } from "./api-errors";

describe("API error mapping", () => {
  test("uses a structured server error and safely falls back for non-JSON", async () => {
    await expect(
      responseError(
        Response.json({ error: "The record is unavailable." }, { status: 404 }),
        "Fallback",
      ),
    ).resolves.toBe("The record is unavailable.");
    await expect(
      responseError(new Response("proxy failure", { status: 502 }), "Fallback"),
    ).resolves.toBe("Fallback");
  });

  test("preserves useful network details", () => {
    expect(networkError(new Error("connection reset"), "Request failed.")).toBe(
      "Request failed. connection reset",
    );
    expect(networkError(null, "Request failed.")).toBe("Request failed.");
  });
});
