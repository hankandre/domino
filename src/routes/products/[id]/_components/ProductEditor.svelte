<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";
  import {
    cleanClaimInstructions,
    cleanRequiredEvidence,
    type ClaimInstruction,
    type RequiredEvidence,
    type SubmissionMethod,
  } from "$lib/claim-guidance";
  import ProductFields from "./ProductFields.svelte";
  import WarrantyEditor from "./WarrantyEditor.svelte";

  type Product = {
    id: string;
    name: string;
    brand: string;
    model: string;
    category: string;
    retailer: string;
    orderNumber: string;
    purchasedAt: string;
    serialNumbers: string[];
  };

  type Warranty = {
    id: string;
    provider: string | null;
    endsAt: string | null;
    lifetime: boolean;
    claimUrl: string | null;
    claimPhone: string | null;
    claimEmail: string | null;
    eligibilityNotes: string | null;
    claimDeadline: string | null;
    submissionMethods: SubmissionMethod[];
    requiredEvidence: RequiredEvidence[];
    claimInstructions: ClaimInstruction[];
  };

  let {
    product,
    warranty,
    demoMode,
    onclose,
    onsaved,
  }: {
    product: Product;
    warranty?: Warranty;
    demoMode: boolean;
    onclose: () => void;
    onsaved: () => void;
  } = $props();

  const initialProduct = () => product;
  const initialWarranty = () => warranty;
  let name = $state(initialProduct().name);
  let brand = $state(initialProduct().brand);
  let model = $state(initialProduct().model);
  let category = $state(initialProduct().category);
  let retailer = $state(initialProduct().retailer);
  let orderNumber = $state(initialProduct().orderNumber);
  let purchaseDate = $state(initialProduct().purchasedAt);
  let serials = $state(initialProduct().serialNumbers.join("\n"));
  let provider = $state(initialWarranty()?.provider ?? "");
  let warrantyEnds = $state(initialWarranty()?.endsAt ?? "");
  let lifetime = $state(initialWarranty()?.lifetime ?? false);
  let claimUrl = $state(initialWarranty()?.claimUrl ?? "");
  let claimPhone = $state(initialWarranty()?.claimPhone ?? "");
  let claimEmail = $state(initialWarranty()?.claimEmail ?? "");
  let eligibilityNotes = $state(initialWarranty()?.eligibilityNotes ?? "");
  let claimDeadline = $state(initialWarranty()?.claimDeadline ?? "");
  let submissionMethods = $state<SubmissionMethod[]>([
    ...(initialWarranty()?.submissionMethods ?? []),
  ]);
  let requiredEvidence = $state<RequiredEvidence[]>(
    (initialWarranty()?.requiredEvidence ?? []).map((item) => ({ ...item })),
  );
  let claimInstructions = $state<ClaimInstruction[]>(
    (initialWarranty()?.claimInstructions ?? []).map((instruction) => ({
      ...instruction,
      detail: instruction.detail ?? "",
    })),
  );
  let pending = $state(false);
  let error = $state("");

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    const evidence = cleanRequiredEvidence(requiredEvidence);
    const instructions = cleanClaimInstructions(claimInstructions);
    const shouldSaveWarranty =
      Boolean(warranty) ||
      lifetime ||
      Boolean(
        provider.trim() ||
        warrantyEnds ||
        claimUrl.trim() ||
        claimPhone.trim() ||
        claimEmail.trim() ||
        eligibilityNotes.trim() ||
        claimDeadline ||
        submissionMethods.length ||
        evidence.length ||
        instructions.length,
      );

    pending = true;
    error = "";
    try {
      const response = await dominoApi.api.v1.products[":id"].record.$patch({
        param: { id: product.id },
        json: {
          product: {
            name: name.trim(),
            brand: brand.trim(),
            model: model.trim(),
            category: category.trim(),
            retailer: retailer.trim(),
            orderNumber: orderNumber.trim(),
            purchaseDate: purchaseDate || null,
            serialNumbers: serials
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean),
          },
          warranty: shouldSaveWarranty
            ? {
                id: warranty?.id,
                provider: provider.trim(),
                endsAt: lifetime ? null : warrantyEnds || null,
                lifetime,
                claimUrl: claimUrl.trim() || null,
                claimPhone: claimPhone.trim() || null,
                claimEmail: claimEmail.trim() || null,
                eligibilityNotes: eligibilityNotes.trim() || null,
                claimDeadline: claimDeadline || null,
                submissionMethods,
                requiredEvidence: evidence,
                claimInstructions: instructions,
              }
            : undefined,
        },
      });
      if (!response.ok) {
        error = await responseError(
          response,
          "The product record could not be updated.",
        );
        return;
      }
      if (!demoMode) await invalidateAll();
      onsaved();
      onclose();
    } catch (cause) {
      error = networkError(cause, "The product record could not be updated.");
    } finally {
      pending = false;
    }
  }
</script>

<section
  aria-labelledby="edit-record-heading"
  class="mt-6 border border-ink bg-sheet p-5 sm:p-6"
>
  <form onsubmit={save}>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
          Household record
        </p>
        <h2
          id="edit-record-heading"
          class="mt-1 text-2xl font-bold tracking-[-0.03em]"
        >
          Edit product and coverage
        </h2>
      </div>
      <button
        type="button"
        disabled={pending}
        class="min-h-11 px-3 text-xs font-bold text-muted hover:text-ink"
        onclick={onclose}>Cancel</button
      >
    </div>

    {#if error}
      <div
        role="alert"
        class="mt-5 border border-orange/50 bg-orange-soft px-4 py-3 text-sm font-semibold text-orange-ink"
      >
        {error}
      </div>
    {/if}

    <ProductFields
      bind:name
      bind:brand
      bind:model
      bind:category
      bind:retailer
      bind:purchaseDate
      bind:orderNumber
      bind:serials
    />

    <WarrantyEditor
      bind:provider
      bind:warrantyEnds
      bind:lifetime
      bind:claimPhone
      bind:claimUrl
      bind:claimEmail
      bind:claimDeadline
      bind:eligibilityNotes
      bind:submissionMethods
      bind:requiredEvidence
      bind:claimInstructions
    />

    <div class="mt-6 flex justify-end">
      <button
        class="min-h-11 bg-ink px-5 text-sm font-bold text-white hover:bg-orange disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!name.trim() || pending}
      >
        {pending ? "Saving…" : "Save record"}
      </button>
    </div>
  </form>
</section>
