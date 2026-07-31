<script lang="ts">
  import { submissionMethodLabel } from "$lib/claim-guidance";
  import type { ClaimWarranty } from "./types";

  let { warranty, brand }: { warranty?: ClaimWarranty; brand?: string | null } =
    $props();
</script>

<section
  aria-labelledby="guidance-heading"
  class="border border-ink bg-sheet p-5"
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
        Provider guidance
      </p>
      <h2 id="guidance-heading" class="mt-1 text-xl font-bold">
        File with {warranty?.provider ?? brand ?? "the provider"}
      </h2>
    </div>
    {#if warranty?.claimDeadline}
      <div class="border border-orange/30 bg-orange-soft px-3 py-2 text-xs">
        <span class="font-bold">Deadline</span>
        <span class="ml-1"
          >{new Date(
            `${warranty.claimDeadline}T00:00:00`,
          ).toLocaleDateString()}</span
        >
      </div>
    {/if}
  </div>

  {#if warranty?.submissionMethods?.length}
    <div class="mt-5 border-y border-rule py-4">
      <h3 class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
        Submission methods
      </h3>
      <ul class="mt-2 flex flex-wrap gap-2">
        {#each warranty.submissionMethods as method}
          <li
            class="border border-blue-border bg-blue-soft px-2 py-1 text-xs font-bold text-blue-ink"
          >
            {submissionMethodLabel(method)}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if warranty?.eligibilityNotes}
    <div class="mt-5 border-y border-rule py-4">
      <h3 class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
        Eligibility notes
      </h3>
      <p class="mt-2 whitespace-pre-line text-sm leading-relaxed">
        {warranty.eligibilityNotes}
      </p>
    </div>
  {/if}

  {#if warranty?.requiredEvidence?.length}
    <section aria-labelledby="required-evidence-heading" class="mt-5">
      <h3
        id="required-evidence-heading"
        class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
      >
        Required evidence
      </h3>
      <ul class="mt-2 border-t border-rule">
        {#each warranty.requiredEvidence as item}
          <li
            class="flex items-start justify-between gap-3 border-b border-rule py-3 text-sm"
          >
            <span>{item.label}</span>
            <span
              class="shrink-0 text-[0.66rem] font-bold tracking-[0.055em] text-orange-ink uppercase"
            >
              {item.required ? "Required" : "Optional"}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <ol class="mt-5 border-t border-rule">
    {#if warranty?.claimInstructions?.length}
      {#each warranty.claimInstructions as instruction, index}
        <li class="grid grid-cols-[30px_1fr] gap-3 border-b border-rule py-4">
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
            {#if instruction.required}<p
                class="mt-1 text-[0.66rem] font-bold tracking-[0.055em] text-orange uppercase"
              >
                Required
              </p>{/if}
          </div>
        </li>
      {/each}
    {:else}
      <li class="border-b border-rule py-4 text-sm text-muted">
        No provider-specific checklist is recorded. Confirm coverage, gather the
        receipt and product identifiers, document the problem, and verify the
        provider’s submission requirements.
      </li>
    {/if}
  </ol>
</section>
