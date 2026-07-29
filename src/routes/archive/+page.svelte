<script lang="ts">
  import { Archive } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import ProductCard from "$lib/components/ProductCard.svelte";
  let { data } = $props();
</script>

<svelte:head><title>Archive · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <PageHeader
    kicker="Kept for reference"
    title="Archive"
    description="Expired or retired products stay searchable without crowding the active household inventory."
  />
  {#if data.products.length}
    <div class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each data.products as product (product.id)}<ProductCard
          {product}
        />{/each}
    </div>
  {:else}
    <div
      class="mt-8 grid min-h-72 place-items-center border border-dashed border-muted/60 bg-sheet text-center"
    >
      <div>
        <Archive size={30} class="mx-auto text-muted" />
        <h2 class="mt-4 text-lg font-bold">The archive is empty</h2>
        <p class="mt-1 text-sm text-muted">
          Archived products will remain available here.
        </p>
      </div>
    </div>
  {/if}
</div>
