<script lang="ts">
  import { ChevronRight, CircleAlert } from "lucide-svelte";
  import type { ProductDetail, ProductWarranty } from "./types";

  let {
    product,
    warranty,
  }: { product: ProductDetail; warranty?: ProductWarranty } = $props();
</script>

{#if product.activeClaim}
  <section
    aria-labelledby="claim-heading"
    class="border border-orange/40 bg-sheet"
  >
    <div
      class="flex flex-col gap-4 border-b border-rule p-5 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="flex gap-3">
        <span
          class="grid size-10 shrink-0 place-items-center bg-orange text-white"
          ><CircleAlert size={19} /></span
        >
        <div>
          <p
            class="text-xs font-bold tracking-[0.06em] text-orange-ink uppercase"
          >
            Active claim · {product.activeClaim.reference}
          </p>
          <h2
            id="claim-heading"
            class="mt-1 text-xl font-bold tracking-[-0.02em]"
          >
            {product.activeClaim.summary}
          </h2>
          <p class="mt-1 text-sm text-muted">
            Next: {product.activeClaim.nextAction}
          </p>
        </div>
      </div>
      <a
        href={`/claims/${product.activeClaim.id}`}
        class="inline-flex min-h-11 items-center gap-2 border border-ink px-3 text-xs font-bold hover:bg-ink hover:text-white"
      >
        Manage claim <ChevronRight size={15} />
      </a>
    </div>

    <div class="grid p-5 sm:grid-cols-3">
      <div
        class="border-b border-rule pb-4 sm:border-r sm:border-b-0 sm:pr-4 sm:pb-0"
      >
        <div class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
          Claim status
        </div>
        <div class="mt-1 text-sm font-bold">
          {product.activeClaim.status.replaceAll("_", " ")}
        </div>
      </div>
      <div
        class="border-b border-rule py-4 sm:border-r sm:border-b-0 sm:px-4 sm:py-0"
      >
        <div class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
          Next action
        </div>
        <div class="mt-1 text-sm font-bold">
          {product.activeClaim.nextAction || "Review claim details"}
        </div>
      </div>
      <div class="pt-4 sm:pt-0 sm:pl-4">
        <div class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
          Provider
        </div>
        <div class="mt-1 text-sm font-bold">
          {warranty?.provider || product.brand || "Not recorded"}
        </div>
      </div>
    </div>
  </section>
{/if}
