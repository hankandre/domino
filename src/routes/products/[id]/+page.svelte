<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";
  import { tick } from "svelte";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
  import ActiveClaimPanel from "./_components/ActiveClaimPanel.svelte";
  import ClaimGuide from "./_components/ClaimGuide.svelte";
  import DocumentsPanel from "./_components/DocumentsPanel.svelte";
  import NotesPanel from "./_components/NotesPanel.svelte";
  import ProductEditor from "./_components/ProductEditor.svelte";
  import RecordDetails from "./_components/RecordDetails.svelte";
  import RecordHeader from "./_components/RecordHeader.svelte";
  import RecordOrigin from "./_components/RecordOrigin.svelte";
  import type { ProductDetail } from "./_components/types";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const product = $derived(data.product as ProductDetail);
  const warranty = $derived(product.warranties?.[0]);
  const documents = $derived(
    Array.isArray(product.documents) ? product.documents : [],
  );
  const notes = $derived(Array.isArray(product.notes) ? product.notes : []);
  const relatedRecordsTruncated = $derived(
    Object.values(product.relatedPage ?? {}).some(Boolean),
  );
  const actorPermissions = $derived(data.actor?.permissions ?? []);
  const can = (...permissions: string[]) =>
    actorPermissions.includes("*") ||
    permissions.some((permission) => actorPermissions.includes(permission));
  const canManageProduct = $derived(can("products:manage", "warranties:write"));
  const canManageWarranty = $derived(
    can("warranties:manage", "warranties:write"),
  );
  const canEditRecord = $derived(
    canManageProduct && (!product.warranties?.length || canManageWarranty),
  );
  const initialProductId = () => data.product.id;
  let editing = $state(false);
  let saveMessage = $state("");
  let currentProductId = $state(initialProductId());

  $effect(() => {
    if (currentProductId === product.id) return;
    currentProductId = product.id;
    editing = false;
  });

  async function closeEditor() {
    editing = false;
    await tick();
    document.querySelector<HTMLButtonElement>("#product-edit-toggle")?.focus();
  }
</script>

<svelte:head><title>{product.name} · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/"
    class="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-muted hover:text-ink"
  >
    <ArrowLeft size={17} /> Household inventory
  </a>

  {#key product.id}
    <RecordHeader
      {product}
      {warranty}
      demoMode={data.demoMode}
      canAttachImage={can("images:attach", "warranties:write")}
      {canManageProduct}
      canCreateClaim={can("claims:create")}
      {canEditRecord}
      {editing}
      ontoggleedit={() => {
        if (!editing) saveMessage = "";
        editing = !editing;
      }}
    />
  {/key}

  {#if saveMessage}
    <div class="mt-5">
      <AsyncNotice tone="success">{saveMessage}</AsyncNotice>
    </div>
  {/if}

  <RecordOrigin {product} />

  {#if relatedRecordsTruncated}
    <div class="mt-5">
      <AsyncNotice tone="info">
        This overview shows the newest related records. Use the dedicated Claims
        and Documents pages to browse older household records.
      </AsyncNotice>
    </div>
  {/if}

  {#if editing}
    {#key product.id}
      <ProductEditor
        {product}
        {warranty}
        demoMode={data.demoMode}
        onclose={closeEditor}
        onsaved={() => (saveMessage = "Product and coverage updated.")}
      />
    {/key}
  {/if}

  <div class="grid gap-8 pt-8 xl:grid-cols-[0.75fr_1.25fr]">
    <aside class="space-y-8">
      <ClaimGuide {warranty} brand={product.brand} />
      <RecordDetails {product} {warranty} />
    </aside>

    <div class="space-y-8">
      <ActiveClaimPanel {product} {warranty} />
      {#key product.id}
        <DocumentsPanel
          productId={product.id}
          {documents}
          demoMode={data.demoMode}
          canAttach={can("documents:attach")}
        />
        <NotesPanel
          productId={product.id}
          initialNotes={notes}
          canWrite={can("notes:write")}
        />
      {/key}
    </div>
  </div>
</div>
