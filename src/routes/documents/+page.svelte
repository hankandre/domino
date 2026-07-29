<script lang="ts">
  import {
    ExternalLink,
    FilePlus2,
    FileText,
    ReceiptText,
    Trash2,
  } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  let { data } = $props();
  let uploading = $state(false);
  let paperlessQuery = $state("");
  let paperlessResults = $state<Array<{ id: number; title: string }>>([]);
  let searching = $state(false);
  let documentKind = $state("manual");
  let message = $state("");
  let errorMessage = $state("");

  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    message = "";
    errorMessage = "";
    const body = new FormData();
    body.set("file", file);
    body.set("kind", documentKind);
    const response = await fetch("/api/v1/documents", { method: "POST", body });
    uploading = false;
    input.value = "";
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      errorMessage = result.error ?? "The document could not be attached.";
      return;
    }
    message = "Document attached.";
    if (data.demoMode) return;
    location.reload();
  }

  async function searchPaperless() {
    if (!paperlessQuery.trim()) return;
    searching = true;
    const response = await fetch(
      `/api/v1/paperless/search?q=${encodeURIComponent(paperlessQuery)}`,
    );
    const result = await response.json();
    paperlessResults = response.ok ? result.documents : [];
    errorMessage = response.ok
      ? ""
      : (result.error ?? "Paperless search failed.");
    searching = false;
  }

  async function linkPaperless(id: number) {
    const response = await fetch("/api/v1/documents/link-paperless", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paperlessDocumentId: id, kind: "other" }),
    });
    if (response.ok) {
      if (data.demoMode) {
        message = "Paperless document linked.";
        return;
      }
      location.reload();
    } else {
      const result = await response.json().catch(() => ({}));
      errorMessage =
        result.error ?? "The Paperless document could not be linked.";
    }
  }

  async function trashDocument(id: string, name: string) {
    if (
      !confirm(
        `Remove ${name} from Domino? Local files remain recoverable for 30 days.`,
      )
    )
      return;
    message = "";
    errorMessage = "";
    const response = await fetch(`/api/v1/documents/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      errorMessage = result.error ?? "The document could not be removed.";
      return;
    }
    if (data.demoMode) {
      message = "Document removed.";
      return;
    }
    location.reload();
  }
</script>

<div
  class="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <PageHeader
    kicker="Document custody"
    title="Documents"
    description="Manuals, receipts, photos, and terms stay attached to the product that needs them."
  >
    <div class="flex items-center gap-2">
      <label class="sr-only" for="document-kind">Document type</label>
      <select
        id="document-kind"
        bind:value={documentKind}
        class="min-h-11 border border-rule bg-sheet px-3 text-sm font-bold"
      >
        <option value="manual">Manual</option>
        <option value="receipt">Receipt</option>
        <option value="warranty">Warranty terms</option>
        <option value="photo">Photo</option>
        <option value="other">Other</option>
      </select>
      <label
        class="inline-flex min-h-11 cursor-pointer items-center gap-2 bg-ink px-4 text-sm font-bold text-white"
      >
        <FilePlus2 size={17} />
        {uploading ? "Uploading…" : "Attach file"}
        <input
          type="file"
          class="sr-only"
          accept="image/*,.pdf"
          disabled={uploading}
          onchange={upload}
        />
      </label>
    </div>
  </PageHeader>
  {#if errorMessage}<div
      role="alert"
      class="mt-6 border border-red bg-red-soft p-4 text-sm text-red"
    >
      {errorMessage}
    </div>{/if}
  {#if message}<div
      role="status"
      class="mt-6 border border-green/30 bg-green-soft p-4 text-sm text-green"
    >
      {message}
    </div>{/if}
  {#if data.defaultDocumentBackend === "paperless"}
    <details class="mt-6 border border-rule bg-sheet p-4">
      <summary class="cursor-pointer text-sm font-bold"
        >Link an existing Paperless-ngx document</summary
      >
      <div class="mt-4 flex gap-2">
        <input
          bind:value={paperlessQuery}
          placeholder="Search Paperless documents"
          class="min-h-11 min-w-0 flex-1 border border-rule px-3 text-sm"
        />
        <button
          type="button"
          onclick={searchPaperless}
          disabled={searching}
          class="min-h-11 bg-ink px-4 text-xs font-bold text-white"
          >{searching ? "Searching…" : "Search"}</button
        >
      </div>
      {#if paperlessResults.length}
        <div class="mt-3 border-t border-rule">
          {#each paperlessResults as document}
            <div
              class="flex items-center justify-between gap-4 border-b border-rule py-3 text-sm"
            >
              <span class="font-semibold">{document.title}</span>
              <button
                type="button"
                onclick={() => linkPaperless(document.id)}
                class="min-h-9 border border-rule px-3 text-xs font-bold"
                >Link</button
              >
            </div>
          {/each}
        </div>
      {/if}
    </details>
  {/if}
  {#if data.documents.length}
    <div class="mt-7 border-t border-ink">
      {#each data.documents as document}
        <div
          class="group grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-rule py-4 text-left"
        >
          <span
            class="grid size-11 place-items-center bg-blue-soft text-[#294968]"
            >{#if document.kind === "receipt"}<ReceiptText
                size={20}
              />{:else}<FileText size={20} />{/if}</span
          >
          <span
            ><span class="block font-bold">{document.name}</span><span
              class="mt-1 block text-xs text-muted"
              >{document.productId
                ? data.productNames[document.productId]
                : "Household"} · {document.kind} · {document.backend ===
              "paperless"
                ? "Paperless-ngx"
                : "Domino storage"}</span
            ></span
          >
          {#if document.backend !== "paperless" || document.paperlessUrl}
            <a
              href={document.backend === "paperless"
                ? document.paperlessUrl
                : `/api/v1/documents/${document.id}/content`}
              target="_blank"
              rel="noreferrer"
              class="grid size-10 place-items-center text-muted hover:text-ink"
              aria-label={`Open ${document.name}`}
            >
              <ExternalLink size={17} />
            </a>
          {:else}
            <span class="text-xs font-bold text-muted"
              >{document.processingStatus}</span
            >
          {/if}
          <button
            onclick={() => trashDocument(document.id, document.name)}
            class="grid size-10 place-items-center text-muted hover:bg-red-soft hover:text-red"
            aria-label={`Remove ${document.name}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="mt-7 grid min-h-72 place-items-center border border-dashed border-muted/60 bg-sheet p-8 text-center"
    >
      <div>
        <FileText size={30} class="mx-auto text-muted" />
        <h2 class="mt-4 text-lg font-bold">No documents yet</h2>
        <p class="mt-1 text-sm text-muted">
          Attach a manual, receipt, warranty, photo, or claim file.
        </p>
      </div>
    </div>
  {/if}
</div>
