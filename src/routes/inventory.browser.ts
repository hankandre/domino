import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import type { ProductSummary } from "$lib/types";
import InventoryPage from "./+page.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../test/browser/accessibility";

// This file is selected only by the Vitest Browser Mode configuration.

const products: ProductSummary[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Stand Mixer",
    brand: "KitchenAid",
    model: "KSM195",
    category: "Kitchen",
    purchasedAt: "2026-07-12",
    warrantyEndsAt: "2027-07-12",
    coverageStatus: "active",
    imageUrl: null,
    documents: 2,
    notes: 1,
    serialNumbers: ["MIXER-101"],
    retailer: "Example Home Store",
    orderNumber: "ORDER-101",
    activeClaim: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reference: "CLM-101",
      status: "needs_evidence",
      summary: "Motor stalls",
      nextAction: "Attach a short video",
    },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Cordless Vacuum",
    brand: "Dyson",
    model: "V15",
    category: "Cleaning",
    purchasedAt: "2025-02-02",
    warrantyEndsAt: "2026-09-01",
    coverageStatus: "expiring",
    imageUrl: null,
    documents: 1,
    notes: 0,
    serialNumbers: ["VAC-202"],
    retailer: "Example Electronics",
    orderNumber: "ORDER-202",
  },
];

function actor(permissions: string[]) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    householdId: "55555555-5555-4555-8555-555555555555",
    kind: "user" as const,
    permissions,
    claimAccessScope: "all" as const,
    claimIds: undefined,
    user: {
      id: "66666666-6666-4666-8666-666666666666",
      email: "owner@example.test",
      displayName: "Household owner",
    },
  };
}

function pageData(
  permissions: string[],
  inventoryPageOverrides: Partial<{
    page: number;
    hasMore: boolean;
    previousHref: string | null;
    nextHref: string | null;
    query: string;
    filter: "all" | "claims" | "expiring" | "active" | "expired" | "unknown";
    sort: "newest" | "name" | "warranty";
    total: number | null;
    totalIsExact: boolean;
  }> = {},
) {
  return {
    products,
    openClaims: 1,
    expiring: 1,
    inventoryPage: {
      page: 1,
      hasMore: false,
      previousHref: null,
      nextHref: null,
      query: "",
      filter: "all" as const,
      sort: "newest" as const,
      total: products.length,
      totalIsExact: true,
      ...inventoryPageOverrides,
    },
    actor: actor(permissions),
    demoMode: false,
    documentStore: "Domino storage",
    oidc: { enabled: false, providerName: "OIDC" },
  };
}

test("attention rows navigate while inventory filters live in an explicit menu", async () => {
  const screen = await render(InventoryPage, {
    data: pageData(["products:create"]),
  });

  await expect
    .element(screen.getByRole("link", { name: /Open claims/ }))
    .toHaveAttribute("href", "/claims");
  await expect
    .element(screen.getByRole("link", { name: /Expiring soon/ }))
    .toHaveAttribute("href", "/warranties/expiring");

  await screen.getByRole("button", { name: "Filter & sort" }).click();
  await expect
    .element(
      screen.getByRole("form", { name: "Inventory filters and sorting" }),
    )
    .toBeVisible();
  await screen.getByText("Has an open claim", { exact: true }).click();

  await expect
    .element(screen.getByRole("radio", { name: "Has an open claim" }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("heading", { name: "Cordless Vacuum" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Apply to all products" }))
    .toBeVisible();
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("offers navigation when more household records exist", async () => {
  const screen = await render(InventoryPage, {
    data: pageData([], {
      page: 2,
      hasMore: true,
      previousHref: "/?page=1",
      nextHref: "/?page=3",
      total: null,
      totalIsExact: false,
    }),
  });

  const pagination = screen.getByRole("navigation", {
    name: "inventory pagination",
  });
  await expect
    .element(pagination.getByRole("link", { name: "Previous" }))
    .toHaveAttribute("href", "/?page=1");
  await expect
    .element(pagination.getByRole("link", { name: "Next" }))
    .toHaveAttribute("href", "/?page=3");
});

test("search has an explicit label and a separate clear action", async () => {
  const screen = await render(InventoryPage, {
    data: pageData([]),
  });
  const search = screen.getByRole("textbox", {
    name: "Search household inventory",
  });

  await search.fill("VAC-202");
  await expect
    .element(screen.getByRole("heading", { name: "Cordless Vacuum" }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Clear search" }).click();

  await expect.element(search).toHaveValue("");
  await expect
    .element(screen.getByRole("heading", { name: "Stand Mixer" }))
    .toBeVisible();
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("distinguishes an empty search result from an empty household", async () => {
  const screen = await render(InventoryPage, {
    data: {
      ...pageData([], {
        query: "missing product",
        total: 0,
        totalIsExact: true,
      }),
      products: [],
    },
  });

  await expect
    .element(screen.getByRole("heading", { name: "No matching products" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Add your first product" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Clear search and filters" }))
    .toHaveAttribute("href", "/");
});
