import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import DocumentAttachments from "./DocumentAttachments.svelte";
import ImagePicker from "./ImagePicker.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../../../../test/browser/accessibility";

// This file is selected only by the Vitest Browser Mode configuration.

test("image source choices are labelled radios with a recoverable error", async () => {
  const screen = await render(ImagePicker, {
    productUrl: "",
    selectedImageUrl: "",
    imageMode: "fetch",
    saving: false,
  });

  const fetchChoice = screen.getByRole("radio", { name: "Fetch" });
  const uploadChoice = screen.getByRole("radio", { name: "Upload" });
  await expect.element(fetchChoice).toBeChecked();

  await screen.getByRole("button", { name: "Find image" }).click();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Enter the product page URL first.");

  await screen.getByText("Upload", { exact: true }).click();
  await expect.element(uploadChoice).toBeChecked();
  await expect
    .element(screen.getByLabelText(/Choose an image/))
    .toHaveAttribute("type", "file");
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("document intake announces the authoritative backend and labels controls", async () => {
  const paperless = await render(DocumentAttachments, {
    backend: "paperless",
  });

  await expect.element(paperless.getByText(/Paperless-ngx/)).toBeVisible();
  await expect
    .element(paperless.getByLabelText("Attachment type"))
    .toHaveValue("receipt");
  await expect
    .element(paperless.getByLabelText(/Attach receipt, manual/))
    .toHaveAttribute("multiple");
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});
