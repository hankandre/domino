<script lang="ts">
  import {
    ExternalLink,
    FilePlus2,
    FileText,
    ReceiptText,
    Trash2,
  } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import { invalidateAll } from "$app/navigation";
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";
  import { uploadDocument } from "$lib/uploads";
  let { data } = $props();
  let uploading = $state(false);
  let paperlessQuery = $state("");
  let paperlessResults = $state<Array<{ id: number; title: string }>>([]);
  let searching = $state(false);
  let linkingId = $state<number | null>(null);
  let trashingId = $state<string | null>(null);
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
    try {
      const response = await uploadDocument(file, { kind: documentKind });
      if (!response.ok) {
        errorMessage = await responseError(
          response,
          "The document could not be attached.",
        );
        return;
      }
      message = "Document attached.";
      if (!data.demoMode) await invalidateAll();
    } catch (cause) {
      errorMessage = networkError(cause, "The document could not be attached.");
    } finally {
      uploading = false;
      input.value = "";
    }
  }

  async function searchPaperless() {
    if (!paperlessQuery.trim()) return;
    searching = true;
    message = "";
    errorMessage = "";
    try {
      const response = await dominoApi.api.v1.paperless.search.$get({
        query: { q: paperlessQuery },
      });
      if (!response.ok) {
        paperlessResults = [];
        errorMessage = await responseError(
          response,
          "Paperless search failed.",
        );
        return;
      }
      const result = (await response.json()) as {
        documents: Array<{ id: number; title: string }>;
      };
      paperlessResults = result.documents;
      message = result.documents.length
        ? `${result.documents.length} Paperless document${result.documents.length === 1 ? "" : "s"} found.`
        : "No Paperless documents matched that search.";
    } catch (cause) {
      paperlessResults = [];
      errorMessage = networkError(cause, "Paperless search failed.");
    } finally {
      searching = false;
    }
  }

  async function linkPaperless(id: number) {
    if (linkingId !== null) return;
    linkingId = id;
    message = "";
    errorMessage = "";
    try {
      const response = await dominoApi.api.v1.documents[
        "link-paperless"
      ].$post({
        json: { paperlessDocumentId: id, kind: "other" },
      });
      if (!response.ok) {
        errorMessage = await responseError(
          response,
          "The Paperless document could not be linked.",
        );
        return;
      }
      message = "Paperless document linked.";
      if (!data.demoMode) await invalidateAll();
    } catch (cause) {
      errorMessage = networkError(
        cause,
        "The Paperless document could not be linked.",
      );
    } finally {
      linkingId = null;
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
    if (trashingId !== null) return;
    trashingId = id;
    try {
      const response = await dominoApi.api.v1.documents[":id"].$delete({
        param: { id },
      });
      if (!response.ok) {
        errorMessage = await responseError(
          response,
          "The document could not be removed.",
        );
        return;
      }
      message = "Document removed.";
      if (!data.demoMode) await invalidateAll();
    } catch (cause) {
      errorMessage = networkError(cause, "The document could not be removed.");
    } finally {
      trashingId = null;
    }
  }
</script>

<svelte:head><title>Documents · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <PageHeader
    kicker="Document custody"
    title="Documents"
    description="Manuals, receipts, photos, and terms stay attached to the product that needs them."
  >
    {#if data.canAttachDocuments}
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
    {/if}
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
  {#if data.defaultDocumentBackend === "paperless" && data.canAttachDocuments && data.canDiscoverPaperless}
    <details class="mt-6 border border-rule bg-sheet p-4">
      <summary class="cursor-pointer text-sm font-bold"
        >Link an existing Paperless-ngx document</summary
      >
      <div class="mt-4 flex gap-2">
        <label for="paperless-search" class="sr-only"
          >Search Paperless documents</label
        >
        <input
          id="paperless-search"
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
                disabled={linkingId !== null}
                class="min-h-11 border border-rule px-3 text-xs font-bold"
                >{linkingId === document.id ? "Linking…" : "Link"}</button
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
          class="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-rule py-4 text-left"
        >
          <span
            class="grid size-11 place-items-center bg-blue-soft text-blue-ink"
            >{#if document.kind === "receipt"}<ReceiptText
                size={20}
              />{:else}<FileText size={20} />{/if}</span
          >
          <span class="min-w-0"
            ><span class="block break-words font-bold" title={document.name}
              >{document.name}</span
            ><span class="mt-1 block text-xs text-muted"
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
              class="grid size-11 place-items-center text-muted hover:text-ink"
              aria-label={`Open ${document.name}`}
            >
              <ExternalLink size={17} />
            </a>
          {:else}
            <span class="text-xs font-bold text-muted"
              >{document.processingStatus}</span
            >
          {/if}
          {#if data.canManageDocuments}
            <button
              onclick={() => trashDocument(document.id, document.name)}
              disabled={trashingId !== null}
              class="grid size-11 place-items-center text-muted hover:bg-red-soft hover:text-red"
              aria-label={`Remove ${document.name}`}
            >
              <Trash2 size={16} />
            </button>
          {/if}
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
  <Pagination
    page={data.documentsPage?.page ?? 1}
    previousHref={data.documentsPage?.previousHref ?? null}
    nextHref={data.documentsPage?.nextHref ?? null}
    label="documents"
  />
</div>
