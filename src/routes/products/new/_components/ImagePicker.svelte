<script lang="ts">
  import { ImagePlus, Link, Search } from "lucide-svelte";
  import { dominoApi } from "$lib/api-client";
  import { networkError } from "$lib/api-errors";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";

  let {
    productUrl = $bindable(),
    selectedImageUrl = $bindable(),
    imageMode = $bindable(),
    saving,
  }: {
    productUrl: string;
    selectedImageUrl: string;
    imageMode: "upload" | "fetch";
    saving: boolean;
  } = $props();

  let finding = $state(false);
  let message = $state("");
  let error = $state("");

  function apiError(value: unknown, fallback: string) {
    if (
      value &&
      typeof value === "object" &&
      "error" in value &&
      typeof value.error === "string"
    ) {
      return value.error;
    }
    return fallback;
  }

  async function findImage() {
    if (!productUrl) {
      error = "Enter the product page URL first.";
      return;
    }
    finding = true;
    message = "";
    error = "";
    try {
      const response = await dominoApi.api.v1["image-suggestions"].$post({
        json: { productUrl },
      });
      const result = await response.json();
      if (!response.ok || !("suggestions" in result)) {
        error = apiError(result, "No image could be suggested.");
        return;
      }
      selectedImageUrl = result.suggestions?.[0]?.url ?? "";
      if (!selectedImageUrl) {
        error = "That product page does not advertise a product image.";
      } else {
        message = "Suggested image ready to review.";
      }
    } catch (cause) {
      error = networkError(cause, "No image could be suggested.");
    } finally {
      finding = false;
    }
  }
</script>

<div class="sticky top-8 space-y-5 border border-ink bg-sheet p-5">
  <div>
    <h2 id="product-image-heading" class="text-lg font-bold tracking-[-0.02em]">
      Product image
    </h2>
    <p class="mt-1 text-xs leading-relaxed text-muted">
      Domino only saves a suggested image after you confirm it.
    </p>
  </div>

  <fieldset aria-labelledby="product-image-heading">
    <legend class="sr-only">Image source</legend>
    <div class="grid grid-cols-2 border border-rule">
      <label
        class={[
          "grid min-h-11 cursor-pointer place-items-center text-xs font-bold",
          imageMode === "fetch" && "bg-ink text-white",
        ]}
      >
        <input
          class="sr-only"
          type="radio"
          name="imageMode"
          value="fetch"
          bind:group={imageMode}
        />
        Fetch
      </label>
      <label
        class={[
          "grid min-h-11 cursor-pointer place-items-center text-xs font-bold",
          imageMode === "upload" && "bg-ink text-white",
        ]}
      >
        <input
          class="sr-only"
          type="radio"
          name="imageMode"
          value="upload"
          bind:group={imageMode}
        />
        Upload
      </label>
    </div>
  </fieldset>

  <div
    class="grid aspect-square place-items-center border border-dashed border-muted/60 bg-paper p-5 text-center"
  >
    {#if imageMode === "fetch" && selectedImageUrl}
      <img
        src={selectedImageUrl}
        alt="Suggested product preview"
        class="h-full w-full object-contain"
        referrerpolicy="no-referrer"
      />
    {:else if imageMode === "fetch"}
      <div>
        <Search size={28} class="mx-auto text-muted" />
        <p class="mt-3 text-sm font-bold">Find from a product page</p>
        <p class="mt-1 text-xs leading-relaxed text-muted">
          Enter the product URL below, then review its advertised image.
        </p>
        <button
          type="button"
          onclick={findImage}
          disabled={finding}
          class="mt-4 min-h-11 border border-rule bg-sheet px-3 text-xs font-bold"
        >
          {finding ? "Searching…" : "Find image"}
        </button>
      </div>
    {:else}
      <label class="cursor-pointer">
        <ImagePlus size={28} class="mx-auto text-muted" />
        <p class="mt-3 text-sm font-bold">Choose an image</p>
        <p class="mt-1 text-xs text-muted">JPG, PNG, or WebP</p>
        <input
          name="productImage"
          type="file"
          accept="image/*"
          class="sr-only"
        />
      </label>
    {/if}
  </div>

  {#if error}
    <AsyncNotice tone="error">{error}</AsyncNotice>
  {/if}
  {#if message}
    <AsyncNotice tone="success">{message}</AsyncNotice>
  {/if}

  <label>
    <span
      class="flex items-center gap-2 text-xs font-bold tracking-[0.055em] text-muted uppercase"
      ><Link size={14} /> Product URL</span
    >
    <input
      name="productUrl"
      bind:value={productUrl}
      type="url"
      class="mt-2 min-h-11 w-full border border-rule px-3 text-sm outline-none focus:border-ink"
      placeholder="https://…"
    />
  </label>
  <button
    type="submit"
    disabled={saving}
    class="min-h-12 w-full bg-ink text-sm font-bold text-white hover:bg-orange disabled:opacity-50"
  >
    {saving ? "Saving…" : "Save product"}
  </button>
  <a
    href="/"
    class="flex min-h-11 items-center justify-center text-center text-xs font-bold text-muted hover:text-ink"
    >Cancel</a
  >
</div>
