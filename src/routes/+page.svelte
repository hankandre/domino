<script lang="ts">
  import {
    ArrowRight,
    CalendarClock,
    Plus,
    Search,
    SlidersHorizontal,
    X,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import Pagination from "$lib/components/Pagination.svelte";
  import ProductCard from "$lib/components/ProductCard.svelte";
  let { data } = $props();

  type InventoryFilter =
    "all" | "claims" | "expiring" | "active" | "expired" | "unknown";
  type InventorySort = "newest" | "name" | "warranty";

  const inventoryPage = $derived(
    data.inventoryPage ?? {
      page: 1,
      hasMore: false,
      previousHref: null,
      nextHref: null,
      query: "",
      filter: "all",
      sort: "newest",
      total: data.products.length,
      totalIsExact: true,
    },
  );
  let query = $state("");
  let inventoryFilter = $state<InventoryFilter>("all");
  let inventorySort = $state<InventorySort>("newest");
  let filtersOpen = $state(false);
  let resultAnnouncement = $state("");
  let canCreateProduct = $derived(
    data.actor?.permissions.includes("*") ||
      data.actor?.permissions.includes("products:create") ||
      data.actor?.permissions.includes("warranties:write"),
  );

  const filterLabels: Record<InventoryFilter, string> = {
    all: "All products",
    claims: "Has an open claim",
    expiring: "Expiring soon",
    active: "Covered",
    expired: "Expired",
    unknown: "Coverage missing",
  };

  const appliedQuery = $derived(inventoryPage.query);
  const appliedFilter = $derived(inventoryPage.filter);
  const hasAppliedSearch = $derived(
    Boolean(appliedQuery || appliedFilter !== "all"),
  );

  function inventoryHref(
    nextQuery: string,
    nextFilter: InventoryFilter,
    nextSort: InventorySort,
  ) {
    const parameters = new URLSearchParams();
    if (nextQuery) parameters.set("q", nextQuery);
    if (nextFilter !== "all") parameters.set("filter", nextFilter);
    if (nextSort !== "newest") parameters.set("sort", nextSort);
    const queryString = parameters.toString();
    return queryString ? `/?${queryString}` : "/";
  }

  const clearAppliedFilterHref = $derived(
    inventoryHref(appliedQuery, "all", inventoryPage.sort),
  );
  const clearAppliedQueryHref = $derived(
    inventoryHref("", appliedFilter, inventoryPage.sort),
  );

  const resultDescription = $derived(
    inventoryPage.total === null
      ? `${data.products.length} ${data.products.length === 1 ? "record" : "records"} on this page`
      : `${inventoryPage.total} ${inventoryPage.total === 1 ? "record" : "records"}${appliedQuery ? ` matching “${appliedQuery}”` : ""}`,
  );

  async function clearSearch() {
    query = "";
    if (!appliedQuery) return;
    await goto(clearAppliedQueryHref);
  }

  $effect(() => {
    query = data.inventoryPage?.query ?? "";
    inventoryFilter = data.inventoryPage?.filter ?? "all";
    inventorySort = data.inventoryPage?.sort ?? "newest";
  });

  $effect(() => {
    const description = resultDescription;
    const timer = setTimeout(() => (resultAnnouncement = description), 350);
    return () => clearTimeout(timer);
  });
</script>

<svelte:head><title>Inventory · Domino</title></svelte:head>

{@html "<!-- THESIS: Household coverage is a living dispatch manifest, refusing the generic metric-card dashboard. OWN-WORLD: paper-white sheets, blue-black ink, safety-orange exceptions, thin dividing rules, square controls, and marketplace-like product imagery. STORY: scan the household, see what needs attention, find any record, then move directly into coverage or claim action. FIRST VIEWPORT: a compact command header and universal search lead; two attention links follow; a product-card ledger fills the working surface; Add product sits upper-right. FORM: card-led dispatch ledger, sixth grounded direction, simplified composition C with richer detail from B; seed edd03ff5. -->"}

<div
  class="mx-auto w-full max-w-[1540px] px-4 py-4 sm:px-6 sm:py-6 lg:px-9 lg:py-7"
>
  <header class="border-b border-ink pb-4 sm:pb-5">
    <div class="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div>
        <p
          class="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.07em] text-muted uppercase"
        >
          <span class="inline-block h-px w-7 bg-orange"></span>
          Household inventory · {inventoryPage.total === null
            ? `${data.products.length} on this page`
            : `${inventoryPage.total}${inventoryPage.totalIsExact ? "" : "+"} products`}
        </p>
        <h1
          class="max-w-3xl text-[clamp(1.78rem,3.8vw,3.5rem)] leading-[0.95] font-bold tracking-[-0.04em] text-balance"
        >
          Everything covered. <span class="text-muted">Nothing buried.</span>
        </h1>
      </div>
      {#if canCreateProduct}
        <a
          href="/products/new"
          class="hidden min-h-12 shrink-0 items-center justify-center gap-2 bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-orange lg:inline-flex"
        >
          <Plus size={18} /> Add product
        </a>
      {/if}
    </div>

    <div class="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
      <form
        method="GET"
        class="group flex min-h-12 items-center gap-3 border border-ink bg-sheet px-4 focus-within:shadow-[0_4px_0_var(--color-orange)]"
      >
        <Search
          size={22}
          strokeWidth={1.8}
          class="shrink-0"
          aria-hidden="true"
        />
        <label class="sr-only" for="inventory-search"
          >Search household inventory</label
        >
        <input
          id="inventory-search"
          name="q"
          bind:value={query}
          class="min-h-11 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted/80"
          placeholder="Product, date, serial, retailer, claim…"
          autocomplete="off"
        />
        {#if query}
          <button
            type="button"
            class="relative z-20 grid size-11 shrink-0 place-items-center text-muted hover:text-ink"
            aria-label="Clear search"
            onclick={clearSearch}
          >
            <X size={17} />
          </button>
        {:else}
          <kbd
            class="hidden border border-rule bg-paper px-2 py-1 text-[0.68rem] font-bold text-muted sm:inline-block"
            >/</kbd
          >
        {/if}
        <input type="hidden" name="filter" value={inventoryFilter} />
        <input type="hidden" name="sort" value={inventorySort} />
        <button
          type="submit"
          class="min-h-11 shrink-0 bg-ink px-4 text-xs font-bold text-white hover:bg-orange"
          >Search all</button
        >
      </form>

      <button
        class="flex min-h-11 items-center justify-center gap-2 border border-rule bg-sheet px-5 text-sm font-bold hover:border-ink xl:min-h-12"
        class:border-ink={filtersOpen}
        aria-expanded={filtersOpen}
        aria-controls="inventory-filters"
        onclick={() => (filtersOpen = !filtersOpen)}
      >
        <SlidersHorizontal size={18} /> Filter & sort
      </button>
    </div>
  </header>

  <section
    aria-labelledby="attention-heading"
    class="grid grid-cols-2 border-b border-rule lg:grid-cols-[180px_1fr_1fr]"
  >
    <div
      class="col-span-2 flex items-center border-b border-rule py-3 lg:col-span-1 lg:border-r lg:border-b-0 lg:pr-5"
    >
      <div>
        <p
          id="attention-heading"
          class="text-xs font-bold tracking-[0.07em] text-muted uppercase"
        >
          Needs attention
        </p>
        <p class="mt-1 text-sm font-semibold">
          Claims and coverage need review
        </p>
      </div>
    </div>

    <a
      href="/claims"
      class="group flex min-h-20 items-center gap-3 border-r border-rule py-3 pr-3 text-left hover:bg-orange-soft lg:min-h-20 lg:gap-4 lg:border-b-0 lg:px-5"
    >
      <span
        class="grid size-10 shrink-0 place-items-center bg-orange font-bold text-white lg:size-11"
        >{data.openClaims}</span
      >
      <span class="min-w-0">
        <span
          class="block text-xs font-bold tracking-[0.055em] text-orange-ink uppercase"
          >Open claims</span
        >
        <span class="mt-1 block text-sm leading-tight font-bold lg:text-base"
          >{data.openClaims === 1
            ? "1 claim needs review"
            : `${data.openClaims} claims need review`}</span
        >
      </span>
      <ArrowRight
        class="ml-auto shrink-0 transition-transform group-hover:translate-x-1"
        size={18}
      />
    </a>

    <a
      href="/warranties/expiring"
      class="group flex min-h-20 items-center gap-3 py-3 pl-3 text-left hover:bg-blue-soft lg:min-h-20 lg:gap-4 lg:px-5"
    >
      <span
        class="grid size-10 shrink-0 place-items-center border border-ink bg-sheet lg:size-11"
        ><CalendarClock size={19} /></span
      >
      <span class="min-w-0">
        <span
          class="block text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Expiring soon</span
        >
        <span class="mt-1 block text-sm leading-tight font-bold lg:text-base"
          >{data.expiring} warranties · review window</span
        >
      </span>
      <ArrowRight
        class="ml-auto shrink-0 transition-transform group-hover:translate-x-1"
        size={18}
      />
    </a>
  </section>

  {#if filtersOpen}
    <form
      method="GET"
      id="inventory-filters"
      class="grid gap-5 border-b border-rule bg-sheet px-4 py-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:px-5"
      aria-label="Inventory filters and sorting"
    >
      <input type="hidden" name="q" value={query} />
      <fieldset>
        <legend
          class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Show products</legend
        >
        <div class="mt-3 flex flex-wrap gap-2">
          {#each Object.entries(filterLabels) as [value, label]}
            <label
              class="flex min-h-11 cursor-pointer items-center border px-3 text-sm font-bold transition-colors"
              class:border-ink={inventoryFilter === value}
              class:bg-ink={inventoryFilter === value}
              class:text-white={inventoryFilter === value}
              class:border-rule={inventoryFilter !== value}
              class:bg-paper={inventoryFilter !== value}
            >
              <input
                class="sr-only"
                type="radio"
                name="filter"
                {value}
                bind:group={inventoryFilter}
              />
              {label}
            </label>
          {/each}
        </div>
      </fieldset>

      <label>
        <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Sort by</span
        >
        <select
          bind:value={inventorySort}
          name="sort"
          class="mt-3 min-h-11 w-full border border-rule bg-paper px-3 text-sm font-bold focus:border-ink"
        >
          <option value="newest">Newest purchase</option>
          <option value="name">Product name</option>
          <option value="warranty">Warranty end date</option>
        </select>
      </label>
      <div class="flex items-end sm:col-span-2">
        <button
          type="submit"
          class="min-h-11 bg-ink px-5 text-sm font-bold text-white hover:bg-orange"
          >Apply to all products</button
        >
      </div>
    </form>
  {/if}

  <section class="pt-5" aria-labelledby="inventory-heading">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2
          id="inventory-heading"
          class="text-2xl font-bold tracking-[-0.03em]"
        >
          Household inventory
        </h2>
        <p class="mt-1 text-sm text-muted" aria-hidden="true">
          {resultDescription}
        </p>
        <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {resultAnnouncement}
        </p>
        {#if !inventoryPage.totalIsExact}
          <p class="mt-1 max-w-2xl text-xs text-muted">
            {hasAppliedSearch
              ? "Fuzzy results are ranked from a bounded candidate set. Use a serial, order number, or a narrower name for the best match."
              : "Browse every household record with the page controls below."}
          </p>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if appliedFilter !== "all"}
          <a
            href={clearAppliedFilterHref}
            class="flex min-h-11 items-center gap-2 border border-ink bg-sheet px-3 text-xs font-bold"
            aria-label={`Remove ${filterLabels[appliedFilter]} filter`}
          >
            {filterLabels[appliedFilter]}
            <X size={14} />
          </a>
        {/if}
      </div>
    </div>

    {#if data.products.length}
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {#each data.products as product (product.id)}
          <ProductCard {product} />
        {/each}
      </div>
    {:else if !hasAppliedSearch && inventoryPage.page === 1}
      <div
        class="grid min-h-80 place-items-center border border-dashed border-muted/60 bg-sheet p-8 text-center"
      >
        <div>
          <Plus size={32} class="mx-auto text-muted" strokeWidth={1.4} />
          <h3 class="mt-4 text-xl font-bold">
            {canCreateProduct ? "Add your first product" : "No products yet"}
          </h3>
          <p class="mt-2 max-w-md text-sm leading-relaxed text-muted">
            {canCreateProduct
              ? "Record a purchase now so its coverage, manuals, notes, and claim instructions are ready when you need them."
              : "A household contributor can add the first product when it is ready."}
          </p>
          {#if canCreateProduct}
            <a
              href="/products/new"
              class="mt-5 inline-flex min-h-11 items-center bg-ink px-4 text-sm font-bold text-white hover:bg-orange"
            >
              Add product
            </a>
          {/if}
        </div>
      </div>
    {:else}
      <div
        class="grid min-h-80 place-items-center border border-dashed border-muted/60 bg-sheet p-8 text-center"
      >
        <div>
          <Search size={32} class="mx-auto text-muted" strokeWidth={1.4} />
          <h3 class="mt-4 text-xl font-bold">No matching products</h3>
          <p class="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Try a product name, manufacturer, serial number, retailer, or date
            such as “2025.”
          </p>
          <a
            href="/"
            class="mt-5 inline-flex min-h-11 items-center bg-ink px-4 text-sm font-bold text-white"
          >
            Clear search and filters
          </a>
        </div>
      </div>
    {/if}
    <Pagination
      page={inventoryPage.page}
      previousHref={inventoryPage.previousHref}
      nextHref={inventoryPage.nextHref}
      label="inventory"
    />
  </section>
</div>
