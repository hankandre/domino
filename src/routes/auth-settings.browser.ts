import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import ActivatePage from "./activate/+page.svelte";
import LoginPage from "./login/+page.svelte";
import SettingsPage from "./settings/+page.svelte";
import AccountRow from "./settings/access/_components/AccountRow.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../test/browser/accessibility";
import { captureNextFormSubmission, requestBody } from "../test/browser/forms";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("local sign-in submits only the entered credentials and return path", async () => {
  const screen = await render(LoginPage, {
    data: { oidc: { enabled: true, providerName: "Pocket ID" } } as never,
    form: null,
  });

  await screen
    .getByRole("textbox", { name: "Email" })
    .fill("owner@example.test");
  await screen.getByLabelText("Password").fill("correct horse battery staple");
  const submission = captureNextFormSubmission();
  await screen.getByRole("button", { name: "Sign in" }).click();
  const submitted = await submission;

  expect(submitted.data.get("email")).toBe("owner@example.test");
  expect(submitted.data.get("password")).toBe("correct horse battery staple");
  expect(submitted.data.get("returnTo")).toBe("/");
  await expect
    .element(screen.getByRole("link", { name: "Continue with Pocket ID" }))
    .toHaveAttribute("href", "/auth/oidc/login?returnTo=%2F");
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("Paperless settings accept a URL and fresh token without displaying a saved token", async () => {
  const screen = await render(SettingsPage, {
    data: {
      settings: { defaultDocumentBackend: "local", expiryWindowDays: 45 },
      paperless: {
        enabled: true,
        configured: true,
        baseUrl: "https://paperless.example.test",
        source: "database",
        configurationError: null,
      },
      canManageHousehold: true,
      canManagePaperless: true,
      oidc: { enabled: true, providerName: "Pocket ID" },
    } as never,
    form: null,
  });

  const url = screen.getByRole("textbox", { name: "Paperless URL" });
  const token = screen.getByLabelText("API token");
  await expect.element(url).toHaveValue("https://paperless.example.test");
  await expect.element(token).toHaveValue("");
  await url.fill("https://docs.example.test/paperless");
  await token.fill("fresh-paperless-token");
  const submission = captureNextFormSubmission();
  await screen.getByRole("button", { name: "Save connection" }).click();
  const submitted = await submission;

  expect(submitted.action).toBe("?/savePaperless");
  expect(submitted.data.get("paperlessUrl")).toBe(
    "https://docs.example.test/paperless",
  );
  expect(submitted.data.get("paperlessToken")).toBe("fresh-paperless-token");
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("device approval sends the explicitly selected claim scope", async () => {
  let approvedBody: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      approvedBody = await requestBody(init);
      return new Response(JSON.stringify({ name: "Hermes" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const claimId = "11111111-1111-4111-8111-111111111111";
  const screen = await render(ActivatePage, {
    data: {
      grantablePermissions: ["products:read", "claims:read"],
      permissionPresets: [
        {
          id: "inventory",
          label: "Inventory reader",
          description: "Read inventory.",
          permissions: ["products:read", "claims:read"],
        },
      ],
      claims: [
        {
          id: claimId,
          reference: "CLM-101",
          issue: "Motor stopped",
          status: "needs_evidence",
          productName: "Stand Mixer",
        },
      ],
      canGrantAllClaims: false,
    } as never,
  });

  await screen.getByRole("textbox", { name: "One-time code" }).fill("A1B2C3D4");
  await screen.getByRole("button", { name: "Approve device" }).click();
  const confirmation = screen.getByRole("status");
  await expect.element(confirmation).toHaveTextContent("Device approved");
  await expect.element(confirmation).toHaveFocus();
  expect(approvedBody).toEqual({
    userCode: "A1B2C3D4",
    permissions: ["products:read", "claims:read"],
    claimAccessScope: "selected",
    claimIds: [claimId],
  });
  await expectNoSeriousAccessibilityViolations();
});

test("service-account revocation invalidates credentials through its bounded API", async () => {
  let requestUrl = "";
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ revoked: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const screen = await render(AccountRow, {
    account: {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "service",
      name: "Hermes",
      email: null,
      roleName: "Claim assistant",
      disabled: false,
      permissions: ["claims:read"],
      claimAccessScope: "selected",
      selectedClaimIds: [],
      canReset: false,
      canToggle: true,
      canEditClaimAccess: false,
      canEditPermissions: false,
    } as never,
    permissionOptions: [],
    permissionPresets: [],
    claims: [],
    canGrantAllClaims: false,
  });

  await screen.getByRole("button", { name: "Revoke account" }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Service account revoked");
  expect(requestUrl).toContain(
    "/api/v1/service-accounts/22222222-2222-4222-8222-222222222222",
  );
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});
