<script lang="ts">
  import { ExternalLink, FileText, ReceiptText } from "lucide-svelte";

  export type DocumentRowItem = {
    id: string;
    name: string;
    kind: string;
    backend: string;
    processingStatus?: string | null;
    sizeBytes?: number | null;
    paperlessUrl?: string | null;
  };

  let {
    document,
    showSize = false,
  }: { document: DocumentRowItem; showSize?: boolean } = $props();

  const href = $derived(
    document.backend === "paperless"
      ? document.paperlessUrl
      : `/api/v1/documents/${document.id}/content`,
  );
  const storageLabel = $derived(
    document.backend === "paperless" ? "Paperless-ngx" : "Domino storage",
  );
  const sizeLabel = $derived(
    document.sizeBytes
      ? `${Math.ceil(document.sizeBytes / 1024)} KB`
      : "Size pending",
  );
</script>

{#snippet content()}
  <span class="grid size-10 shrink-0 place-items-center bg-blue-soft text-blue-ink">
    {#if document.kind === "receipt"}
      <ReceiptText size={19} aria-hidden="true" />
    {:else}
      <FileText size={19} aria-hidden="true" />
    {/if}
  </span>
  <span class="min-w-0">
    <span class="block break-words text-sm font-bold" title={document.name}
      >{document.name}</span
    >
    <span class="mt-1 block text-xs text-muted">
      {document.kind}
      {#if showSize} · {sizeLabel}{/if}
      · {storageLabel}
    </span>
  </span>
  {#if href}
    <ExternalLink size={16} class="shrink-0 text-muted" aria-hidden="true" />
  {:else}
    <span class="shrink-0 text-xs font-bold text-muted">
      {document.processingStatus ?? "Pending"}
    </span>
  {/if}
{/snippet}

{#if href}
  <a
    {href}
    target="_blank"
    rel="noreferrer"
    class="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-3 hover:bg-blue-soft/45"
    aria-label={`Open ${document.name}`}
  >
    {@render content()}
  </a>
{:else}
  <div
    class="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-3"
  >
    {@render content()}
  </div>
{/if}
