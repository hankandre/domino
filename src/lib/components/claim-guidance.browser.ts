import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import ClaimGuidanceEditor from "./ClaimGuidanceEditor.svelte";
import ClaimGuidance from "../../routes/claims/[id]/_components/ClaimGuidance.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../../test/browser/accessibility";

// This file is selected only by the Vitest Browser Mode configuration.

test("builds structured submission, evidence, and checklist guidance", async () => {
  const screen = await render(ClaimGuidanceEditor, {
    submissionMethods: [],
    requiredEvidence: [],
    claimInstructions: [],
  });

  await screen.getByRole("checkbox", { name: "Website" }).click();
  await screen.getByRole("button", { name: "Add evidence" }).click();
  await screen
    .getByRole("textbox", { name: "Evidence item 1", exact: true })
    .fill("Proof of purchase");
  await screen.getByRole("button", { name: "Add step" }).click();
  await screen
    .getByRole("textbox", { name: "Step 1 title", exact: true })
    .fill("Open the support form");
  await screen
    .getByRole("textbox", { name: "Step 1 details", exact: true })
    .fill("Save the confirmation number.");

  await expect
    .element(screen.getByRole("checkbox", { name: "Website" }))
    .toBeChecked();
  await expect
    .element(
      screen.getByRole("textbox", { name: "Evidence item 1", exact: true }),
    )
    .toHaveValue("Proof of purchase");
  await expect
    .element(screen.getByRole("textbox", { name: "Step 1 title", exact: true }))
    .toHaveValue("Open the support form");
  await expect
    .element(screen.getByRole("checkbox", { name: "Required step" }))
    .toBeChecked();

  await screen.getByRole("button", { name: "Remove evidence item 1" }).click();
  await expect
    .element(screen.getByText("No provider-specific evidence recorded."))
    .toBeVisible();
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("presents urgent filing guidance as a semantic checklist", async () => {
  const screen = await render(ClaimGuidance, {
    brand: "Acme",
    warranty: {
      provider: "Acme Support",
      claimDeadline: "2026-08-15",
      submissionMethods: ["web", "phone"],
      eligibilityNotes: "Coverage applies to household use.",
      requiredEvidence: [
        { label: "Proof of purchase", required: true },
        { label: "Serial number photo", required: false },
      ],
      claimInstructions: [
        {
          title: "Open the support form",
          detail: "Save the confirmation number.",
          required: true,
        },
      ],
    } as never,
  });

  await expect
    .element(screen.getByRole("heading", { name: "File with Acme Support" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("list").getByText("Open the support form"))
    .toBeVisible();
  await expectNoSeriousAccessibilityViolations();
});
