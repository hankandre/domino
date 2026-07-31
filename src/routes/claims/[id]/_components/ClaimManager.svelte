<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Circle, Send } from "lucide-svelte";
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";

  type ClaimStatus =
    | "draft"
    | "needs_evidence"
    | "submitted"
    | "in_review"
    | "approved"
    | "denied"
    | "resolved"
    | "closed";

  type Claim = {
    id: string;
    status: string;
    nextAction?: string | null;
    resolution?: string | null;
  };

  let { claim, demoMode }: { claim: Claim; demoMode: boolean } = $props();
  const initialClaim = () => claim;
  const statuses = [
    "draft",
    "needs_evidence",
    "submitted",
    "in_review",
    "approved",
    "denied",
    "resolved",
    "closed",
  ] as const satisfies readonly ClaimStatus[];
  let status = $state<ClaimStatus>(
    statuses.includes(initialClaim().status as ClaimStatus)
      ? (initialClaim().status as ClaimStatus)
      : "draft",
  );
  let nextAction = $state(initialClaim().nextAction ?? "");
  let resolution = $state(initialClaim().resolution ?? "");
  let pending = $state(false);
  let message = $state("");
  let error = $state("");

  async function save(includeStatus: boolean) {
    if (pending) return;
    if (includeStatus && status === "resolved" && !resolution.trim()) {
      error = "Record the outcome before marking the claim resolved.";
      return;
    }
    pending = true;
    message = "";
    error = "";
    try {
      const response = await dominoApi.api.v1.claims[":id"].$patch({
        param: { id: claim.id },
        json: {
          ...(includeStatus ? { status } : {}),
          nextAction: nextAction.trim() || null,
          resolution: resolution.trim() || null,
          explanation: includeStatus
            ? `Claim moved to ${status.replaceAll("_", " ")}.`
            : "Claim details updated.",
        },
      });
      if (!response.ok) {
        error = await responseError(
          response,
          includeStatus
            ? "The claim status could not be updated."
            : "The claim details could not be saved.",
        );
        return;
      }
      message = includeStatus
        ? "Claim status updated."
        : "Claim details saved.";
      if (!demoMode) await invalidateAll();
    } catch (cause) {
      error = networkError(cause, "The claim could not be updated.");
    } finally {
      pending = false;
    }
  }
</script>

<section class="border border-ink bg-sheet p-5">
  <h2 class="text-lg font-bold tracking-[-0.02em]">Manage claim</h2>
  {#if error}
    <p role="alert" class="mt-3 text-sm font-semibold text-red">{error}</p>
  {/if}
  {#if message}
    <p role="status" class="mt-3 text-sm font-semibold text-green">{message}</p>
  {/if}
  <label class="mt-4 block text-xs font-bold text-muted uppercase">
    Status
    <select
      bind:value={status}
      class="mt-2 min-h-11 w-full border border-rule bg-paper px-3 text-sm font-bold text-ink normal-case"
    >
      {#each statuses as option}
        <option value={option}>{option.replaceAll("_", " ")}</option>
      {/each}
    </select>
  </label>
  <label class="mt-4 block text-xs font-bold text-muted uppercase">
    Next action
    <textarea
      bind:value={nextAction}
      class="mt-2 min-h-20 w-full bg-paper p-3 text-sm font-normal text-ink normal-case"
    ></textarea>
  </label>
  <label class="mt-4 block text-xs font-bold text-muted uppercase">
    Resolution
    <textarea
      bind:value={resolution}
      class="mt-2 min-h-20 w-full bg-paper p-3 text-sm font-normal text-ink normal-case"
      placeholder="Repair, replacement, refund, denial, or another outcome…"
    ></textarea>
  </label>
  <button
    type="button"
    onclick={() => save(false)}
    disabled={pending}
    class="mt-3 min-h-11 w-full border border-rule text-xs font-bold hover:border-ink disabled:opacity-45"
  >
    {pending ? "Saving…" : "Save details"}
  </button>
  <button
    type="button"
    onclick={() => save(true)}
    disabled={pending}
    class="mt-2 flex min-h-11 w-full items-center justify-center gap-2 bg-ink text-xs font-bold text-white hover:bg-orange disabled:opacity-45"
  >
    {#if status === "submitted"}<Send size={15} />{:else}<Circle
        size={14}
      />{/if}
    Apply status
  </button>
</section>
