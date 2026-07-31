import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import AppShell from "../test/fixtures/AppShell.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../test/browser/accessibility";

afterEach(async () => {
  document.documentElement.style.zoom = "";
  await page.viewport(1280, 720);
});

test("mobile navigation traps focus, closes with Escape, and restores focus", async () => {
  await page.viewport(320, 720);
  const screen = await render(AppShell);
  const trigger = screen.getByRole("button", { name: "Open navigation" });

  await trigger.click();
  const closeControls = screen.getByRole("button", {
    name: "Close navigation",
  });
  await expect.element(closeControls).toHaveLength(1);
  const close = closeControls.first();
  await expect.element(close).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("the application shell reflows at 200 percent zoom", async () => {
  await page.viewport(1280, 720);
  document.documentElement.style.zoom = "2";
  await render(AppShell);

  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
  await expectNoSeriousAccessibilityViolations();
});

test("resizing an open mobile drawer restores desktop content", async () => {
  await page.viewport(320, 720);
  const screen = await render(AppShell);
  const trigger = screen.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await page.viewport(1280, 720);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

  const desktopTrigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Open navigation"]',
  );
  expect(desktopTrigger?.getClientRects()).toHaveLength(0);
  expect(document.querySelector("main")?.inert).toBe(false);
  expect(document.body.style.overflow).toBe("");
});
