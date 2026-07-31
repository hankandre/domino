<script lang="ts">
  import { Plus } from "lucide-svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import ArchiveControl from "./ArchiveControl.svelte";
  import ImagePanel from "./ImagePanel.svelte";
  import type { ProductDetail, ProductWarranty } from "./types";

  let {
    product,
    warranty,
    demoMode,
    canAttachImage,
    canManageProduct,
    canCreateClaim,
    canEditRecord,
    editing,
    ontoggleedit,
  }: {
    product: ProductDetail;
    warranty?: ProductWarranty;
    demoMode: boolean;
    canAttachImage: boolean;
    canManageProduct: boolean;
    canCreateClaim: boolean;
    canEditRecord: boolean;
    editing: boolean;
    ontoggleedit: () => void;
  } = $props();
</script>

<header
  class="grid gap-6 border-b border-ink pb-7 lg:grid-cols-[minmax(320px,0.8fr)_1.2fr]"
>
  <ImagePanel
    productId={product.id}
    imageUrl={product.imageUrl}
    {demoMode}
    canAttach={canAttachImage}
  />

  <div class="flex flex-col">
    <div class="flex items-start justify-between gap-5">
      <div>
        <div class="mb-3 flex flex-wrap gap-2">
          {#if product.archivedAt}
            <StatusBadge tone="neutral">Archived</StatusBadge>
          {/if}
          <StatusBadge
            tone={product.coverageStatus === "expiring"
              ? "attention"
              : product.coverageStatus === "active"
                ? "success"
                : product.coverageStatus === "lifetime"
                  ? "info"
                  : "neutral"}
          >
            {product.coverageStatus === "expiring"
              ? "Expiring soon"
              : product.coverageStatus === "active"
                ? "Coverage active"
                : product.coverageStatus === "lifetime"
                  ? "Lifetime coverage"
                  : product.coverageStatus === "expired"
                    ? "Coverage expired"
                    : "Coverage not recorded"}
          </StatusBadge>
          {#if product.activeClaim}
            <StatusBadge
              tone={product.activeClaim.status === "needs_evidence"
                ? "danger"
                : "info"}
            >
              {product.activeClaim.status === "needs_evidence"
                ? "Evidence needed"
                : "Claim in review"}
            </StatusBadge>
          {/if}
        </div>
        <p class="text-xs font-bold tracking-[0.07em] text-muted uppercase">
          {product.brand}
        </p>
        <h1
          class="mt-2 max-w-3xl text-[clamp(2.2rem,5vw,4.5rem)] leading-[0.92] font-bold tracking-[-0.04em]"
        >
          {product.name}
        </h1>
        <p class="mt-3 text-lg text-muted">
          {[product.model, product.category].filter(Boolean).join(" · ") ||
            "Product details not recorded"}
        </p>
      </div>
      {#if canManageProduct}
        <ArchiveControl
          productId={product.id}
          productName={product.name}
          archived={Boolean(product.archivedAt)}
        />
      {/if}
    </div>

    <dl class="mt-7 grid grid-cols-2 border-y border-rule sm:grid-cols-4">
      <div class="border-r border-rule py-4 pr-3">
        <dt
          class="text-[0.66rem] font-bold tracking-[0.055em] text-muted uppercase"
        >
          Coverage ends
        </dt>
        <dd class="mt-1.5 text-sm font-bold">
          {warranty?.lifetime
            ? "Lifetime"
            : product.warrantyEndsAt
              ? new Date(
                  `${product.warrantyEndsAt}T00:00:00`,
                ).toLocaleDateString()
              : "Not recorded"}
        </dd>
      </div>
      <div class="border-r border-rule py-4 px-3">
        <dt
          class="text-[0.66rem] font-bold tracking-[0.055em] text-muted uppercase"
        >
          Purchased
        </dt>
        <dd class="mt-1.5 text-sm font-bold">
          {product.purchasedAt
            ? new Date(`${product.purchasedAt}T00:00:00`).toLocaleDateString()
            : "Not recorded"}
        </dd>
      </div>
      <div class="border-r border-rule py-4 px-3">
        <dt
          class="text-[0.66rem] font-bold tracking-[0.055em] text-muted uppercase"
        >
          Serial
        </dt>
        <dd class="mt-1.5 truncate text-sm font-bold">
          {product.serialNumbers[0] || "Not recorded"}
        </dd>
      </div>
      <div class="py-4 pl-3">
        <dt
          class="text-[0.66rem] font-bold tracking-[0.055em] text-muted uppercase"
        >
          Retailer
        </dt>
        <dd class="mt-1.5 text-sm font-bold">
          {product.retailer || "Not recorded"}
        </dd>
      </div>
    </dl>

    <div class="mt-auto flex flex-wrap gap-2 pt-6">
      {#if canCreateClaim}
        <a
          href={`/claims/new?product=${product.id}`}
          class="inline-flex min-h-12 items-center gap-2 bg-ink px-5 text-sm font-bold text-white hover:bg-orange"
        >
          <Plus size={17} /> Start a claim
        </a>
      {/if}
      {#if canEditRecord}
        <button
          id="product-edit-toggle"
          class="inline-flex min-h-12 items-center gap-2 border border-rule bg-sheet px-5 text-sm font-bold hover:border-ink"
          aria-expanded={editing}
          onclick={ontoggleedit}
        >
          {editing ? "Close editor" : "Edit record"}
        </button>
      {/if}
    </div>
  </div>
</header>
