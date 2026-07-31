<script lang="ts">
  import { ArrowLeft, Check, FilePlus2, ShieldCheck } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";
  import { uploadDocument } from "$lib/uploads";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  let { data } = $props();
  let submitted = $state(false);
  let saving = $state(false);
  let errorMessage = $state("");
  let createdClaimId = $state("");

  async function saveClaim(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    errorMessage = "";
    try {
      const form = new FormData(event.currentTarget as HTMLFormElement);
      const productId = String(form.get("productId"));
      const noticedAt = String(form.get("noticedAt") ?? "");
      const preferredResolution = String(
        form.get("preferredResolution") ?? "",
      );
      const response = await dominoApi.api.v1.products[":id"].claims.$post({
        param: { id: productId },
        json: {
          issue: String(form.get("issue") ?? ""),
          noticedAt: noticedAt || undefined,
          preferredResolution: preferredResolution || undefined,
          nextAction: "Review the claim guide and gather required evidence",
        },
      });
      if (!response.ok) {
        errorMessage = await responseError(
          response,
          "The claim could not be created.",
        );
        return;
      }
      const result = (await response.json()) as { claim: { id: string } };
      submitted = true;
      createdClaimId = result.claim.id;
      const evidence = form
        .getAll("evidence")
        .filter(
          (entry): entry is File => entry instanceof File && entry.size > 0,
        );
      for (const file of evidence) {
        const uploadResponse = await uploadDocument(file, {
          claimId: result.claim.id,
          productId,
          kind: "claim",
        });
        if (!uploadResponse.ok) {
          const detail = await responseError(uploadResponse, "upload failed");
          errorMessage = `The claim was created, but ${file.name} could not be attached: ${detail}`;
          return;
        }
      }
      await goto(`/claims/${result.claim.id}`);
    } catch (cause) {
      errorMessage = networkError(
        cause,
        createdClaimId
          ? "The claim was created, but evidence could not be attached."
          : "The claim could not be created.",
      );
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>New claim · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/claims"
    class="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
    ><ArrowLeft size={17} /> Claims</a
  >
  <PageHeader
    kicker="Claim setup"
    title="Start a claim"
    description="Record the problem first. Domino will keep evidence, contact attempts, and status changes in one trail."
  />
  {#if submitted}<div
      class="mt-6 flex gap-3 bg-green-soft p-4 text-green"
      role="status"
    >
      <Check size={19} />
      <div>
        <div class="font-bold">Claim draft created</div>
        {#if createdClaimId}<a
            href={`/claims/${createdClaimId}`}
            class="mt-1 inline-block text-sm font-bold underline">Open claim</a
          >{/if}
      </div>
    </div>{/if}
  {#if errorMessage}<div
      class="mt-6 border border-red bg-red-soft p-4 text-sm text-red"
      role="alert"
    >
      {errorMessage}
    </div>{/if}
  <form method="GET" class="mt-8 flex flex-wrap gap-2">
    <label class="min-w-0 flex-1">
      <span class="sr-only">Search all products</span>
      <input
        type="search"
        name="q"
        value={data.productSearch?.query ?? ""}
        placeholder="Find a product by name, model, serial, order, or date"
        class="min-h-12 w-full border border-rule bg-sheet px-3"
      />
    </label>
    <button
      type="submit"
      class="min-h-12 bg-ink px-5 text-sm font-bold text-white hover:bg-orange"
      >Search products</button
    >
  </form>
  <form class="mt-8 space-y-6" onsubmit={saveClaim}>
    <label class="block"
      ><span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Product *</span
      ><select
        name="productId"
        required
        value={data.selectedProductId ?? ""}
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3"
        ><option value="" disabled>Select a product</option
        >{#each data.products as product}<option value={product.id}
            >{product.brand} {product.name}</option
          >{/each}</select
      ></label
    >
    <Pagination
      page={data.productSearch?.page ?? 1}
      previousHref={data.productSearch?.previousHref ?? null}
      nextHref={data.productSearch?.nextHref ?? null}
      label="claim product options"
    />
    <label class="block"
      ><span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >What happened? *</span
      ><textarea
        name="issue"
        required
        class="mt-2 min-h-32 w-full border border-rule bg-sheet p-3 leading-relaxed"
        placeholder="Describe the failure, when it started, and any troubleshooting already attempted."
      ></textarea></label
    >
    <div class="grid gap-4 sm:grid-cols-2">
      <label
        ><span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Date noticed</span
        ><input
          name="noticedAt"
          type="date"
          class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3"
        /></label
      ><label
        ><span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Preferred resolution</span
        ><select
          name="preferredResolution"
          class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3"
          ><option value="repair">Repair</option><option value="replacement"
            >Replacement</option
          ><option value="refund">Refund</option><option value="not_sure"
            >Not sure</option
          ></select
        ></label
      >
    </div>
    <label
      class="flex min-h-28 cursor-pointer items-center justify-center gap-3 border border-dashed border-muted/60 bg-sheet text-sm font-bold hover:border-ink"
      ><FilePlus2 size={19} /> Attach photos or evidence<input
        name="evidence"
        type="file"
        class="sr-only"
        multiple
        accept="image/*,.pdf"
      /></label
    >
    <div class="flex items-start gap-3 bg-blue-soft p-4 text-blue-ink">
      <ShieldCheck size={19} class="shrink-0" />
      <p class="text-sm leading-relaxed">
        Starting a draft does not contact the manufacturer. Domino will show the
        product’s instructions and required evidence before submission.
      </p>
    </div>
    <div class="flex justify-end border-t border-ink pt-5">
      <button
        disabled={saving}
        class="min-h-12 bg-ink px-6 text-sm font-bold text-white hover:bg-orange disabled:opacity-50"
        >{saving ? "Creating…" : "Create claim draft"}</button
      >
    </div>
  </form>
</div>
