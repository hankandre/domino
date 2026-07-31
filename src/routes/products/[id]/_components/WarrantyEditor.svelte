<script lang="ts">
  import ClaimGuidanceEditor from "$lib/components/ClaimGuidanceEditor.svelte";
  import type {
    ClaimInstruction,
    RequiredEvidence,
    SubmissionMethod,
  } from "$lib/claim-guidance";

  let {
    provider = $bindable(),
    warrantyEnds = $bindable(),
    lifetime = $bindable(),
    claimPhone = $bindable(),
    claimUrl = $bindable(),
    claimEmail = $bindable(),
    claimDeadline = $bindable(),
    eligibilityNotes = $bindable(),
    submissionMethods = $bindable(),
    requiredEvidence = $bindable(),
    claimInstructions = $bindable(),
  }: {
    provider: string;
    warrantyEnds: string;
    lifetime: boolean;
    claimPhone: string;
    claimUrl: string;
    claimEmail: string;
    claimDeadline: string;
    eligibilityNotes: string;
    submissionMethods: SubmissionMethod[];
    requiredEvidence: RequiredEvidence[];
    claimInstructions: ClaimInstruction[];
  } = $props();
</script>

<div class="mt-7 border-t border-rule pt-6">
  <h3 class="text-base font-bold">Warranty and claim contact</h3>
  <div class="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
    <label class="grid gap-1.5 text-xs font-bold text-muted">
      Provider
      <input
        bind:value={provider}
        class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
      />
    </label>
    <label class="grid gap-1.5 text-xs font-bold text-muted">
      Coverage ends
      <input
        type="date"
        bind:value={warrantyEnds}
        disabled={lifetime}
        class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink disabled:opacity-45"
      />
    </label>
    <label
      class="flex min-h-11 items-center gap-3 self-end border border-rule bg-paper px-3 text-sm font-bold text-ink"
    >
      <input
        type="checkbox"
        bind:checked={lifetime}
        class="size-4 accent-ink"
      />
      Lifetime coverage
    </label>
    <label class="grid gap-1.5 text-xs font-bold text-muted">
      Claim phone
      <input
        type="tel"
        bind:value={claimPhone}
        class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
      />
    </label>
    <label class="grid gap-1.5 text-xs font-bold text-muted">
      Claim website
      <input
        type="url"
        bind:value={claimUrl}
        placeholder="https://"
        class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
      />
    </label>
    <label class="grid gap-1.5 text-xs font-bold text-muted">
      Claim email
      <input
        type="email"
        bind:value={claimEmail}
        class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
      />
    </label>
    <label class="grid gap-1.5 text-xs font-bold text-muted">
      Claim deadline
      <input
        type="date"
        bind:value={claimDeadline}
        class="min-h-11 border border-rule bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-ink"
      />
    </label>
    <label
      class="grid gap-1.5 text-xs font-bold text-muted sm:col-span-2 lg:col-span-3"
    >
      Eligibility notes
      <textarea
        bind:value={eligibilityNotes}
        class="min-h-20 border border-rule bg-paper p-3 text-sm font-medium text-ink outline-none focus:border-ink"
        placeholder="Coverage exclusions, registration requirements, or proof needed…"
      ></textarea>
    </label>
    <ClaimGuidanceEditor
      bind:submissionMethods
      bind:requiredEvidence
      bind:claimInstructions
    />
  </div>
</div>
