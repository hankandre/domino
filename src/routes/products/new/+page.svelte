<script lang="ts">
  import { ArrowLeft, Check } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { dominoApi } from "$lib/api-client";
  import { networkError, responseError } from "$lib/api-errors";
  import {
    cleanClaimInstructions,
    cleanRequiredEvidence,
    type ClaimInstruction,
    type RequiredEvidence,
    type SubmissionMethod,
  } from "$lib/claim-guidance";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import { uploadDocument, uploadProductImage } from "$lib/uploads";
  import DocumentAttachments from "./_components/DocumentAttachments.svelte";
  import ImagePicker from "./_components/ImagePicker.svelte";
  import ProductFields from "./_components/ProductFields.svelte";
  import WarrantyFields from "./_components/WarrantyFields.svelte";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  let submitted = $state(false);
  let saving = $state(false);
  let errorMessage = $state("");
  let productUrl = $state("");
  let selectedImageUrl = $state("");
  let imageMode = $state<"upload" | "fetch">("fetch");
  let createdProductId = $state("");
  let submissionMethods = $state<SubmissionMethod[]>([]);
  let requiredEvidence = $state<RequiredEvidence[]>([]);
  let claimInstructions = $state<ClaimInstruction[]>([]);

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

  async function saveProduct(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    errorMessage = "";
    try {
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
          purchasePriceMinor: price
            ? Math.round(Number(price) * 100)
            : undefined,
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
            submissionMethods,
            requiredEvidence: cleanRequiredEvidence(requiredEvidence),
            claimInstructions: cleanClaimInstructions(claimInstructions),
          },
          notes: field(form, "notes") || undefined,
        },
      });
      const result = await response.json();
      if (!response.ok || !("product" in result)) {
        errorMessage = apiError(result, "The product could not be saved.");
        return;
      }
      const productId = result.product.id;
      submitted = true;
      createdProductId = productId;
      if (data.demoMode) return;

      const files = form
        .getAll("documents")
        .filter(
          (entry): entry is File => entry instanceof File && entry.size > 0,
        );
      const documentKind = String(form.get("documentKind") || "other");
      for (const file of files) {
        const uploadResponse = await uploadDocument(file, {
          productId,
          kind: documentKind,
        });
        if (!uploadResponse.ok) {
          const detail = await responseError(uploadResponse, "upload failed");
          errorMessage = `The product was created, but ${file.name} could not be attached: ${detail}`;
          return;
        }
      }
      const uploadedImage = form.get("productImage");
      if (
        imageMode === "upload" &&
        uploadedImage instanceof File &&
        uploadedImage.size > 0
      ) {
        const imageResponse = await uploadProductImage(
          uploadedImage,
          productId,
        );
        if (!imageResponse.ok) {
          const detail = await responseError(imageResponse, "upload failed");
          errorMessage = `The product was created, but its image could not be saved: ${detail}`;
          return;
        }
      } else if (imageMode === "fetch" && selectedImageUrl) {
        const imageResponse = await dominoApi.api.v1.products[":id"].images[
          "from-url"
        ].$post({
          param: { id: productId },
          json: { imageUrl: selectedImageUrl },
        });
        if (!imageResponse.ok) {
          const imageResult = await imageResponse.json().catch(() => ({}));
          errorMessage = `The product was created, but its suggested image could not be saved: ${apiError(imageResult, "download failed")}`;
          return;
        }
      }
      await goto(`/products/${productId}`);
    } catch (cause) {
      errorMessage = networkError(
        cause,
        createdProductId
          ? "The product was created, but an attachment could not be saved."
          : "The product could not be saved.",
      );
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Add a product · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/"
    class="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-muted hover:text-ink"
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
      <ProductFields />
      <WarrantyFields
        bind:submissionMethods
        bind:requiredEvidence
        bind:claimInstructions
      />
      <DocumentAttachments backend={data.defaultDocumentBackend} />
    </div>
    <aside>
      <ImagePicker
        bind:productUrl
        bind:selectedImageUrl
        bind:imageMode
        {saving}
      />
    </aside>
  </form>
</div>
