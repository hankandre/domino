<script lang="ts">
  let {
    page,
    previousHref,
    nextHref,
    label = "records",
  }: {
    page: number;
    previousHref: string | null;
    nextHref: string | null;
    label?: string;
  } = $props();
</script>

{#if previousHref || nextHref}
  <nav
    class="mt-7 flex items-center justify-between gap-4 border-t border-rule pt-5"
    aria-label={`${label} pagination`}
  >
    {#if previousHref}
      <a
        href={previousHref}
        class="inline-flex min-h-11 items-center border border-rule bg-sheet px-4 text-sm font-bold hover:border-ink"
        rel="prev">Previous</a
      >
    {:else}
      <span></span>
    {/if}
    <span class="text-sm font-semibold text-muted">Page {page}</span>
    {#if nextHref}
      <a
        href={nextHref}
        class="inline-flex min-h-11 items-center border border-ink bg-ink px-4 text-sm font-bold text-white hover:bg-orange"
        rel="next">Next</a
      >
    {:else}
      <span></span>
    {/if}
  </nav>
{/if}
