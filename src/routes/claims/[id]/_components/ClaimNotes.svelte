<script lang="ts">
  import { MessageSquareText } from "lucide-svelte";
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";
  import type { ClaimNote } from "./types";

  let {
    claimId,
    initialNotes,
    canWrite,
  }: { claimId: string; initialNotes: ClaimNote[]; canWrite: boolean } =
    $props();
  const startingNotes = () => initialNotes;
  let notes = $state(startingNotes());
  let note = $state("");
  let adding = $state(false);
  let message = $state("");
  let error = $state("");

  async function addNote() {
    if (!note.trim() || adding) return;
    adding = true;
    message = "";
    error = "";
    try {
      const response = await dominoApi.api.v1.claims[":id"].notes.$post({
        param: { id: claimId },
        json: { body: note.trim() },
      });
      if (!response.ok) {
        error = await responseError(response, "The note could not be added.");
        return;
      }
      const result = (await response.json()) as unknown as {
        note: {
          id: string;
          body: string;
          createdAt: string;
          updatedAt?: string;
        };
      };
      notes = [
        {
          id: result.note.id,
          body: result.note.body,
          createdAt: new Date(result.note.createdAt),
          updatedAt: new Date(result.note.updatedAt ?? result.note.createdAt),
          authorName: "You",
        },
        ...notes,
      ];
      note = "";
      message = "Claim note added.";
    } catch (cause) {
      error = networkError(cause, "The note could not be added.");
    } finally {
      adding = false;
    }
  }
</script>

<section aria-labelledby="notes-heading">
  <h2 id="notes-heading" class="text-xl font-bold">Claim notes</h2>
  {#if canWrite}
    <div class="mt-4 border border-rule bg-sheet p-4">
      <label for="claim-note" class="text-xs font-bold text-muted uppercase"
        >Add a durable note</label
      >
      <textarea
        id="claim-note"
        bind:value={note}
        class="mt-2 min-h-24 w-full bg-paper p-3 text-sm"
        placeholder="Record a call, request, deadline, or decision…"></textarea>
      <button
        onclick={addNote}
        disabled={!note.trim() || adding}
        class="mt-2 flex min-h-11 items-center justify-center gap-2 bg-ink px-4 text-xs font-bold text-white disabled:opacity-40"
      >
        <MessageSquareText size={15} />
        {adding ? "Adding…" : "Add note"}
      </button>
    </div>
  {/if}

  {#if error}
    <div
      role="alert"
      class="mt-3 border border-red bg-red-soft p-4 text-sm text-red"
    >
      {error}
    </div>
  {/if}
  {#if message}
    <div
      role="status"
      class="mt-3 border border-green/30 bg-green-soft p-4 text-sm text-green"
    >
      {message}
    </div>
  {/if}

  {#if notes.length}
    <div class="mt-3 border-t border-rule">
      {#each notes as item}
        <article class="border-b border-rule py-4">
          <p class="whitespace-pre-line text-sm leading-relaxed">{item.body}</p>
          <p class="mt-2 text-xs text-muted">
            {item.authorName ?? "Household"}
            {item.createdAt
              ? ` · ${new Date(item.createdAt).toLocaleString()}`
              : ""}
          </p>
        </article>
      {/each}
    </div>
  {:else}
    <p class="mt-3 border-t border-rule py-4 text-sm text-muted">
      No claim notes have been added.
    </p>
  {/if}
</section>
