import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import ClaimAccessPicker from "./ClaimAccessPicker.svelte";
import PermissionPresetPicker from "./PermissionPresetPicker.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../../../test/browser/accessibility";

// This file is selected only by the Vitest Browser Mode configuration.

const claims = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    reference: "CLM-101",
    issue: "Leaking seal",
    status: "needs_evidence",
    productName: "Dishwasher",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    reference: "CLM-102",
    issue: "Motor stopped",
    status: "submitted",
    productName: "Mixer",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    reference: "CLM-103",
    issue: "Resolved fixture",
    status: "resolved",
    productName: "Vacuum",
  },
];

test("permission presets expose and update their selected state", async () => {
  const screen = await render(PermissionPresetPicker, {
    presets: [
      {
        id: "read",
        label: "Read only",
        description: "Review products and claims.",
        permissions: ["products:read", "claims:read"],
      },
      {
        id: "intake",
        label: "Inventory intake",
        description: "Add products and documents.",
        permissions: ["products:create", "documents:attach"],
      },
    ],
    selected: [],
    activePresetId: null,
  });

  const readOnly = screen.getByRole("button", { name: /Read only/ });
  const intake = screen.getByRole("button", { name: /Inventory intake/ });
  await expect.element(readOnly).toHaveAttribute("aria-pressed", "false");
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();

  await intake.click();

  await expect.element(intake).toHaveAttribute("aria-pressed", "true");
  await expect.element(readOnly).toHaveAttribute("aria-pressed", "false");
});

test("claim presets remain distinct and manual edits clear the preset", async () => {
  const screen = await render(ClaimAccessPicker, {
    claims,
    canGrantAll: true,
    scope: "selected",
    selectedClaimIds: [],
    activePresetId: "none",
  });

  await screen.getByRole("button", { name: "Open claims" }).click();
  await expect
    .element(screen.getByText("2 existing claims selected"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Open claims" }))
    .toHaveAttribute("aria-pressed", "true");

  await screen.getByRole("checkbox", { name: /CLM-103/ }).click();

  await expect
    .element(screen.getByText("3 existing claims selected"))
    .toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Open claims" }))
    .toHaveAttribute("aria-pressed", "false");
  await expect
    .element(page.getByText("All current and future claims"))
    .not.toBeInTheDocument();
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});
