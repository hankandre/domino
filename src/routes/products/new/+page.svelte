<script lang="ts">
  import {
    ArrowLeft,
    Check,
    ImagePlus,
    Link,
    Search,
    Upload,
  } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { dominoApi } from "$lib/api-client";
  import PageHeader from "$lib/components/PageHeader.svelte";

  let { data } = $props();
  let imageMode = $state<"upload" | "fetch">("fetch");
  let submitted = $state(false);
  let saving = $state(false);
  let errorMessage = $state("");
  let productUrl = $state("");
  let selectedImageUrl = $state("");
  let findingImage = $state(false);
  let createdProductId = $state("");

  function field(form: FormData, name: string) {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  }

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
      errorMessage = "Enter the product page URL first.";
      return;
    }
    findingImage = true;
    const response = await dominoApi.api.v1["image-suggestions"].$post({
      json: { productUrl },
    });
    const result = await response.json();
    findingImage = false;
    if (!response.ok || !("suggestions" in result)) {
      errorMessage = apiError(result, "No image could be suggested.");
      return;
    }
    selectedImageUrl = result.suggestions?.[0]?.url ?? "";
    if (!selectedImageUrl)
      errorMessage = "That product page does not advertise a product image.";
  }

  async function saveProduct(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    errorMessage = "";
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const price = field(form, "purchasePrice").replaceAll(/[^0-9.]/g, "");
    const response = await dominoApi.api.v1.products.$post({
      json: {
        name: field(form, "name"),
        brand: field(form, "brand") || undefined,
        model: field(form, "model") || undefined,
        category: field(form, "category") || undefined,
        serialNumbers: field(form, "serial") ? [field(form, "serial")] : [],
        retailer: field(form, "retailer") || undefined,
        orderNumber: field(form, "orderNumber") || undefined,
        purchaseDate: field(form, "purchaseDate") || undefined,
        purchasePriceMinor: price ? Math.round(Number(price) * 100) : undefined,
        productUrl: field(form, "productUrl") || undefined,
        warranty: {
          startsAt: field(form, "coverageStarts") || undefined,
          endsAt:
            field(form, "lifetime") === "on"
              ? null
              : field(form, "coverageEnds") || undefined,
          lifetime: field(form, "lifetime") === "on",
          provider: field(form, "provider") || undefined,
          claimUrl: field(form, "claimUrl") || undefined,
          claimPhone: field(form, "claimPhone") || undefined,
          claimEmail: field(form, "claimEmail") || undefined,
          eligibilityNotes: field(form, "eligibilityNotes") || undefined,
          claimDeadline: field(form, "claimDeadline") || undefined,
          claimInstructions: field(form, "claimInstructions")
            .split("\n")
            .map((title) => title.trim())
            .filter(Boolean)
            .map((title) => ({ title, required: true })),
        },
        notes: field(form, "notes") || undefined,
      },
    });
    const result = await response.json();
    if (!response.ok || !("product" in result)) {
      errorMessage = apiError(result, "The product could not be saved.");
      saving = false;
      return;
    }
    const productId = result.product.id;
    if (data.demoMode) {
      submitted = true;
      createdProductId = productId;
      saving = false;
      return;
    }

    const files = form
      .getAll("documents")
      .filter(
        (entry): entry is File => entry instanceof File && entry.size > 0,
      );
    const documentKind = String(form.get("documentKind") || "other");
    for (const file of files) {
      const upload = new FormData();
      upload.set("file", file);
      upload.set("productId", productId);
      upload.set("kind", documentKind);
      const uploadResponse = await fetch("/api/v1/documents", {
        method: "POST",
        body: upload,
      });
      if (!uploadResponse.ok) {
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        errorMessage = `The product was created, but ${file.name} could not be attached: ${uploadResult.error ?? "upload failed"}`;
        submitted = true;
        createdProductId = productId;
        saving = false;
        return;
      }
    }
    const uploadedImage = form.get("productImage");
    if (uploadedImage instanceof File && uploadedImage.size > 0) {
      const imageBody = new FormData();
      imageBody.set("file", uploadedImage);
      const imageResponse = await fetch(
        `/api/v1/products/${productId}/images`,
        { method: "POST", body: imageBody },
      );
      if (!imageResponse.ok) {
        const imageResult = await imageResponse.json().catch(() => ({}));
        errorMessage = `The product was created, but its image could not be saved: ${imageResult.error ?? "upload failed"}`;
        submitted = true;
        createdProductId = productId;
        saving = false;
        return;
      }
    } else if (selectedImageUrl) {
      const imageResponse = await dominoApi.api.v1.products[":id"].images[
        "from-url"
      ].$post({
        param: { id: productId },
        json: { imageUrl: selectedImageUrl },
      });
      if (!imageResponse.ok) {
        const imageResult = await imageResponse.json().catch(() => ({}));
        errorMessage = `The product was created, but its suggested image could not be saved: ${apiError(imageResult, "download failed")}`;
        submitted = true;
        createdProductId = productId;
        saving = false;
        return;
      }
    }
    submitted = true;
    createdProductId = productId;
    await goto(`/products/${productId}`);
  }
</script>

<div
  class="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/"
    class="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
  >
    <ArrowLeft size={17} /> Household inventory
  </a>
  <PageHeader
    kicker="New household record"
    title="Add a product"
    description="Start with what you know. Coverage, files, claim instructions, and an image can all be completed later."
  />

  {#if submitted}
    <div
      class="mt-8 flex items-start gap-3 border border-green/30 bg-green-soft p-4 text-green"
      role="status"
    >
      <span class="grid size-8 shrink-0 place-items-center bg-green text-white"
        ><Check size={17} /></span
      >
      <div>
        <div class="font-bold">Product saved</div>
        <p class="mt-1 text-sm">
          The household record is ready. Any attachment problem is shown below.
        </p>
      </div>
      {#if createdProductId && !data.demoMode}
        <a
          href={`/products/${createdProductId}`}
          class="ml-auto text-sm font-bold underline">Open record</a
        >
      {/if}
    </div>
  {/if}

  {#if errorMessage}<div
      class="mt-6 border border-red bg-red-soft p-4 text-sm text-red"
      role="alert"
    >
      {errorMessage}
    </div>{/if}
  <form class="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]" onsubmit={saveProduct}>
    <div class="space-y-8">
      <fieldset>
        <legend class="text-xl font-bold tracking-[-0.025em]"
          >Product details</legend
        >
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <label class="sm:col-span-2">
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
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
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Brand</span
            >
            <input
              name="brand"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
              placeholder="Bosch"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Model</span
            >
            <input
              name="model"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
              placeholder="SHPM88Z75N"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Category</span
            >
            <input
              name="category"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
              placeholder="Kitchen appliance"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Serial number</span
            >
            <input
              name="serial"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
              placeholder="FD9407 00234"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Retailer</span
            >
            <input
              name="retailer"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
              placeholder="Home Depot"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Purchase date</span
            >
            <input
              name="purchaseDate"
              type="date"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
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
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Order or invoice number</span
            >
            <input
              name="orderNumber"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
            />
          </label>
          <label class="sm:col-span-2">
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
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

      <fieldset>
        <legend class="text-xl font-bold tracking-[-0.025em]">Coverage</legend>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Coverage starts</span
            >
            <input
              name="coverageStarts"
              type="date"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Coverage ends</span
            >
            <input
              name="coverageEnds"
              type="date"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
            />
          </label>
          <label
            class="flex min-h-12 items-center gap-3 border border-rule bg-sheet px-3 text-sm font-bold sm:col-span-2"
          >
            <input
              name="lifetime"
              type="checkbox"
              class="size-4 accent-orange"
            />
            Lifetime coverage
          </label>
          <label class="sm:col-span-2">
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Provider</span
            >
            <input
              name="provider"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
              placeholder="Manufacturer or protection plan provider"
            />
          </label>
          <label class="sm:col-span-2">
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Claim or support URL</span
            >
            <input
              name="claimUrl"
              type="url"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
              placeholder="https://…"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Claim phone</span
            >
            <input
              name="claimPhone"
              type="tel"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Claim email</span
            >
            <input
              name="claimEmail"
              type="email"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
            />
          </label>
          <label>
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Claim deadline</span
            >
            <input
              name="claimDeadline"
              type="date"
              class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
            />
          </label>
          <label class="sm:col-span-2">
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Eligibility notes</span
            >
            <textarea
              name="eligibilityNotes"
              class="mt-2 min-h-24 w-full border border-rule bg-sheet p-3 outline-none focus:border-ink"
              placeholder="Exclusions, registration requirements, proof needed, or other coverage conditions."
            ></textarea>
          </label>
          <label class="sm:col-span-2">
            <span
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Claim checklist</span
            >
            <textarea
              name="claimInstructions"
              class="mt-2 min-h-28 w-full border border-rule bg-sheet p-3 outline-none focus:border-ink"
              placeholder="One required step per line, such as: Photograph the serial label"
            ></textarea>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-xl font-bold tracking-[-0.025em]">Documents</legend>
        <p class="mt-1 text-sm text-muted">
          New attachments use the household’s authoritative backend:
          <strong
            >{data.defaultDocumentBackend === "paperless"
              ? "Paperless-ngx"
              : "Domino storage"}</strong
          >.
        </p>
        <label class="mt-4 block">
          <span
            class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >Attachment type</span
          >
          <select
            name="documentKind"
            class="mt-2 min-h-11 w-full border border-rule bg-sheet px-3 text-sm font-bold"
          >
            <option value="receipt">Receipt</option>
            <option value="manual">Manual</option>
            <option value="warranty">Warranty terms</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label
          class="mt-4 flex min-h-28 cursor-pointer items-center justify-center gap-3 border border-dashed border-muted/60 bg-sheet text-sm font-bold hover:border-ink"
        >
          <Upload size={19} /> Attach receipt, manual, or warranty file
          <input
            name="documents"
            type="file"
            class="sr-only"
            multiple
            accept="image/*,.pdf"
          />
        </label>
      </fieldset>
    </div>

    <aside>
      <div class="sticky top-8 space-y-5 border border-ink bg-sheet p-5">
        <div>
          <h2 class="text-lg font-bold tracking-[-0.02em]">Product image</h2>
          <p class="mt-1 text-xs leading-relaxed text-muted">
            Domino only saves a suggested image after you confirm it.
          </p>
        </div>
        <div class="grid grid-cols-2 border border-rule">
          <button
            type="button"
            class="min-h-10 text-xs font-bold"
            class:bg-ink={imageMode === "fetch"}
            class:text-white={imageMode === "fetch"}
            onclick={() => (imageMode = "fetch")}
          >
            Fetch
          </button>
          <button
            type="button"
            class="min-h-10 text-xs font-bold"
            class:bg-ink={imageMode === "upload"}
            class:text-white={imageMode === "upload"}
            onclick={() => (imageMode = "upload")}
          >
            Upload
          </button>
        </div>
        <div
          class="grid aspect-square place-items-center border border-dashed border-muted/60 bg-paper p-5 text-center"
        >
          {#if imageMode === "fetch" && selectedImageUrl}
            <button
              type="button"
              class="h-full w-full"
              aria-label="Confirmed product image"
            >
              <img
                src={selectedImageUrl}
                alt="Suggested product"
                class="h-full w-full object-contain"
                referrerpolicy="no-referrer"
              />
            </button>
          {:else if imageMode === "fetch"}
            <div>
              <Search size={28} class="mx-auto text-muted" />
              <p class="mt-3 text-sm font-bold">Find from product details</p>
              <p class="mt-1 text-xs leading-relaxed text-muted">
                Enter a brand and model, then review the suggestions.
              </p>
              <button
                type="button"
                onclick={findImage}
                disabled={findingImage}
                class="mt-4 min-h-10 border border-rule bg-sheet px-3 text-xs font-bold"
              >
                {findingImage ? "Searching…" : "Search images"}
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
          >{saving ? "Saving…" : "Save product"}</button
        >
        <a
          href="/"
          class="block text-center text-xs font-bold text-muted hover:text-ink"
          >Cancel</a
        >
      </div>
    </aside>
  </form>
</div>
