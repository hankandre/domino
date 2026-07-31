import { describe, expect, test } from "bun:test";
import {
  browserPageHref,
  browserPageWindow,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  normalizeListWindow,
} from "./pagination";

describe("bounded list windows", () => {
  test("uses a bounded default", () => {
    expect(normalizeListWindow()).toEqual({
      limit: DEFAULT_LIST_LIMIT,
      offset: 0,
    });
  });

  test("clamps unsafe values", () => {
    expect(normalizeListWindow({ limit: 10_000, offset: -4 })).toEqual({
      limit: MAX_LIST_LIMIT,
      offset: 0,
    });
    expect(normalizeListWindow({ limit: 0.5, offset: 2.9 })).toEqual({
      limit: 1,
      offset: 2,
    });
  });
});

describe("browser page windows", () => {
  test("turns one-based URL pages into bounded offsets", () => {
    expect(browserPageWindow(new URLSearchParams("page=3"), 48)).toEqual({
      page: 3,
      limit: 48,
      offset: 96,
    });
    expect(browserPageWindow(new URLSearchParams("page=-2"), 48).page).toBe(1);
  });

  test("preserves filters while changing pages", () => {
    const url = new URL("https://domino.test/products?q=mixer&page=3");
    expect(browserPageHref(url, 2)).toBe("/products?q=mixer&page=2");
    expect(browserPageHref(url, 1)).toBe("/products?q=mixer");
  });
});
