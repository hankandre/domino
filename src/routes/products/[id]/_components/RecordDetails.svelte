<script lang="ts">
  import type { ProductDetail, ProductWarranty } from "./types";

  let {
    product,
    warranty,
  }: { product: ProductDetail; warranty?: ProductWarranty } = $props();
</script>

<section aria-labelledby="details-heading">
  <h2 id="details-heading" class="text-xl font-bold tracking-[-0.025em]">
    Record details
  </h2>
  <dl class="mt-4 border-t border-ink text-sm">
    <div class="grid grid-cols-[120px_1fr] border-b border-rule py-3">
      <dt class="text-muted">Provider</dt>
      <dd class="font-semibold">{warranty?.provider ?? "Not recorded"}</dd>
    </div>
    <div class="grid grid-cols-[120px_1fr] border-b border-rule py-3">
      <dt class="text-muted">Order</dt>
      <dd class="min-w-0 break-words font-semibold">
        {product.orderNumber || "Not recorded"}
      </dd>
    </div>
    <div class="grid grid-cols-[120px_1fr] border-b border-rule py-3">
      <dt class="text-muted">Added</dt>
      <dd class="font-semibold">
        {product.createdAt
          ? new Date(product.createdAt).toLocaleString()
          : "Not recorded"}
      </dd>
    </div>
    <div class="grid grid-cols-[120px_1fr] border-b border-rule py-3">
      <dt class="text-muted">Updated</dt>
      <dd class="font-semibold">
        {product.updatedAt
          ? new Date(product.updatedAt).toLocaleString()
          : "Not recorded"}
      </dd>
    </div>
  </dl>
</section>
