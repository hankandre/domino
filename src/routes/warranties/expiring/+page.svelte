<script lang="ts">
  import { ArrowLeft, CalendarClock } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import ProductCard from "$lib/components/ProductCard.svelte";
  let { data } = $props();
  const expiringProducts = $derived(data.products);
</script>

<svelte:head>
  <title>Expiring warranties · Domino</title>
</svelte:head>

<div
  class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/"
    class="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-muted hover:text-ink"
  >
    <ArrowLeft size={17} /> Back to inventory
  </a>

  <PageHeader
    kicker="Coverage desk"
    title="Expiring warranties"
    description="Review coverage that is nearing its end while there is still time to confirm terms, documents, and product condition."
  />

  <section
    class="mt-7 border-y border-rule bg-blue-soft px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-6"
  >
    <div class="flex items-center gap-3">
      <span
        class="grid size-10 shrink-0 place-items-center border border-ink bg-sheet"
      >
        <CalendarClock size={19} />
      </span>
      <div>
        <p class="font-bold">
          {expiringProducts.length} warranties need review on this page
        </p>
        <p class="mt-1 text-sm text-blue-ink">
          Open a product to confirm its terms or update the coverage record.
        </p>
      </div>
    </div>
  </section>

  {#if expiringProducts.length}
    <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {#each expiringProducts as product (product.id)}
        <ProductCard {product} />
      {/each}
    </div>
  {:else}
    <div
      class="mt-6 grid min-h-72 place-items-center border border-dashed border-muted/60 bg-sheet p-8 text-center"
    >
      <div>
        <CalendarClock size={30} class="mx-auto text-green" strokeWidth={1.5} />
        <h2 class="mt-4 text-xl font-bold">No warranties are expiring soon</h2>
        <p class="mt-2 text-sm text-muted">
          Domino will surface coverage here when it enters the review window.
        </p>
      </div>
    </div>
  {/if}
  <Pagination
    page={data.expiringPage?.page ?? 1}
    previousHref={data.expiringPage?.previousHref ?? null}
    nextHref={data.expiringPage?.nextHref ?? null}
    label="expiring warranties"
  />
</div>
