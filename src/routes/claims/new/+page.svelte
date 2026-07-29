<script lang="ts">
  import { ArrowLeft, Check, FilePlus2, ShieldCheck } from "lucide-svelte";
  import { goto } from "$app/navigation";
  import PageHeader from "$lib/components/PageHeader.svelte";
  let { data } = $props();
  let submitted = $state(false);
  let saving = $state(false);
  let errorMessage = $state("");
  let createdClaimId = $state("");

  async function saveClaim(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    errorMessage = "";
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const productId = String(form.get("productId"));
    const response = await fetch(`/api/v1/products/${productId}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        issue: form.get("issue"),
        noticedAt: form.get("noticedAt") || undefined,
        preferredResolution: form.get("preferredResolution") || undefined,
        nextAction: "Review the claim guide and gather required evidence",
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      errorMessage = result.error ?? "The claim could not be created.";
      saving = false;
      return;
    }
    submitted = true;
    createdClaimId = result.claim.id;
    const evidence = form
      .getAll("evidence")
      .filter(
        (entry): entry is File => entry instanceof File && entry.size > 0,
      );
    for (const file of evidence) {
      const body = new FormData();
      body.set("file", file);
      body.set("claimId", result.claim.id);
      body.set("productId", productId);
      body.set("kind", "claim");
      const uploadResponse = await fetch("/api/v1/documents", {
        method: "POST",
        body,
      });
      if (!uploadResponse.ok) {
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        errorMessage = `The claim was created, but ${file.name} could not be attached: ${uploadResult.error ?? "upload failed"}`;
        saving = false;
        return;
      }
    }
    await goto(`/claims/${result.claim.id}`);
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
    <div class="flex items-start gap-3 bg-blue-soft p-4 text-[#294968]">
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
