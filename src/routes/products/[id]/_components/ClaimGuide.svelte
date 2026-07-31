<script lang="ts">
  import { ExternalLink, Phone, ShieldCheck } from "lucide-svelte";
  import { submissionMethodLabel } from "$lib/claim-guidance";
  import type { ProductWarranty } from "./types";

  let { warranty, brand }: { warranty?: ProductWarranty; brand: string } =
    $props();
</script>

<section aria-labelledby="guide-heading" class="border border-ink bg-sheet p-5">
  <div class="flex items-start gap-3">
    <span class="grid size-10 shrink-0 place-items-center bg-ink text-white"
      ><ShieldCheck size={19} /></span
    >
    <div>
      <p class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
        Claim guide
      </p>
      <h2 id="guide-heading" class="mt-1 text-xl font-bold tracking-[-0.025em]">
        How to file with {(warranty?.provider ?? brand) || "the provider"}
      </h2>
    </div>
  </div>

  {#if warranty?.submissionMethods?.length}
    <div class="mt-5 border-y border-rule py-4">
      <h3 class="text-xs font-bold tracking-[0.055em] text-muted uppercase">
        Ways to submit
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

  {#if warranty?.requiredEvidence?.length}
    <section aria-labelledby="evidence-heading" class="mt-5">
      <h3
        id="evidence-heading"
        class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
      >
        Evidence to gather
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

  <ol class="mt-6 border-t border-rule">
    {#if warranty?.claimInstructions?.length}
      {#each warranty.claimInstructions as instruction, index}
        <li class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4">
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
      <li class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4">
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
      <li class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4">
        <span
          class="grid size-7 place-items-center bg-orange text-xs font-bold text-white"
          >2</span
        >
        <div>
          <div class="text-sm font-bold">Gather required evidence</div>
          <p class="mt-1 text-xs leading-relaxed text-muted">
            Receipt, serial number, issue description, and one damage photo are
            a useful starting set; confirm the provider’s exact requirements.
          </p>
        </div>
      </li>
      <li class="grid grid-cols-[28px_1fr] gap-3 border-b border-rule py-4">
        <span
          class="grid size-7 place-items-center border border-rule text-xs font-bold"
          >3</span
        >
        <div>
          <div class="text-sm font-bold">Contact the provider</div>
          <p class="mt-1 text-xs leading-relaxed text-muted">
            {warranty?.claimUrl || warranty?.claimPhone || warranty?.claimEmail
              ? "Use one of the recorded contact methods below."
              : "Record the provider’s claim site, phone, or email before filing."}
          </p>
        </div>
      </li>
    {/if}
  </ol>

  <div class="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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
        class="flex min-h-11 items-center justify-center gap-2 border border-rule px-2 text-center text-xs font-bold break-all hover:border-ink"
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
