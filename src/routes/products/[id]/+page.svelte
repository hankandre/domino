<script lang="ts">
  import {
    Archive,
    ArrowLeft,
    Bot,
    ChevronRight,
    CircleAlert,
    ExternalLink,
    FilePlus2,
    FileText,
    ImagePlus,
    Phone,
    Plus,
    ReceiptText,
    ShieldCheck,
  } from "lucide-svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import type { PageProps } from "./$types";
  import { untrack } from "svelte";

  let { data }: PageProps = $props();
  const product = untrack(() => data.product) as typeof data.product & {
    createdAt?: string;
    updatedAt?: string;
    notes?: Array<{
      id: string;
      body: string;
      createdAt: string;
      authorName?: string | null;
    }>;
    documents?: Array<{
      id: string;
      name: string;
      kind: string;
      backend: string;
      processingStatus: string;
      sizeBytes: number | null;
      paperlessUrl: string | null;
    }>;
    warranties?: Array<{
      id: string;
      provider: string | null;
      endsAt: string | null;
      lifetime: boolean;
      claimUrl: string | null;
      claimPhone: string | null;
      claimEmail: string | null;
      eligibilityNotes: string | null;
      claimDeadline: string | null;
      claimInstructions: Array<{
        title: string;
        detail?: string;
        required: boolean;
      }>;
    }>;
    createdBy?: { id: string; name: string } | null;
    sources?: Array<{
      id: string;
      kind: string;
      label: string | null;
      url: string | null;
      externalSystem: string | null;
      externalId: string | null;
      addedByName: string | null;
    }>;
  };
  const actorPermissions = untrack(() => data.actor?.permissions ?? []);
  const can = (...permissions: string[]) =>
    actorPermissions.includes("*") ||
    permissions.some((permission) => actorPermissions.includes(permission));
  const canManageProduct = can("products:manage", "warranties:write");
  const canManageWarranty = can("warranties:manage", "warranties:write");
  const canEditRecord =
    canManageProduct && (!product.warranties?.length || canManageWarranty);
  let note = $state("");
  let uploading = $state(false);
  let documentKind = $state("manual");
  let notes = $state(
    (Array.isArray(product.notes) ? product.notes : []).map((item) => ({
      id: item.id,
      author: item.authorName ?? "Household",
      date: new Date(item.createdAt).toLocaleDateString(),
      body: item.body,
    })),
  );
  const documents = Array.isArray(product.documents) ? product.documents : [];
  const warranty = product.warranties?.[0];
  let uploadingImage = $state(false);
  let editing = $state(false);
  let editError = $state("");
  let editName = $state(product.name);
  let editBrand = $state(product.brand);
  let editModel = $state(product.model);
  let editCategory = $state(product.category);
  let editRetailer = $state(product.retailer);
  let editOrderNumber = $state(product.orderNumber);
  let editPurchaseDate = $state(product.purchasedAt);
  let editSerials = $state(product.serialNumbers.join("\n"));
  let editProvider = $state(warranty?.provider ?? "");
  let editWarrantyEnds = $state(warranty?.endsAt ?? "");
  let editLifetime = $state(warranty?.lifetime ?? false);
  let editClaimUrl = $state(warranty?.claimUrl ?? "");
  let editClaimPhone = $state(warranty?.claimPhone ?? "");
  let editClaimEmail = $state(warranty?.claimEmail ?? "");
  let editEligibilityNotes = $state(warranty?.eligibilityNotes ?? "");
  let editClaimDeadline = $state(warranty?.claimDeadline ?? "");
  let editClaimInstructions = $state(
    warranty?.claimInstructions
      .map((instruction) => instruction.title)
      .join("\n") ?? "",
  );

  async function addNote() {
    if (!note.trim()) return;
    const response = await fetch(`/api/v1/products/${data.product.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: note.trim() }),
    });
    if (!response.ok) return;
    const result = await response.json();
    notes = [
      {
        id: result.note.id,
        author: "You",
        date: "Just now",
        body: result.note.body,
      },
      ...notes,
    ];
    note = "";
  }

  async function uploadDocument(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    const body = new FormData();
    body.set("file", file);
    body.set("productId", data.product.id);
    body.set("kind", documentKind);
    const response = await fetch("/api/v1/documents", {
      method: "POST",
      body,
    });
    uploading = false;
    input.value = "";
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      editError = result.error ?? "The document could not be attached.";
      return;
    }
    if (data.demoMode) return;
    location.reload();
  }

  async function uploadImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadingImage = true;
    editError = "";
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`/api/v1/products/${data.product.id}/images`, {
      method: "POST",
      body,
    });
    uploadingImage = false;
    input.value = "";
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      editError = result.error ?? "The image could not be uploaded.";
      return;
    }
    if (data.demoMode) return;
    location.reload();
  }

  async function saveRecord() {
    editError = "";
    const productResponse = await fetch(`/api/v1/products/${data.product.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: editName.trim(),
        brand: editBrand.trim(),
        model: editModel.trim(),
        category: editCategory.trim(),
        retailer: editRetailer.trim(),
        orderNumber: editOrderNumber.trim(),
        purchaseDate: editPurchaseDate || null,
        serialNumbers: editSerials
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    });
    if (!productResponse.ok) {
      const result = await productResponse.json().catch(() => ({}));
      editError = result.error ?? "The product could not be updated.";
      return;
    }

    const instructions = editClaimInstructions
      .split("\n")
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title) => ({ title, required: true }));
    const warrantyBody = {
      provider: editProvider.trim(),
      endsAt: editLifetime ? null : editWarrantyEnds || null,
      lifetime: editLifetime,
      claimUrl: editClaimUrl.trim() || null,
      claimPhone: editClaimPhone.trim() || null,
      claimEmail: editClaimEmail.trim() || null,
      eligibilityNotes: editEligibilityNotes.trim() || null,
      claimDeadline: editClaimDeadline || null,
      claimInstructions: instructions,
    };
    const shouldSaveWarranty =
      Boolean(warranty) ||
      editLifetime ||
      Boolean(
        editProvider.trim() ||
        editWarrantyEnds ||
        editClaimUrl.trim() ||
        editClaimPhone.trim() ||
        editClaimEmail.trim() ||
        editEligibilityNotes.trim() ||
        editClaimDeadline ||
        instructions.length,
      );
    if (shouldSaveWarranty) {
      const warrantyResponse = await fetch(
        warranty
          ? `/api/v1/warranties/${warranty.id}`
          : `/api/v1/products/${data.product.id}/warranties`,
        {
          method: warranty ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(warrantyBody),
        },
      );
      if (!warrantyResponse.ok) {
        const result = await warrantyResponse.json().catch(() => ({}));
        editError = result.error ?? "The warranty could not be updated.";
        return;
      }
    }
    editing = false;
    if (!data.demoMode) location.reload();
  }

  async function toggleArchived() {
    const restoring = Boolean(product.archivedAt);
    if (
      !restoring &&
      !confirm(`Archive ${product.name}? You can restore it from the archive.`)
    )
      return;
    editError = "";
    const response = await fetch(
      restoring
        ? `/api/v1/products/${data.product.id}/restore`
        : `/api/v1/products/${data.product.id}`,
      { method: restoring ? "POST" : "DELETE" },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      editError =
        result.error ??
        `The product could not be ${restoring ? "restored" : "archived"}.`;
      return;
    }
    location.href = restoring ? `/products/${data.product.id}` : "/archive";
  }
</script>

<svelte:head><title>{data.product.name} · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/"
    class="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
  >
    <ArrowLeft size={17} /> Household inventory
  </a>

  <header
    class="grid gap-6 border-b border-ink pb-7 lg:grid-cols-[minmax(320px,0.8fr)_1.2fr]"
  >
    <div
      class="relative aspect-[16/10] overflow-hidden border border-rule bg-[#ecebe5]"
    >
      {#if data.product.imageUrl}
        <img
          src={data.product.imageUrl}
          alt=""
          class="h-full w-full object-cover"
        />
      {:else}
        <div class="grid h-full place-items-center text-muted">
          <ShieldCheck size={60} strokeWidth={1.2} />
        </div>
      {/if}
      {#if can("images:attach", "warranties:write")}
        <label
          class="absolute right-3 bottom-3 flex min-h-10 cursor-pointer items-center gap-2 bg-sheet px-3 text-xs font-bold shadow-sheet"
        >
          <ImagePlus size={16} />
          {uploadingImage ? "Uploading…" : "Change image"}
          <input
            type="file"
            class="sr-only"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploadingImage}
            onchange={uploadImage}
          />
        </label>
      {/if}
    </div>

    <div class="flex flex-col">
      <div class="flex items-start justify-between gap-5">
        <div>
          <div class="mb-3 flex flex-wrap gap-2">
            {#if product.archivedAt}
              <StatusBadge tone="neutral">Archived</StatusBadge>
            {/if}
            <StatusBadge
              tone={data.product.coverageStatus === "expiring"
                ? "attention"
                : data.product.coverageStatus === "active"
                  ? "success"
                  : data.product.coverageStatus === "lifetime"
                    ? "info"
                    : "neutral"}
            >
              {data.product.coverageStatus === "expiring"
                ? "Expiring soon"
                : data.product.coverageStatus === "active"
                  ? "Coverage active"
                  : data.product.coverageStatus === "lifetime"
                    ? "Lifetime coverage"
                    : data.product.coverageStatus === "expired"
                      ? "Coverage expired"
                      : "Coverage not recorded"}
            </StatusBadge>
            {#if data.product.activeClaim}
              <StatusBadge
                tone={data.product.activeClaim.status === "needs_evidence"
                  ? "danger"
                  : "info"}
              >
                {data.product.activeClaim.status === "needs_evidence"
                  ? "Evidence needed"
                  : "Claim in review"}
              </StatusBadge>
            {/if}
          </div>
          <p class="text-xs font-bold tracking-[0.07em] text-muted uppercase">
            {data.product.brand}
          </p>
          <h1
            class="mt-2 max-w-3xl text-[clamp(2.2rem,5vw,4.5rem)] leading-[0.92] font-bold tracking-[-0.04em]"
          >
            {data.product.name}
          </h1>
          <p class="mt-3 text-lg text-muted">
            {data.product.model} · {data.product.category}
          </p>
        </div>
        {#if canManageProduct}
          <button
            aria-label={product.archivedAt
              ? "Restore product"
              : "Archive product"}
            title={product.archivedAt ? "Restore product" : "Archive product"}
            class="grid size-11 shrink-0 place-items-center border border-rule bg-sheet text-muted hover:border-ink hover:text-ink"
            onclick={toggleArchived}
          >
            <Archive size={19} />
          </button>
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
              : data.product.warrantyEndsAt
                ? new Date(
                    `${data.product.warrantyEndsAt}T00:00:00`,
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
            {data.product.purchasedAt
              ? new Date(
                  `${data.product.purchasedAt}T00:00:00`,
                ).toLocaleDateString()
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
            {data.product.serialNumbers[0] || "Not recorded"}
          </dd>
        </div>
        <div class="py-4 pl-3">
          <dt
            class="text-[0.66rem] font-bold tracking-[0.055em] text-muted uppercase"
          >
            Retailer
          </dt>
          <dd class="mt-1.5 text-sm font-bold">
            {data.product.retailer || "Not recorded"}
          </dd>
        </div>
      </dl>

      <div class="mt-auto flex flex-wrap gap-2 pt-6">
        {#if can("claims:create")}
          <a
            href={`/claims/new?product=${data.product.id}`}
            class="inline-flex min-h-12 items-center gap-2 bg-ink px-5 text-sm font-bold text-white hover:bg-orange"
          >
            <Plus size={17} /> Start a claim
          </a>
        {/if}
        {#if canEditRecord}
          <button
            class="inline-flex min-h-12 items-center gap-2 border border-rule bg-sheet px-5 text-sm font-bold hover:border-ink"
            aria-expanded={editing}
            onclick={() => (editing = !editing)}
          >
            {editing ? "Close editor" : "Edit record"}
          </button>
        {/if}
      </div>
    </div>
  </header>

  {#if product.createdBy || product.sources?.length}
    <section
      aria-labelledby="record-origin-heading"
      class="mt-5 grid gap-4 border-y border-rule bg-sheet px-4 py-4 sm:grid-cols-[minmax(180px,0.35fr)_1fr] sm:px-5"
    >
      <div>
        <p
          id="record-origin-heading"
          class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >
          Record origin
        </p>
        <div class="mt-2 flex items-center gap-2 text-sm font-bold">
          <Bot size={17} class="text-orange" />
          Added by {product.createdBy?.name ?? "Household"}
        </div>
      </div>
      {#if product.sources?.length}
        <div
          class="min-w-0 border-t border-rule pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5"
        >
          <p class="text-xs font-bold text-muted">Sources retained</p>
          <ul class="mt-2 flex flex-wrap gap-2">
            {#each product.sources as source}
              <li>
                {#if source.url}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    class="inline-flex min-h-9 max-w-full items-center gap-2 border border-rule bg-paper px-3 text-xs font-bold hover:border-ink"
                  >
                    <span class="truncate"
                      >{source.label ??
                        source.externalSystem ??
                        "Source link"}</span
                    >
                    <ExternalLink size={13} class="shrink-0" />
                  </a>
                {:else}
                  <span
                    class="inline-flex min-h-9 max-w-full items-center border border-rule bg-paper px-3 text-xs font-bold"
                  >
                    <span class="truncate"
                      >{source.label ??
                        `${source.externalSystem ?? source.kind}: ${source.externalId ?? "reference"}`}</span
                    >
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}

  {#if editError}
    <div
      role="alert"
      class="mt-5 border border-orange/50 bg-orange-soft px-4 py-3 text-sm font-semibold text-[#7d3218]"
    >
      {editError}
    </div>
  {/if}

  {#if editing}
    <section
      aria-labelledby="edit-record-heading"
      class="mt-6 border border-ink bg-sheet p-5 sm:p-6"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
            Household record
          </p>
          <h2
            id="edit-record-heading"
            class="mt-1 text-2xl font-bold tracking-[-0.03em]"
          >
            Edit product and coverage
          </h2>
        </div>
        <button
          class="min-h-10 px-3 text-xs font-bold text-muted hover:text-ink"
          onclick={() => (editing = false)}>Cancel</button
        >
      </div>

      <div class="mt-6 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <label class="grid gap-1.5 text-xs font-bold text-muted">
          Product name
          <input
            bind:value={editName}
            required
            class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
          />
        </label>
        <label class="grid gap-1.5 text-xs font-bold text-muted">
          Brand
          <input
            bind:value={editBrand}
            class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
          />
        </label>
        <label class="grid gap-1.5 text-xs font-bold text-muted">
          Model
          <input
            bind:value={editModel}
            class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
          />
        </label>
        <label class="grid gap-1.5 text-xs font-bold text-muted">
          Category
          <input
            bind:value={editCategory}
            class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
          />
        </label>
        <label class="grid gap-1.5 text-xs font-bold text-muted">
          Retailer
          <input
            bind:value={editRetailer}
            class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
          />
        </label>
        <label class="grid gap-1.5 text-xs font-bold text-muted">
          Purchase date
          <input
            type="date"
            bind:value={editPurchaseDate}
            class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
          />
        </label>
        <label class="grid gap-1.5 text-xs font-bold text-muted">
          Order or invoice number
          <input
            bind:value={editOrderNumber}
            class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
          />
        </label>
        <label class="grid gap-1.5 text-xs font-bold text-muted sm:col-span-2">
          Serial numbers <span class="font-normal">One per line</span>
          <textarea
            bind:value={editSerials}
            class="min-h-20 border border-rule bg-paper p-3 text-sm font-medium text-ink outline-none focus:border-ink"
          ></textarea>
        </label>
      </div>

      <div class="mt-7 border-t border-rule pt-6">
        <h3 class="text-base font-bold">Warranty and claim contact</h3>
        <div class="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <label class="grid gap-1.5 text-xs font-bold text-muted">
            Provider
            <input
              bind:value={editProvider}
              class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
            />
          </label>
          <label class="grid gap-1.5 text-xs font-bold text-muted">
            Coverage ends
            <input
              type="date"
              bind:value={editWarrantyEnds}
              disabled={editLifetime}
              class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink disabled:opacity-45"
            />
          </label>
          <label
            class="flex min-h-11 items-center gap-3 self-end border border-rule bg-paper px-3 text-sm font-bold text-ink"
          >
            <input
              type="checkbox"
              bind:checked={editLifetime}
              class="size-4 accent-ink"
            />
            Lifetime coverage
          </label>
          <label class="grid gap-1.5 text-xs font-bold text-muted">
            Claim phone
            <input
              type="tel"
              bind:value={editClaimPhone}
              class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
            />
          </label>
          <label class="grid gap-1.5 text-xs font-bold text-muted">
            Claim website
            <input
              type="url"
              bind:value={editClaimUrl}
              placeholder="https://"
              class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
            />
          </label>
          <label class="grid gap-1.5 text-xs font-bold text-muted">
            Claim email
            <input
              type="email"
              bind:value={editClaimEmail}
              class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
            />
          </label>
          <label class="grid gap-1.5 text-xs font-bold text-muted">
            Claim deadline
            <input
              type="date"
              bind:value={editClaimDeadline}
              class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
            />
          </label>
          <label
            class="grid gap-1.5 text-xs font-bold text-muted sm:col-span-2 lg:col-span-3"
          >
            Eligibility notes
            <textarea
              bind:value={editEligibilityNotes}
              class="min-h-20 border border-rule bg-paper p-3 text-sm font-medium text-ink outline-none focus:border-ink"
              placeholder="Coverage exclusions, registration requirements, or proof needed…"
            ></textarea>
          </label>
          <label
            class="grid gap-1.5 text-xs font-bold text-muted sm:col-span-2 lg:col-span-3"
          >
            Claim instructions <span class="font-normal">One step per line</span
            >
            <textarea
              bind:value={editClaimInstructions}
              class="min-h-24 border border-rule bg-paper p-3 text-sm font-medium text-ink outline-none focus:border-ink"
              placeholder="Find the receipt&#10;Photograph the damage&#10;Contact the provider"
            ></textarea>
          </label>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button
          class="min-h-11 bg-ink px-5 text-sm font-bold text-white hover:bg-orange disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!editName.trim()}
          onclick={saveRecord}
        >
          Save record
        </button>
      </div>
    </section>
  {/if}

  <div class="grid gap-8 pt-8 xl:grid-cols-[1.25fr_0.75fr]">
    <div class="space-y-8">
      {#if data.product.activeClaim}
        <section
          aria-labelledby="claim-heading"
          class="border border-orange/40 bg-sheet"
        >
          <div
            class="flex flex-col gap-4 border-b border-rule p-5 sm:flex-row sm:items-start sm:justify-between"
          >
            <div class="flex gap-3">
              <span
                class="grid size-10 shrink-0 place-items-center bg-orange text-white"
                ><CircleAlert size={19} /></span
              >
              <div>
                <p
                  class="text-xs font-bold tracking-[0.06em] text-[#963714] uppercase"
                >
                  Active claim · {data.product.activeClaim.reference}
                </p>
                <h2
                  id="claim-heading"
                  class="mt-1 text-xl font-bold tracking-[-0.02em]"
                >
                  {data.product.activeClaim.summary}
                </h2>
                <p class="mt-1 text-sm text-muted">
                  Next: {data.product.activeClaim.nextAction}
                </p>
              </div>
            </div>
            <a
              href={`/claims/${data.product.activeClaim.id}`}
              class="inline-flex min-h-10 items-center gap-2 border border-ink px-3 text-xs font-bold hover:bg-ink hover:text-white"
            >
              Manage claim <ChevronRight size={15} />
            </a>
          </div>

          <div class="grid p-5 sm:grid-cols-3">
            <div
              class="border-b border-rule pb-4 sm:border-r sm:border-b-0 sm:pr-4 sm:pb-0"
            >
              <div
                class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >
                Claim status
              </div>
              <div class="mt-1 text-sm font-bold">
                {data.product.activeClaim.status.replaceAll("_", " ")}
              </div>
            </div>
            <div
              class="border-b border-rule py-4 sm:border-r sm:border-b-0 sm:px-4 sm:py-0"
            >
              <div
                class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >
                Next action
              </div>
              <div class="mt-1 text-sm font-bold">
                {data.product.activeClaim.nextAction || "Review claim details"}
              </div>
            </div>
            <div class="pt-4 sm:pl-4 sm:pt-0">
              <div
                class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >
                Provider
              </div>
              <div class="mt-1 text-sm font-bold">
                {warranty?.provider || data.product.brand || "Not recorded"}
              </div>
            </div>
          </div>
        </section>
      {/if}

      <section aria-labelledby="documents-heading">
        <div
          class="mb-4 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h2
              id="documents-heading"
              class="text-2xl font-bold tracking-[-0.03em]"
            >
              Documents
            </h2>
            <p class="mt-1 text-sm text-muted">
              Manuals, receipts, warranty terms, and claim evidence.
            </p>
          </div>
          {#if can("documents:attach")}
            <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <label class="sr-only" for="product-document-kind"
                >Document type</label
              >
              <select
                id="product-document-kind"
                bind:value={documentKind}
                class="min-h-10 border border-rule bg-sheet px-2 text-xs font-bold"
              >
                <option value="manual">Manual</option>
                <option value="receipt">Receipt</option>
                <option value="warranty">Warranty terms</option>
                <option value="photo">Photo</option>
                <option value="other">Other</option>
              </select>
              <label
                class="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink"
              >
                <FilePlus2 size={16} />
                {uploading ? "Uploading…" : "Attach"}
                <input
                  type="file"
                  class="sr-only"
                  accept="image/*,.pdf"
                  disabled={uploading}
                  onchange={uploadDocument}
                />
              </label>
            </div>
          {/if}
        </div>

        <div class="border-t border-ink">
          {#each documents as document}
            <div
              class="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-rule py-4 text-left"
            >
              <span
                class="grid size-10 place-items-center bg-blue-soft text-[#294968]"
              >
                {#if document.kind === "receipt"}<ReceiptText
                    size={19}
                  />{:else}<FileText size={19} />{/if}
              </span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-bold"
                  >{document.name}</span
                >
                <span class="mt-1 block text-xs text-muted"
                  >{document.kind} · {document.sizeBytes
                    ? `${Math.ceil(document.sizeBytes / 1024)} KB`
                    : "Size pending"} · {document.backend === "paperless"
                    ? "Paperless-ngx"
                    : "Domino storage"}</span
                >
              </span>
              {#if document.backend !== "paperless" || document.paperlessUrl}
                <a
                  href={document.backend === "paperless"
                    ? document.paperlessUrl
                    : `/api/v1/documents/${document.id}/content`}
                  target="_blank"
                  rel="noreferrer"
                  class="grid size-10 place-items-center text-muted hover:text-ink"
                  aria-label={`Open ${document.name}`}
                >
                  <ExternalLink size={17} />
                </a>
              {:else}
                <span class="text-xs font-bold text-muted"
                  >{document.processingStatus}</span
                >
              {/if}
            </div>
          {/each}
        </div>
      </section>

      <section aria-labelledby="notes-heading">
        <div class="mb-4">
          <h2 id="notes-heading" class="text-2xl font-bold tracking-[-0.03em]">
            Notes
          </h2>
          <p class="mt-1 text-sm text-muted">
            Shared context for the household and approved agents.
          </p>
        </div>
        {#if can("notes:write")}
          <div class="border border-rule bg-sheet p-4">
            <label
              for="new-note"
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >Add a note</label
            >
            <textarea
              id="new-note"
              bind:value={note}
              class="mt-2 min-h-24 w-full resize-y border-0 bg-paper p-3 text-sm leading-relaxed outline-none"
              placeholder="Record a symptom, phone call, repair attempt, or decision…"
            ></textarea>
            <div class="mt-3 flex justify-end">
              <button
                class="min-h-10 bg-ink px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!note.trim()}
                onclick={addNote}
              >
                Save note
              </button>
            </div>
          </div>
        {/if}

        <div class="mt-3 border-t border-rule">
          {#each notes as item}
            <article
              class="grid gap-2 border-b border-rule py-5 sm:grid-cols-[130px_1fr]"
            >
              <div class="text-xs">
                <div class="font-bold">{item.author}</div>
                <div class="mt-1 text-muted">{item.date}</div>
              </div>
              <p class="max-w-[72ch] text-sm leading-relaxed">{item.body}</p>
            </article>
          {/each}
        </div>
      </section>
    </div>

    <aside class="space-y-8">
      <section
        aria-labelledby="guide-heading"
        class="border border-ink bg-sheet p-5"
      >
        <div class="flex items-start gap-3">
          <span
            class="grid size-10 shrink-0 place-items-center bg-ink text-white"
            ><ShieldCheck size={19} /></span
          >
          <div>
            <p
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >
              Claim guide
            </p>
            <h2
              id="guide-heading"
              class="mt-1 text-xl font-bold tracking-[-0.025em]"
            >
              How to file with {warranty?.provider ?? data.product.brand}
            </h2>
          </div>
        </div>

        <ol class="mt-6 border-t border-rule">
          {#if warranty?.claimInstructions?.length}
            {#each warranty.claimInstructions as instruction, index}
              <li
                class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4"
              >
                <span
                  class="grid size-7 place-items-center border border-rule text-xs font-bold"
                  >{index + 1}</span
                >
                <div>
                  <div class="text-sm font-bold">{instruction.title}</div>
                  {#if instruction.detail}<p
                      class="mt-1 text-xs leading-relaxed text-muted"
                    >
                      {instruction.detail}
                    </p>{/if}
                </div>
              </li>
            {/each}
          {:else}
            <li
              class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4"
            >
              <span
                class="grid size-7 place-items-center bg-green text-xs font-bold text-white"
                >✓</span
              >
              <div>
                <div class="text-sm font-bold">Confirm coverage</div>
                <p class="mt-1 text-xs leading-relaxed text-muted">
                  {warranty?.lifetime
                    ? "This record marks the coverage as lifetime."
                    : warranty?.endsAt
                      ? `Coverage is recorded through ${new Date(`${warranty.endsAt}T00:00:00`).toLocaleDateString()}.`
                      : "Review the warranty terms and record the coverage end date."}
                </p>
              </div>
            </li>
            <li
              class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4"
            >
              <span
                class="grid size-7 place-items-center bg-orange text-xs font-bold text-white"
                >2</span
              >
              <div>
                <div class="text-sm font-bold">Gather required evidence</div>
                <p class="mt-1 text-xs leading-relaxed text-muted">
                  Receipt, serial number, issue description, and one damage
                  photo are a useful starting set; confirm the provider’s exact
                  requirements.
                </p>
              </div>
            </li>
            <li
              class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4"
            >
              <span
                class="grid size-7 place-items-center border border-rule text-xs font-bold"
                >3</span
              >
              <div>
                <div class="text-sm font-bold">Contact the provider</div>
                <p class="mt-1 text-xs leading-relaxed text-muted">
                  {warranty?.claimUrl ||
                  warranty?.claimPhone ||
                  warranty?.claimEmail
                    ? "Use one of the recorded contact methods below."
                    : "Record the provider’s claim site, phone, or email before filing."}
                </p>
              </div>
            </li>
          {/if}
        </ol>

        <div
          class="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
        >
          {#if warranty?.claimPhone}<a
              href={`tel:${warranty.claimPhone}`}
              class="flex min-h-11 items-center justify-center gap-2 border border-rule text-xs font-bold hover:border-ink"
              ><Phone size={15} /> {warranty.claimPhone}</a
            >{/if}
          {#if warranty?.claimUrl}<a
              href={warranty.claimUrl}
              target="_blank"
              rel="noreferrer"
              class="flex min-h-11 items-center justify-center gap-2 bg-ink text-xs font-bold text-white hover:bg-orange"
              >Claim site <ExternalLink size={14} /></a
            >{/if}
          {#if warranty?.claimEmail}<a
              href={`mailto:${warranty.claimEmail}`}
              class="flex min-h-11 items-center justify-center gap-2 border border-rule text-xs font-bold hover:border-ink"
              >{warranty.claimEmail}</a
            >{/if}
        </div>
        {#if warranty?.eligibilityNotes || warranty?.claimDeadline}
          <dl class="mt-5 border-t border-rule text-sm">
            {#if warranty.claimDeadline}
              <div class="border-b border-rule py-3">
                <dt class="text-xs text-muted">Claim deadline</dt>
                <dd class="mt-1 font-bold">
                  {new Date(
                    `${warranty.claimDeadline}T00:00:00`,
                  ).toLocaleDateString()}
                </dd>
              </div>
            {/if}
            {#if warranty.eligibilityNotes}
              <div class="py-3">
                <dt class="text-xs text-muted">Eligibility notes</dt>
                <dd class="mt-1 whitespace-pre-line leading-relaxed">
                  {warranty.eligibilityNotes}
                </dd>
              </div>
            {/if}
          </dl>
        {/if}
      </section>

      <section aria-labelledby="details-heading">
        <h2 id="details-heading" class="text-xl font-bold tracking-[-0.025em]">
          Record details
        </h2>
        <dl class="mt-4 border-t border-ink text-sm">
          <div class="grid grid-cols-[120px_1fr] border-b border-rule py-3">
            <dt class="text-muted">Provider</dt>
            <dd class="font-semibold">
              {warranty?.provider ?? "Not recorded"}
            </dd>
          </div>
          <div class="grid grid-cols-[120px_1fr] border-b border-rule py-3">
            <dt class="text-muted">Order</dt>
            <dd class="font-semibold">
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
    </aside>
  </div>
</div>
