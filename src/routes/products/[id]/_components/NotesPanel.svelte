<script lang="ts">
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
  import type { ProductNote } from "./types";

  let {
    productId,
    initialNotes,
    canWrite,
  }: { productId: string; initialNotes: ProductNote[]; canWrite: boolean } =
    $props();

  const present = (source: ProductNote[]) =>
    source.map((item) => ({
      id: item.id,
      author: item.authorName ?? "Household",
      date: new Date(item.createdAt).toLocaleDateString(),
      body: item.body,
    }));
  const startingNotes = () => initialNotes;
  let note = $state("");
  let notes = $state(present(startingNotes()));
  let adding = $state(false);
  let message = $state("");
  let error = $state("");

  async function addNote() {
    if (!note.trim() || adding) return;
    adding = true;
    message = "";
    error = "";
    try {
      const response = await dominoApi.api.v1.products[":id"].notes.$post({
        param: { id: productId },
        json: { body: note.trim() },
      });
      if (!response.ok) {
        error = await responseError(response, "The note could not be added.");
        return;
      }
      const result = (await response.json()) as { note: ProductNote };
      notes = [
        {
          id: result.note.id,
          author: "You",
          date: "Just now",
          body: result.note.body,
        },
        ...notes,
      ];
      note = "";
      message = "Note added.";
    } catch (cause) {
      error = networkError(cause, "The note could not be added.");
    } finally {
      adding = false;
    }
  }
</script>

<section aria-labelledby="notes-heading">
  <div class="mb-4">
    <h2 id="notes-heading" class="text-2xl font-bold tracking-[-0.03em]">
      Notes
    </h2>
    <p class="mt-1 text-sm text-muted">
      Shared context for the household and approved agents.
    </p>
  </div>
  {#if canWrite}
    <div class="border border-rule bg-sheet p-4">
      <label
        for="new-note"
        class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
        >Add a note</label
      >
      <textarea
        id="new-note"
        bind:value={note}
        class="mt-2 min-h-24 w-full resize-y border-0 bg-paper p-3 text-sm leading-relaxed outline-none"
        placeholder="Record a symptom, phone call, repair attempt, or decision…"
      ></textarea>
      <div class="mt-3 flex justify-end">
        <button
          class="min-h-11 bg-ink px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!note.trim() || adding}
          onclick={addNote}
        >
          {adding ? "Saving…" : "Save note"}
        </button>
      </div>
    </div>
  {/if}

  {#if error}
    <div class="mt-3"><AsyncNotice tone="error">{error}</AsyncNotice></div>
  {/if}
  {#if message}
    <div class="mt-3"><AsyncNotice tone="success">{message}</AsyncNotice></div>
  {/if}

  <div class="mt-3 border-t border-rule">
    {#each notes as item}
      <article
        class="grid gap-2 border-b border-rule py-5 sm:grid-cols-[130px_1fr]"
      >
        <div class="text-xs">
          <div class="font-bold">{item.author}</div>
          <div class="mt-1 text-muted">{item.date}</div>
        </div>
        <p class="max-w-[72ch] whitespace-pre-wrap text-sm leading-relaxed">
          {item.body}
        </p>
      </article>
    {:else}
      <p class="border-b border-rule py-5 text-sm text-muted">
        No household notes have been added.
      </p>
    {/each}
  </div>
</section>
