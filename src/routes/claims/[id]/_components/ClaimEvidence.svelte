<script lang="ts">
  import { FilePlus2 } from "lucide-svelte";
  import { invalidateAll } from "$app/navigation";
  import { networkError, responseError } from "$lib/api-errors";
  import { uploadDocument } from "$lib/uploads";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
  import DocumentRow from "$lib/components/DocumentRow.svelte";
  import type { ClaimDocument } from "./types";

  let {
    claimId,
    productId,
    documents,
    canAttach,
    demoMode,
  }: {
    claimId: string;
    productId: string;
    documents: ClaimDocument[];
    canAttach: boolean;
    demoMode: boolean;
  } = $props();

  let uploading = $state(false);
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
        claimId,
        productId,
        kind: "claim",
      });
      if (!response.ok) {
        error = await responseError(
          response,
          "The evidence could not be attached.",
        );
        return;
      }
      message = "Evidence attached.";
      if (!demoMode) await invalidateAll();
    } catch (cause) {
      error = networkError(cause, "The evidence could not be attached.");
    } finally {
      uploading = false;
      input.value = "";
    }
  }
</script>

<section aria-labelledby="evidence-heading">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h2 id="evidence-heading" class="text-xl font-bold">
        Evidence and documents
      </h2>
      <p class="mt-1 text-sm text-muted">
        Files attached here remain associated with this claim.
      </p>
    </div>
    {#if canAttach}
      <label
        class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink"
      >
        <FilePlus2 size={15} />
        {uploading ? "Uploading…" : "Attach evidence"}
        <input
          type="file"
          class="sr-only"
          accept="image/*,.pdf"
          disabled={uploading}
          onchange={attach}
        />
      </label>
    {/if}
  </div>

  {#if error}
    <div class="mt-4"><AsyncNotice tone="error">{error}</AsyncNotice></div>
  {/if}
  {#if message}
    <div class="mt-4"><AsyncNotice tone="success">{message}</AsyncNotice></div>
  {/if}

  {#if documents.length}
    <div class="mt-4 border-t border-ink">
      {#each documents as document}
        <DocumentRow {document} />
      {/each}
    </div>
  {:else}
    <div
      class="mt-4 border border-dashed border-muted/50 bg-sheet p-5 text-sm text-muted"
    >
      No evidence is attached yet.
    </div>
  {/if}
</section>
