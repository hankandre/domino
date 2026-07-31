<script lang="ts">
  import {
    FilePlus2,
  } from "lucide-svelte";
  import { invalidateAll } from "$app/navigation";
  import { networkError, responseError } from "$lib/api-errors";
  import { uploadDocument } from "$lib/uploads";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
  import DocumentRow from "$lib/components/DocumentRow.svelte";
  import type { ProductDocument } from "./types";

  let {
    productId,
    documents,
    demoMode,
    canAttach,
  }: {
    productId: string;
    documents: ProductDocument[];
    demoMode: boolean;
    canAttach: boolean;
  } = $props();

  let uploading = $state(false);
  let documentKind = $state("manual");
  let message = $state("");
  let error = $state("");

  async function attach(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || uploading) return;
    uploading = true;
    message = "";
    error = "";
    try {
      const response = await uploadDocument(file, {
        productId,
        kind: documentKind,
      });
      if (!response.ok) {
        error = await responseError(
          response,
          "The document could not be attached.",
        );
        return;
      }
      message = "Document attached.";
      if (!demoMode) await invalidateAll();
    } catch (cause) {
      error = networkError(cause, "The document could not be attached.");
    } finally {
      uploading = false;
      input.value = "";
    }
  }
</script>

<section aria-labelledby="documents-heading">
  <div
    class="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"
  >
    <div>
      <h2 id="documents-heading" class="text-2xl font-bold tracking-[-0.03em]">
        Documents
      </h2>
      <p class="mt-1 text-sm text-muted">
        Manuals, receipts, warranty terms, and claim evidence.
      </p>
    </div>
    {#if canAttach}
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <label class="sr-only" for="product-document-kind">Document type</label>
        <select
          id="product-document-kind"
          bind:value={documentKind}
          class="min-h-11 border border-rule bg-sheet px-2 text-xs font-bold"
        >
          <option value="manual">Manual</option>
          <option value="receipt">Receipt</option>
          <option value="warranty">Warranty terms</option>
          <option value="photo">Photo</option>
          <option value="other">Other</option>
        </select>
        <label
          class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink"
        >
          <FilePlus2 size={16} />
          {uploading ? "Uploading…" : "Attach"}
          <input
            type="file"
            class="sr-only"
            accept="image/*,.pdf"
            disabled={uploading}
            onchange={attach}
          />
        </label>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="mb-4"><AsyncNotice tone="error">{error}</AsyncNotice></div>
  {/if}
  {#if message}
    <div class="mb-4"><AsyncNotice tone="success">{message}</AsyncNotice></div>
  {/if}

  <div class="border-t border-ink">
    {#each documents as document}
      <DocumentRow {document} showSize />
    {:else}
      <p class="border-b border-rule py-5 text-sm text-muted">
        No manuals, receipts, or other documents are attached yet.
      </p>
    {/each}
  </div>
</section>
