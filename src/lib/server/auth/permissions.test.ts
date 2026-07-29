import { describe, expect, it } from "vitest";
import { can, roleTemplates } from "./permissions";

describe("permission templates", () => {
  it("keeps the reader role read-only", () => {
    const reader = roleTemplates["agent-reader"].permissions;
    expect(can(reader, "warranties:read")).toBe(true);
    expect(can(reader, "claims:create")).toBe(false);
    expect(can(reader, "household:manage")).toBe(false);
    expect(can(reader, "paperless:discover")).toBe(false);
  });

  it("allows a claim assistant to prepare claims without household administration", () => {
    const assistant = roleTemplates["claim-assistant"].permissions;
    expect(can(assistant, "claims:create")).toBe(true);
    expect(can(assistant, "documents:attach")).toBe(true);
    expect(can(assistant, "paperless:discover")).toBe(false);
    expect(can(assistant, "service_accounts:manage")).toBe(false);
  });
});
