import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import ClaimManager from "./claims/[id]/_components/ClaimManager.svelte";
import NewClaimPage from "./claims/new/+page.svelte";
import ProductEditor from "./products/[id]/_components/ProductEditor.svelte";
import NewProductPage from "./products/new/+page.svelte";
import {
  expectMinimumInteractiveTargetSize,
  expectNoSeriousAccessibilityViolations,
} from "../test/browser/accessibility";
import { requestBody } from "../test/browser/forms";

const productId = "11111111-1111-4111-8111-111111111111";
const claimId = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("inventory creation saves product and structured warranty details", async () => {
  let submittedBody: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      submittedBody = await requestBody(init);
      return jsonResponse({ product: { id: productId } }, 201);
    }),
  );
  const screen = await render(NewProductPage, {
    data: { demoMode: true, defaultDocumentBackend: "local" } as never,
    form: null,
    params: {},
  });

  await screen
    .getByRole("textbox", { name: "Product name" })
    .fill("Stand Mixer");
  await screen.getByRole("textbox", { name: "Brand" }).fill("KitchenAid");
  await screen
    .getByRole("textbox", { name: "Provider", exact: true })
    .fill("KitchenAid Support");
  await screen.getByRole("button", { name: "Save product" }).click();

  await expect.element(screen.getByText("Product saved")).toBeVisible();
  expect(submittedBody).toMatchObject({
    name: "Stand Mixer",
    brand: "KitchenAid",
    warranty: { provider: "KitchenAid Support" },
  });
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("product editing submits product and warranty in one request", async () => {
  let submittedBody: unknown;
  const onclose = vi.fn();
  const onsaved = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      submittedBody = await requestBody(init);
      return jsonResponse({ product: { id: productId } });
    }),
  );
  const screen = await render(ProductEditor, {
    product: {
      id: productId,
      name: "Stand Mixer",
      brand: "KitchenAid",
      model: "KSM195",
      category: "Kitchen",
      retailer: "Home Store",
      orderNumber: "ORDER-101",
      purchasedAt: "2026-01-15",
      serialNumbers: ["MIX-101"],
    },
    warranty: {
      id: "33333333-3333-4333-8333-333333333333",
      provider: "KitchenAid",
      endsAt: "2027-01-15",
      lifetime: false,
      claimUrl: null,
      claimPhone: null,
      claimEmail: null,
      eligibilityNotes: null,
      claimDeadline: null,
      submissionMethods: [],
      requiredEvidence: [],
      claimInstructions: [],
    },
    demoMode: true,
    onclose,
    onsaved,
  });

  await screen
    .getByRole("textbox", { name: "Product name" })
    .fill("Artisan Stand Mixer");
  await screen
    .getByRole("textbox", { name: "Provider", exact: true })
    .fill("Extended Care");
  await screen.getByRole("button", { name: "Save record" }).click();

  expect(submittedBody).toMatchObject({
    product: { name: "Artisan Stand Mixer" },
    warranty: { provider: "Extended Care" },
  });
  expect(onsaved).toHaveBeenCalledOnce();
  expect(onclose).toHaveBeenCalledOnce();
  await expectNoSeriousAccessibilityViolations();
});

test("claim creation records the issue before navigating to its workspace", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ claim: { id: claimId } }, 201)),
  );
  const screen = await render(NewClaimPage, {
    data: {
      selectedProductId: productId,
      products: [{ id: productId, brand: "KitchenAid", name: "Stand Mixer" }],
    } as never,
  });

  await screen
    .getByRole("textbox", { name: "What happened? *" })
    .fill("The motor stopped under normal use.");
  await screen.getByRole("button", { name: "Create claim draft" }).click();
  await expect.element(screen.getByText("Claim draft created")).toBeVisible();
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});

test("claim updates expose pending-safe detail and status actions", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(await requestBody(init));
      return jsonResponse({ claim: { id: claimId } });
    }),
  );
  const screen = await render(ClaimManager, {
    claim: {
      id: claimId,
      status: "draft",
      nextAction: "Gather a receipt",
      resolution: null,
    },
    demoMode: true,
  });

  await screen
    .getByRole("textbox", { name: "Next action" })
    .fill("Attach the receipt");
  await screen.getByRole("button", { name: "Save details" }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Claim details saved");
  expect(requests[0]).toMatchObject({
    nextAction: "Attach the receipt",
    resolution: null,
  });

  await screen
    .getByRole("combobox", { name: "Status" })
    .selectOptions("submitted");
  await screen.getByRole("button", { name: "Apply status" }).click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Claim status updated");
  expect(requests[1]).toMatchObject({ status: "submitted" });
  await expectNoSeriousAccessibilityViolations();
  expectMinimumInteractiveTargetSize();
});
