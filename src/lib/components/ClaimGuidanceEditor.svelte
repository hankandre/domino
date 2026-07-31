<script lang="ts">
  import { Plus, Trash2 } from "lucide-svelte";
  import {
    submissionMethodOptions,
    type ClaimInstruction,
    type RequiredEvidence,
    type SubmissionMethod,
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
  let removalMessage = $state("");

  function addEvidence() {
    requiredEvidence = [...requiredEvidence, { label: "", required: true }];
  }

  function restoreRemovalFocus(
    event: MouseEvent,
    selector: string,
    fallback: string,
    index: number,
  ) {
    const form = (event.currentTarget as HTMLElement).closest("form");
    queueMicrotask(() => {
      const remaining = [
        ...(form?.querySelectorAll<HTMLButtonElement>(selector) ?? []),
      ];
      (
        remaining[Math.min(index, Math.max(0, remaining.length - 1))] ??
        form?.querySelector<HTMLButtonElement>(fallback)
      )?.focus();
    });
  }

  function removeEvidence(index: number, event: MouseEvent) {
    requiredEvidence = requiredEvidence.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    removalMessage = `Removed evidence item ${index + 1}.`;
    restoreRemovalFocus(
      event,
      "[data-evidence-remove]",
      "[data-add-evidence]",
      index,
    );
  }

  function addInstruction() {
    claimInstructions = [
      ...claimInstructions,
      { title: "", detail: "", required: true },
    ];
  }

  function removeInstruction(index: number, event: MouseEvent) {
    claimInstructions = claimInstructions.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    removalMessage = `Removed claim step ${index + 1}.`;
    restoreRemovalFocus(
      event,
      "[data-instruction-remove]",
      "[data-add-instruction]",
      index,
    );
  }
</script>

<fieldset class="sm:col-span-2 lg:col-span-3">
  <legend class="text-xs font-bold text-muted">Submission methods</legend>
  <p class="mt-1 text-xs leading-relaxed text-muted">
    Select every method the provider accepts.
  </p>
  <div class="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
    {#each submissionMethodOptions as option}
      <label
        class="flex min-h-11 items-center gap-2 border border-rule bg-paper px-3 text-sm font-bold text-ink has-checked:border-ink has-checked:bg-blue-soft"
      >
        <input
          type="checkbox"
          value={option.value}
          bind:group={submissionMethods}
          class="size-4 accent-ink"
        />
        {option.label}
      </label>
    {/each}
  </div>
</fieldset>

<fieldset class="sm:col-span-2 lg:col-span-3">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <legend class="text-xs font-bold text-muted">Required evidence</legend>
      <p class="mt-1 text-xs leading-relaxed text-muted">
        Receipts, photos, identifiers, and other material needed to submit.
      </p>
    </div>
    <button
      type="button"
      data-add-evidence
      class="flex min-h-11 items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink"
      onclick={addEvidence}
    >
      <Plus size={15} aria-hidden="true" /> Add evidence
    </button>
  </div>
  {#if requiredEvidence.length}
    <div class="mt-3 grid gap-2">
      {#each requiredEvidence as item, index}
        <div
          class="grid gap-2 border border-rule bg-paper p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
        >
          <label>
            <span class="sr-only">Evidence item {index + 1}</span>
            <input
              bind:value={item.label}
              maxlength="300"
              placeholder="Proof of purchase"
              class="min-h-11 w-full border border-rule bg-sheet px-3 text-sm font-medium outline-none focus:border-ink"
            />
          </label>
          <label
            class="flex min-h-11 items-center gap-2 px-2 text-xs font-bold"
          >
            <input
              type="checkbox"
              bind:checked={item.required}
              class="size-4 accent-ink"
            />
            Required
          </label>
          <button
            type="button"
            data-evidence-remove
            class="grid size-11 place-items-center text-muted hover:bg-red-soft hover:text-red"
            aria-label={`Remove evidence item ${index + 1}`}
            onclick={(event) => removeEvidence(index, event)}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <p
      class="mt-3 border border-dashed border-rule px-3 py-4 text-sm text-muted"
    >
      No provider-specific evidence recorded.
    </p>
  {/if}
</fieldset>

<fieldset class="sm:col-span-2 lg:col-span-3">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <legend class="text-xs font-bold text-muted">Claim checklist</legend>
      <p class="mt-1 text-xs leading-relaxed text-muted">
        Record the filing sequence in the order it should be completed.
      </p>
    </div>
    <button
      type="button"
      data-add-instruction
      class="flex min-h-11 items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink"
      onclick={addInstruction}
    >
      <Plus size={15} aria-hidden="true" /> Add step
    </button>
  </div>
  {#if claimInstructions.length}
    <div class="mt-3 grid gap-3">
      {#each claimInstructions as instruction, index}
        <div class="grid gap-3 border border-rule bg-paper p-3">
          <div class="flex items-start gap-3">
            <span
              class="grid size-7 shrink-0 place-items-center border border-rule text-xs font-bold"
            >
              {index + 1}
            </span>
            <label class="min-w-0 flex-1">
              <span class="sr-only">Step {index + 1} title</span>
              <input
                bind:value={instruction.title}
                maxlength="300"
                placeholder="Contact the provider"
                class="min-h-11 w-full border border-rule bg-sheet px-3 text-sm font-bold outline-none focus:border-ink"
              />
            </label>
            <button
              type="button"
              data-instruction-remove
              class="grid size-11 shrink-0 place-items-center text-muted hover:bg-red-soft hover:text-red"
              aria-label={`Remove claim step ${index + 1}`}
              onclick={(event) => removeInstruction(index, event)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
          <label>
            <span class="sr-only">Step {index + 1} details</span>
            <textarea
              bind:value={instruction.detail}
              maxlength="2000"
              rows="2"
              placeholder="Optional provider-specific details"
              class="min-h-20 w-full border border-rule bg-sheet p-3 text-sm outline-none focus:border-ink"
            ></textarea>
          </label>
          <label class="flex min-h-11 items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              bind:checked={instruction.required}
              class="size-4 accent-ink"
            />
            Required step
          </label>
        </div>
      {/each}
    </div>
  {:else}
    <p
      class="mt-3 border border-dashed border-rule px-3 py-4 text-sm text-muted"
    >
      No provider-specific filing steps recorded.
    </p>
  {/if}
</fieldset>

<p class="sr-only" role="status" aria-live="polite">{removalMessage}</p>
