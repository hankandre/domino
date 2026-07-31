<script lang="ts">
  let {
    name = $bindable(),
    brand = $bindable(),
    model = $bindable(),
    category = $bindable(),
    retailer = $bindable(),
    purchaseDate = $bindable(),
    orderNumber = $bindable(),
    serials = $bindable(),
  }: {
    name: string;
    brand: string;
    model: string;
    category: string;
    retailer: string;
    purchaseDate: string;
    orderNumber: string;
    serials: string;
  } = $props();
</script>

<div class="mt-6 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
  <label class="grid gap-1.5 text-xs font-bold text-muted">
    Product name
    <input
      bind:value={name}
      required
      class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
    />
  </label>
  <label class="grid gap-1.5 text-xs font-bold text-muted">
    Brand
    <input
      bind:value={brand}
      class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
    />
  </label>
  <label class="grid gap-1.5 text-xs font-bold text-muted">
    Model
    <input
      bind:value={model}
      class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
    />
  </label>
  <label class="grid gap-1.5 text-xs font-bold text-muted">
    Category
    <input
      bind:value={category}
      class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
    />
  </label>
  <label class="grid gap-1.5 text-xs font-bold text-muted">
    Retailer
    <input
      bind:value={retailer}
      class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
    />
  </label>
  <label class="grid gap-1.5 text-xs font-bold text-muted">
    Purchase date
    <input
      type="date"
      bind:value={purchaseDate}
      class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
    />
  </label>
  <label class="grid gap-1.5 text-xs font-bold text-muted">
    Order or invoice number
    <input
      bind:value={orderNumber}
      class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
    />
  </label>
  <label class="grid gap-1.5 text-xs font-bold text-muted sm:col-span-2">
    Serial numbers <span class="font-normal">One per line</span>
    <textarea
      bind:value={serials}
      class="min-h-20 border border-rule bg-paper p-3 text-sm font-medium text-ink outline-none focus:border-ink"
    ></textarea>
  </label>
</div>
