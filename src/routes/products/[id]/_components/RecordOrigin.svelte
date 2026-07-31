<script lang="ts">
  import { Bot, ExternalLink } from "lucide-svelte";
  import type { ProductDetail } from "./types";

  let { product }: { product: ProductDetail } = $props();
</script>

{#if product.createdBy || product.sources?.length}
  <section
    aria-labelledby="record-origin-heading"
    class="mt-5 grid gap-4 border-y border-rule bg-sheet px-4 py-4 sm:grid-cols-[minmax(180px,0.35fr)_1fr] sm:px-5"
  >
    <div>
      <p
        id="record-origin-heading"
        class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
      >
        Record origin
      </p>
      <div class="mt-2 flex items-center gap-2 text-sm font-bold">
        <Bot size={17} class="text-orange" />
        Added by {product.createdBy?.name ?? "Household"}
      </div>
    </div>
    {#if product.sources?.length}
      <div
        class="min-w-0 border-t border-rule pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5"
      >
        <p class="text-xs font-bold text-muted">Sources retained</p>
        <ul class="mt-2 flex flex-wrap gap-2">
          {#each product.sources as source}
            <li>
              {#if source.url}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex min-h-11 max-w-full items-center gap-2 border border-rule bg-paper px-3 text-xs font-bold hover:border-ink"
                >
                  <span class="truncate"
                    >{source.label ??
                      source.externalSystem ??
                      "Source link"}</span
                  >
                  <ExternalLink size={13} class="shrink-0" />
                </a>
              {:else}
                <span
                  class="inline-flex min-h-11 max-w-full items-center border border-rule bg-paper px-3 text-xs font-bold"
                >
                  <span class="truncate"
                    >{source.label ??
                      `${source.externalSystem ?? source.kind}: ${source.externalId ?? "reference"}`}</span
                  >
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </section>
{/if}
