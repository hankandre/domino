<script lang="ts">
  import ClaimGuidanceEditor from "$lib/components/ClaimGuidanceEditor.svelte";
  import type {
    ClaimInstruction,
    RequiredEvidence,
    SubmissionMethod,
  } from "$lib/claim-guidance";

  let {
    submissionMethods = $bindable(),
    requiredEvidence = $bindable(),
    claimInstructions = $bindable(),
  }: {
    submissionMethods: SubmissionMethod[];
    requiredEvidence: RequiredEvidence[];
    claimInstructions: ClaimInstruction[];
  } = $props();
</script>

<fieldset>
  <legend class="text-xl font-bold tracking-[-0.025em]">Coverage</legend>
  <div class="mt-4 grid gap-4 sm:grid-cols-2">
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Coverage starts</span
      >
      <input
        name="coverageStarts"
        type="date"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Coverage ends</span
      >
      <input
        name="coverageEnds"
        type="date"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
      />
    </label>
    <label
      class="flex min-h-12 items-center gap-3 border border-rule bg-sheet px-3 text-sm font-bold sm:col-span-2"
    >
      <input name="lifetime" type="checkbox" class="size-4 accent-orange" />
      Lifetime coverage
    </label>
    <label class="sm:col-span-2">
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Provider</span
      >
      <input
        name="provider"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="Manufacturer or protection plan provider"
      />
    </label>
    <label class="sm:col-span-2">
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Claim or support URL</span
      >
      <input
        name="claimUrl"
        type="url"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
        placeholder="https://…"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Claim phone</span
      >
      <input
        name="claimPhone"
        type="tel"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Claim email</span
      >
      <input
        name="claimEmail"
        type="email"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
      />
    </label>
    <label>
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Claim deadline</span
      >
      <input
        name="claimDeadline"
        type="date"
        class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
      />
    </label>
    <label class="sm:col-span-2">
      <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Eligibility notes</span
      >
      <textarea
        name="eligibilityNotes"
        class="mt-2 min-h-24 w-full border border-rule bg-sheet p-3 outline-none focus:border-ink"
        placeholder="Exclusions, registration requirements, proof needed, or other coverage conditions."
      ></textarea>
    </label>
    <ClaimGuidanceEditor
      bind:submissionMethods
      bind:requiredEvidence
      bind:claimInstructions
    />
  </div>
</fieldset>
