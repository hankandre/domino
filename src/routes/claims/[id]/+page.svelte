<script lang="ts">
  import { ArrowLeft } from "lucide-svelte";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import ClaimEvidence from "./_components/ClaimEvidence.svelte";
  import ClaimGuidance from "./_components/ClaimGuidance.svelte";
  import ClaimManager from "./_components/ClaimManager.svelte";
  import ClaimNotes from "./_components/ClaimNotes.svelte";
  import ClaimTimeline from "./_components/ClaimTimeline.svelte";
  import IncidentDetails from "./_components/IncidentDetails.svelte";
  import ProviderContact from "./_components/ProviderContact.svelte";
  import type { ClaimDetail } from "./_components/types";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const claim = $derived(data.claim as ClaimDetail);
  const warranty = $derived(claim.warranty);
  const events = $derived(claim.events ?? []);
  const documents = $derived(claim.documents ?? []);
  const notes = $derived(claim.notes ?? []);
  const relatedRecordsTruncated = $derived(
    "relatedPage" in claim && Object.values(claim.relatedPage).some(Boolean),
  );
  const actorPermissions = $derived(data.actor?.permissions ?? []);
  const can = (permission: string) =>
    actorPermissions.includes("*") || actorPermissions.includes(permission);

  function statusTone(value: string) {
    if (value === "needs_evidence" || value === "denied") return "danger";
    if (value === "approved" || value === "resolved") return "success";
    if (value === "draft" || value === "closed") return "neutral";
    return "info";
  }
</script>

<svelte:head><title>{claim.issue} · Claim · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/claims"
    class="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-muted hover:text-ink"
  >
    <ArrowLeft size={17} /> Claims
  </a>
  <PageHeader
    kicker={`Claim ${claim.reference}`}
    title={claim.issue}
    description={`${claim.product.brand ?? ""} ${claim.product.name} · opened ${new Date(claim.createdAt).toLocaleDateString()}`}
  >
    <StatusBadge tone={statusTone(claim.status)}
      >{claim.status.replaceAll("_", " ")}</StatusBadge
    >
  </PageHeader>

  {#if relatedRecordsTruncated}
    <div class="mt-5">
      <AsyncNotice tone="info">
        This overview shows the newest claim activity. Older household
        documents remain available from the Documents page.
      </AsyncNotice>
    </div>
  {/if}

  <div class="grid gap-8 pt-8 lg:grid-cols-[360px_minmax(0,1fr)]">
    <aside class="space-y-5">
      {#if can("claims:manage")}
        {#key claim.id}
          <ClaimManager {claim} demoMode={data.demoMode} />
        {/key}
      {/if}
      <ProviderContact {warranty} />
      <IncidentDetails
        noticedAt={claim.noticedAt}
        preferredResolution={claim.preferredResolution}
      />
    </aside>

    <div class="space-y-8">
      <ClaimGuidance {warranty} brand={claim.product.brand} />
      {#key claim.id}
        <ClaimEvidence
          claimId={claim.id}
          productId={claim.productId}
          {documents}
          canAttach={can("documents:attach")}
          demoMode={data.demoMode}
        />
        <ClaimTimeline {events} issue={claim.issue} createdAt={claim.createdAt} />
        <ClaimNotes
          claimId={claim.id}
          initialNotes={notes}
          canWrite={can("notes:write")}
        />
      {/key}
    </div>
  </div>
</div>
