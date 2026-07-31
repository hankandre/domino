import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import AsyncNotices from "../../test/fixtures/AsyncNotices.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../../test/browser/accessibility";
import DocumentRow from "./DocumentRow.svelte";

test("document rows expose long names and only link ready content", async () => {
  const longName =
    "Manufacturer-warranty-manual-with-an-intentionally-long-descriptive-filename-that-must-wrap.pdf";
  const ready = await render(DocumentRow, {
    document: {
      id: "11111111-1111-4111-8111-111111111111",
      name: longName,
      kind: "manual",
      backend: "local",
      sizeBytes: 4096,
    },
    showSize: true,
  });
  await expect
    .element(ready.getByRole("link", { name: `Open ${longName}` }))
    .toHaveAttribute(
      "href",
      "/api/v1/documents/11111111-1111-4111-8111-111111111111/content",
    );
  await expect.element(ready.getByTitle(longName)).toBeVisible();

  const pending = await render(DocumentRow, {
    document: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Paperless receipt",
      kind: "receipt",
      backend: "paperless",
      processingStatus: "processing",
    },
  });
  await expect.element(pending.getByText("processing")).toBeVisible();
  await expect
    .element(pending.getByRole("link", { name: /Paperless receipt/ }))
    .not.toBeInTheDocument();
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("async notices announce recoverable errors and success", async () => {
  const screen = await render(AsyncNotices);
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Check the connection and try again");
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Evidence attached");
  await expectNoSeriousAccessibilityViolations();
});
