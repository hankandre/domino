<script lang="ts">
  import { ArrowRight, CircleAlert, ClipboardCheck, Plus } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Pagination from "$lib/components/Pagination.svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";

  let { data } = $props();
  const closedStatuses = ["resolved", "closed"];
  const openClaims = $derived(
    data.claims.filter((claim) => !closedStatuses.includes(claim.status)),
  );
  const completedClaims = $derived(
    data.claims.filter((claim) => closedStatuses.includes(claim.status)),
  );

  function statusTone(status: string) {
    if (status === "needs_evidence" || status === "denied") return "danger";
    if (status === "approved" || status === "resolved") return "success";
    if (status === "draft" || status === "closed") return "neutral";
    return "info";
  }
</script>

<svelte:head><title>Claims · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <PageHeader
    kicker="Claim desk"
    title="Claims"
    description="Keep every contact, document, deadline, and decision in one durable trail."
  >
    {#if data.actor?.permissions.includes("*") ||
    data.actor?.permissions.includes("claims:create")}
      <a
        href="/claims/new"
        class="inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-sm font-bold text-white hover:bg-orange"
      >
        <Plus size={17} /> New claim
      </a>
    {/if}
  </PageHeader>

  <section class="mt-7" aria-labelledby="open-claims-heading">
    <div class="flex items-end justify-between gap-4 border-b border-ink pb-3">
      <div>
        <h2 id="open-claims-heading" class="text-xl font-bold">Open claims</h2>
        <p class="mt-1 text-sm text-muted">
          {openClaims.length} requiring follow-through on this page
        </p>
      </div>
    </div>
    {#if openClaims.length}
      <div class="grid gap-4 pt-5 md:grid-cols-2">
        {#each openClaims as claim}
          <article
            class="group relative border border-rule bg-sheet p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-sheet"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex gap-3">
                <span
                  class="grid size-10 shrink-0 place-items-center bg-orange-soft text-orange"
                  ><CircleAlert size={20} /></span
                >
                <div>
                  <StatusBadge tone={statusTone(claim.status)}
                    >{claim.status.replaceAll("_", " ")}</StatusBadge
                  >
                  <h3 class="mt-3 text-xl font-bold tracking-[-0.025em]">
                    {claim.product.brand}
                    {claim.product.name}
                  </h3>
                  <p class="mt-1 text-sm text-muted">
                    {claim.reference} · {claim.issue}
                  </p>
                </div>
              </div>
              <ArrowRight
                class="shrink-0 text-muted transition-transform group-hover:translate-x-1"
                size={19}
              />
            </div>
            <div class="mt-5 border-t border-rule pt-4">
              <div
                class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
              >
                Next action
              </div>
              <div class="mt-1 text-sm font-bold">
                {claim.nextAction || "Review claim details"}
              </div>
            </div>
            <a
              href={`/claims/${claim.id}`}
              class="absolute inset-0"
              aria-label={`Manage ${claim.reference} for ${claim.product.name}`}
            ></a>
          </article>
        {/each}
      </div>
    {:else}
      <div
        class="grid min-h-56 place-items-center border-b border-rule text-center"
      >
        <div>
          <ClipboardCheck size={28} class="mx-auto text-green" />
          <h3 class="mt-3 text-lg font-bold">No open claims</h3>
          <p class="mt-1 text-sm text-muted">
            New claim drafts will appear here.
          </p>
        </div>
      </div>
    {/if}
  </section>

  <section class="mt-10" aria-labelledby="completed-claims-heading">
    <div class="border-b border-ink pb-3">
      <h2 id="completed-claims-heading" class="text-xl font-bold">
        Resolved history
      </h2>
      <p class="mt-1 text-sm text-muted">
        {completedClaims.length} completed {completedClaims.length === 1
          ? "claim"
          : "claims"} on this page
      </p>
    </div>
    {#if completedClaims.length}
      <div class="border-b border-rule">
        {#each completedClaims as claim}
          <a
            href={`/claims/${claim.id}`}
            class="grid gap-2 border-b border-rule py-4 hover:bg-sheet sm:grid-cols-[1fr_180px_auto] sm:items-center sm:px-3"
          >
            <span>
              <span class="block font-bold"
                >{claim.product.brand} {claim.product.name}</span
              >
              <span class="mt-1 block text-sm text-muted"
                >{claim.reference} · {claim.issue}</span
              >
            </span>
            <span class="text-sm text-muted"
              >{new Date(claim.updatedAt).toLocaleDateString()}</span
            >
            <StatusBadge tone={statusTone(claim.status)}
              >{claim.status}</StatusBadge
            >
          </a>
        {/each}
      </div>
    {/if}
  </section>
  <Pagination
    page={data.claimsPage?.page ?? 1}
    previousHref={data.claimsPage?.previousHref ?? null}
    nextHref={data.claimsPage?.nextHref ?? null}
    label="claims"
  />
</div>
