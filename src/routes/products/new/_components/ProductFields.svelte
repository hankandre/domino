<fieldset>
  <legend class="text-xl font-bold tracking-[-0.025em]">Product details</legend>
  <div class="mt-4 grid gap-4 sm:grid-cols-2">
    <label class="sm:col-span-2">
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Product name *</span
      >
      <input
        name="name"
        required
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="800 Series Dishwasher"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Brand</span
      >
      <input
        name="brand"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="Bosch"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Model</span
      >
      <input
        name="model"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="SHPM88Z75N"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Category</span
      >
      <input
        name="category"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="Kitchen appliance"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Serial number</span
      >
      <input
        name="serial"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="FD9407 00234"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Retailer</span
      >
      <input
        name="retailer"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="Home Depot"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Purchase date</span
      >
      <input
        name="purchaseDate"
        type="date"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Purchase price</span
      >
      <input
        name="purchasePrice"
        inputmode="decimal"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="$0.00"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Order or invoice number</span
      >
      <input
        name="orderNumber"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
      />
    </label>
    <label class="sm:col-span-2">
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Initial notes</span
      >
      <textarea
        name="notes"
        class="mt-2 min-h-24 w-full border border-rule bg-sheet p-3 outline-none focus:border-ink"
        placeholder="Registration details, setup history, condition, or anything the household should retain."
      ></textarea>
    </label>
  </div>
</fieldset>
