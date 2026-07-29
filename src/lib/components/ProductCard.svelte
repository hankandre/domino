<script lang="ts">
  import {
    Box,
    ChevronRight,
    FileText,
    ImagePlus,
    MessageSquareText,
  } from "lucide-svelte";
  import type { ProductSummary } from "$lib/types";
  import StatusBadge from "./StatusBadge.svelte";

  let { product }: { product: ProductSummary } = $props();

  const claimLabel: Record<string, string> = {
    draft: "Claim draft",
    needs_evidence: "Evidence needed",
    submitted: "Claim submitted",
    in_review: "Claim in review",
    approved: "Claim approved",
    denied: "Claim denied",
    resolved: "Claim resolved",
    closed: "Claim closed",
  };

  function formatDate(date: string | null, fallback = "Not recorded") {
    if (!date) return fallback;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${date}T12:00:00`));
  }
</script>

<article
  class="group flex flex-col overflow-hidden border border-rule bg-sheet shadow-[0_1px_0_rgba(23,32,51,0.04)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-sheet"
>
  <a
    href={`/products/${product.id}`}
    class="relative block aspect-[16/9] overflow-hidden border-b border-rule bg-[#ecebe5]"
    aria-label={`Open ${product.brand} ${product.name}`}
  >
    {#if product.imageUrl}
      <img
        src={product.imageUrl}
        alt=""
        class="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
        loading="lazy"
      />
    {:else}
      <div
        class="relative grid h-full place-items-center overflow-hidden bg-[#e7e9e6] text-ink"
      >
        <div
          class="absolute -right-6 -bottom-10 text-[8.5rem] leading-none font-black tracking-[-0.08em] text-ink/[0.045]"
        >
          {product.brand.slice(0, 2).toUpperCase()}
        </div>
        <div class="relative text-center">
          <span
            class="mx-auto grid size-12 place-items-center border border-ink/25 bg-sheet/75"
          >
            <Box size={22} strokeWidth={1.4} />
          </span>
          <span
            class="mt-2 flex items-center justify-center gap-1.5 text-[0.62rem] font-bold tracking-[0.055em] text-muted uppercase"
          >
            <ImagePlus size={12} /> Image not confirmed
          </span>
        </div>
      </div>
    {/if}
    <div class="absolute top-3 left-3 flex flex-wrap gap-1.5">
      {#if product.coverageStatus === "active"}
        <StatusBadge tone="success">Covered</StatusBadge>
      {:else if product.coverageStatus === "expiring"}
        <StatusBadge tone="attention">Expiring soon</StatusBadge>
      {:else if product.coverageStatus === "lifetime"}
        <StatusBadge tone="info">Lifetime</StatusBadge>
      {:else if product.coverageStatus === "unknown"}
        <StatusBadge tone="neutral">Coverage not recorded</StatusBadge>
      {:else}
        <StatusBadge tone="neutral">Expired</StatusBadge>
      {/if}
      {#if product.activeClaim}
        <StatusBadge
          tone={product.activeClaim.status === "needs_evidence"
            ? "danger"
            : "info"}
        >
          {claimLabel[product.activeClaim.status]}
        </StatusBadge>
      {/if}
    </div>
  </a>

  <div class="flex flex-1 flex-col p-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
          {product.brand}
        </p>
        <h2
          class="mt-1 text-[1.12rem] leading-tight font-bold tracking-[-0.025em]"
        >
          <a href={`/products/${product.id}`} class="hover:text-orange"
            >{product.name}</a
          >
        </h2>
        <p class="mt-1 text-sm text-muted">{product.model}</p>
      </div>
      <ChevronRight
        class="mt-1 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-1"
        size={19}
      />
    </div>

    <dl class="mt-4 grid grid-cols-2 gap-x-4 border-y border-rule py-3 text-sm">
      <div>
        <dt
          class="text-[0.68rem] font-bold tracking-[0.055em] text-muted uppercase"
        >
          Coverage until
        </dt>
        <dd class="mt-1 font-semibold">
          {formatDate(
            product.warrantyEndsAt,
            product.coverageStatus === "lifetime" ? "Lifetime" : "Not recorded",
          )}
        </dd>
      </div>
      <div>
        <dt
          class="text-[0.68rem] font-bold tracking-[0.055em] text-muted uppercase"
        >
          Purchased
        </dt>
        <dd class="mt-1 font-semibold">{formatDate(product.purchasedAt)}</dd>
      </div>
    </dl>

    {#if product.activeClaim}
      <div class="mt-3 bg-orange-soft p-3 text-sm">
        <div class="font-bold text-[#7e2f15]">
          {product.activeClaim.summary}
        </div>
        <div class="mt-1 text-[#7e2f15]/80">
          {product.activeClaim.nextAction}
        </div>
      </div>
    {:else}
      <p class="mt-3 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted">
        {[
          product.serialNumbers[0] ? `Serial ${product.serialNumbers[0]}` : "",
          product.retailer ? `Purchased from ${product.retailer}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Add purchase and identifier details"}
      </p>
    {/if}

    <div
      class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 text-xs font-semibold text-muted"
    >
      <span class="flex items-center gap-1.5"
        ><FileText size={14} /> {product.documents} files</span
      >
      <span class="flex items-center gap-1.5"
        ><MessageSquareText size={14} /> {product.notes} notes</span
      >
      {#if product.activeClaim}
        <a
          href={`/products/${product.id}`}
          class="ml-auto text-muted hover:text-ink">View product</a
        >
        <a
          href={`/claims/${product.activeClaim.id}`}
          class="flex min-h-8 items-center gap-1 bg-ink px-2.5 text-white hover:bg-orange"
        >
          Manage claim <ChevronRight size={13} />
        </a>
      {:else}
        <a
          href={`/products/${product.id}`}
          class="ml-auto text-ink hover:text-orange">View record</a
        >
      {/if}
    </div>
  </div>
</article>
