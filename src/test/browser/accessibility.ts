import axe, { type ElementContext, type Result } from "axe-core";
import { expect } from "vitest";

function summarize(violations: Result[]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

export async function expectNoSeriousAccessibilityViolations(
  root: ElementContext = document,
) {
  const results = await axe.run(root, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
    },
  });
  const violations = results.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
  expect(summarize(violations)).toEqual([]);
}

export function expectMinimumInteractiveTargetSize(
  root: ParentNode = document,
  minimum = 44,
) {
  const measured = new Set<HTMLElement>();
  const undersized = [
    ...root.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type="hidden"]), select, textarea, summary',
    ),
  ]
    .map((element) => {
      if (element instanceof HTMLInputElement) {
        return element.closest<HTMLElement>("label") ?? element;
      }
      return element;
    })
    .filter((element) => {
      const style = getComputedStyle(element);
      if (
        measured.has(element) ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.getClientRects().length === 0
      ) {
        return false;
      }
      measured.add(element);
      return true;
    })
    .map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        element:
          element.getAttribute("aria-label") ??
          element.textContent?.trim().replaceAll(/\s+/g, " ").slice(0, 80) ??
          `${element.tagName.toLowerCase()}.${element.className}`,
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    })
    .filter(({ width, height }) => width < minimum || height < minimum);
  expect(undersized).toEqual([]);
}
