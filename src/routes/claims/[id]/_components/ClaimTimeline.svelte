<script lang="ts">
  import { Check, FilePlus2, MessageSquareText } from "lucide-svelte";
  import type { ClaimEvent } from "./types";

  let {
    events,
    issue,
    createdAt,
  }: { events: ClaimEvent[]; issue: string; createdAt: Date | string } =
    $props();
</script>

<section aria-labelledby="timeline-heading">
  <h2 id="timeline-heading" class="text-xl font-bold tracking-[-0.025em]">
    Claim timeline
  </h2>
  <ol class="mt-5">
    {#if events.length}
      {#each events as event, index}
        <li class="grid grid-cols-[40px_1fr] gap-4">
          <div class="flex flex-col items-center">
            <span
              class={[
                "grid size-9 place-items-center rounded-full text-white",
                index === events.length - 1 ? "bg-orange" : "bg-green",
              ]}
            >
              {#if event.eventType === "document_attached"}<FilePlus2
                  size={16}
                />
              {:else if event.eventType === "note_added"}<MessageSquareText
                  size={15}
                />
              {:else}<Check size={16} />{/if}
            </span>
            {#if index < events.length - 1}<span class="h-full w-px bg-rule"
              ></span>{/if}
          </div>
          <div class="pb-8">
            <div class="font-bold">{event.title}</div>
            {#if event.detail}<p
                class="mt-1 whitespace-pre-line text-sm text-muted"
              >
                {event.detail}
              </p>{/if}
            <p class="mt-2 text-xs text-muted">
              {new Date(event.occurredAt).toLocaleString()}
              {event.actorName ? ` · ${event.actorName}` : ""}
            </p>
          </div>
        </li>
      {/each}
    {:else}
      <li class="grid grid-cols-[40px_1fr] gap-4">
        <span
          class="grid size-9 place-items-center rounded-full bg-green text-white"
          ><Check size={16} /></span
        >
        <div>
          <div class="font-bold">Claim opened</div>
          <p class="mt-1 text-sm text-muted">{issue}</p>
          <p class="mt-2 text-xs text-muted">
            {new Date(createdAt).toLocaleString()}
          </p>
        </div>
      </li>
    {/if}
  </ol>
</section>
