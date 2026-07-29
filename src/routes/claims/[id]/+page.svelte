<script lang="ts">
  import {
    ArrowLeft,
    Check,
    Circle,
    ExternalLink,
    FilePlus2,
    FileText,
    Mail,
    MessageSquareText,
    Phone,
    Send,
  } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { untrack } from "svelte";

  let { data } = $props();
  const claimStatuses = [
    "draft",
    "needs_evidence",
    "submitted",
    "in_review",
    "approved",
    "denied",
    "resolved",
    "closed",
  ] as const;
  let status = $state<string>(untrack(() => data.claim.status));
  let saving = $state(false);
  let uploading = $state(false);
  let note = $state("");
  let notes = $state(untrack(() => data.claim.notes ?? []));
  let nextAction = $state(untrack(() => data.claim.nextAction ?? ""));
  let resolution = $state(untrack(() => data.claim.resolution ?? ""));
  let message = $state("");
  let errorMessage = $state("");
  const warranty = untrack(() => data.claim.warranty);
  const events = untrack(() => data.claim.events ?? []);
  const documents = untrack(() => data.claim.documents ?? []);

  function statusTone(value: string) {
    if (value === "needs_evidence" || value === "denied") return "danger";
    if (value === "approved" || value === "resolved") return "success";
    if (value === "draft" || value === "closed") return "neutral";
    return "info";
  }

  async function updateStatus() {
    if (status === "resolved" && !resolution.trim()) {
      errorMessage = "Record the outcome before marking the claim resolved.";
      return;
    }
    saving = true;
    message = "";
    errorMessage = "";
    const response = await fetch(`/api/v1/claims/${data.claim.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        nextAction: nextAction.trim() || null,
        resolution: resolution.trim() || null,
        explanation: `Claim moved to ${status.replaceAll("_", " ")}.`,
      }),
    });
    saving = false;
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      errorMessage = result.error ?? "The claim status could not be updated.";
      return;
    }
    message = "Claim status updated.";
    if (!data.demoMode) location.reload();
  }

  async function saveDetails() {
    saving = true;
    message = "";
    errorMessage = "";
    const response = await fetch(`/api/v1/claims/${data.claim.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nextAction: nextAction.trim() || null,
        resolution: resolution.trim() || null,
        explanation: "Claim details updated.",
      }),
    });
    saving = false;
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      errorMessage = result.error ?? "The claim details could not be saved.";
      return;
    }
    message = "Claim details saved.";
  }

  async function uploadEvidence(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploading = true;
    message = "";
    errorMessage = "";
    const body = new FormData();
    body.set("file", file);
    body.set("claimId", data.claim.id);
    body.set("productId", data.claim.productId);
    body.set("kind", "claim");
    const response = await fetch("/api/v1/documents", {
      method: "POST",
      body,
    });
    uploading = false;
    input.value = "";
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      errorMessage = result.error ?? "The evidence could not be attached.";
      return;
    }
    message = "Evidence attached.";
    if (!data.demoMode) location.reload();
  }

  async function addNote() {
    if (!note.trim()) return;
    message = "";
    errorMessage = "";
    const response = await fetch(`/api/v1/claims/${data.claim.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: note.trim() }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      errorMessage = result.error ?? "The note could not be added.";
      return;
    }
    const result = await response.json();
    notes = [{ ...result.note, authorName: "You" }, ...notes];
    note = "";
    message = "Claim note added.";
  }
</script>

<div
  class="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <a
    href="/claims"
    class="mb-6 inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
  >
    <ArrowLeft size={17} /> Claims
  </a>
  <PageHeader
    kicker={`Claim ${data.claim.reference}`}
    title={data.claim.issue}
    description={`${data.claim.product.brand ?? ""} ${data.claim.product.name} · opened ${new Date(data.claim.createdAt).toLocaleDateString()}`}
  >
    <StatusBadge tone={statusTone(status)}
      >{status.replaceAll("_", " ")}</StatusBadge
    >
  </PageHeader>

  {#if errorMessage}
    <div
      role="alert"
      class="mt-6 border border-red bg-red-soft p-4 text-sm text-red"
    >
      {errorMessage}
    </div>
  {/if}
  {#if message}
    <div
      role="status"
      class="mt-6 border border-green/30 bg-green-soft p-4 text-sm text-green"
    >
      {message}
    </div>
  {/if}

  <div class="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div class="space-y-8">
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
                    class={`grid size-9 place-items-center rounded-full ${index === events.length - 1 ? "bg-orange text-white" : "bg-green text-white"}`}
                  >
                    {#if event.eventType === "document_attached"}<FilePlus2
                        size={16}
                      />
                    {:else if event.eventType === "note_added"}<MessageSquareText
                        size={15}
                      />
                    {:else}<Check size={16} />{/if}
                  </span>
                  {#if index < events.length - 1}<span
                      class="h-full w-px bg-rule"
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
                <p class="mt-1 text-sm text-muted">{data.claim.issue}</p>
                <p class="mt-2 text-xs text-muted">
                  {new Date(data.claim.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          {/if}
        </ol>
      </section>

      <section
        aria-labelledby="guidance-heading"
        class="border border-ink bg-sheet p-5"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >
              Provider guidance
            </p>
            <h2 id="guidance-heading" class="mt-1 text-xl font-bold">
              File with {warranty?.provider ??
                data.claim.product.brand ??
                "the provider"}
            </h2>
          </div>
          {#if warranty?.claimDeadline}
            <div
              class="border border-orange/30 bg-orange-soft px-3 py-2 text-xs"
            >
              <span class="font-bold">Deadline</span>
              <span class="ml-1"
                >{new Date(
                  `${warranty.claimDeadline}T00:00:00`,
                ).toLocaleDateString()}</span
              >
            </div>
          {/if}
        </div>

        {#if warranty?.eligibilityNotes}
          <div class="mt-5 border-y border-rule py-4">
            <h3
              class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >
              Eligibility notes
            </h3>
            <p class="mt-2 whitespace-pre-line text-sm leading-relaxed">
              {warranty.eligibilityNotes}
            </p>
          </div>
        {/if}

        <ol class="mt-5 border-t border-rule">
          {#if warranty?.claimInstructions?.length}
            {#each warranty.claimInstructions as instruction, index}
              <li
                class="grid grid-cols-[30px_1fr] gap-3 border-b border-rule py-4"
              >
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
              No provider-specific checklist is recorded. Confirm coverage,
              gather the receipt and product identifiers, document the problem,
              and verify the provider’s submission requirements.
            </li>
          {/if}
        </ol>
      </section>

      <section aria-labelledby="evidence-heading">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="evidence-heading" class="text-xl font-bold">
              Evidence and documents
            </h2>
            <p class="mt-1 text-sm text-muted">
              Files attached here remain associated with this claim.
            </p>
          </div>
          <label
            class="inline-flex min-h-10 cursor-pointer items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink"
          >
            <FilePlus2 size={15} />
            {uploading ? "Uploading…" : "Attach evidence"}
            <input
              type="file"
              class="sr-only"
              accept="image/*,.pdf"
              disabled={uploading}
              onchange={uploadEvidence}
            />
          </label>
        </div>
        {#if documents.length}
          <div class="mt-4 border-t border-ink">
            {#each documents as document}
              <a
                href={document.backend === "paperless"
                  ? (document.paperlessUrl ?? "#")
                  : `/api/v1/documents/${document.id}/content`}
                target="_blank"
                rel="noreferrer"
                class="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-rule py-4"
              >
                <span
                  class="grid size-9 place-items-center bg-blue-soft text-[#294968]"
                  ><FileText size={17} /></span
                >
                <span>
                  <span class="block text-sm font-bold">{document.name}</span>
                  <span class="mt-1 block text-xs text-muted"
                    >{document.kind} · {document.backend === "paperless"
                      ? "Paperless-ngx"
                      : "Domino storage"}</span
                  >
                </span>
                <ExternalLink size={15} class="text-muted" />
              </a>
            {/each}
          </div>
        {:else}
          <div
            class="mt-4 border border-dashed border-muted/50 bg-sheet p-5 text-sm text-muted"
          >
            No evidence is attached yet.
          </div>
        {/if}
      </section>

      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading" class="text-xl font-bold">Claim notes</h2>
        <div class="mt-4 border border-rule bg-sheet p-4">
          <label for="claim-note" class="text-xs font-bold text-muted uppercase"
            >Add a durable note</label
          >
          <textarea
            id="claim-note"
            bind:value={note}
            class="mt-2 min-h-24 w-full bg-paper p-3 text-sm"
            placeholder="Record a call, request, deadline, or decision…"
          ></textarea>
          <button
            onclick={addNote}
            disabled={!note.trim()}
            class="mt-2 flex min-h-10 items-center justify-center gap-2 bg-ink px-4 text-xs font-bold text-white disabled:opacity-40"
          >
            <MessageSquareText size={15} /> Add note
          </button>
        </div>
        {#if notes.length}
          <div class="mt-3 border-t border-rule">
            {#each notes as item}
              <article class="border-b border-rule py-4">
                <p class="whitespace-pre-line text-sm leading-relaxed">
                  {item.body}
                </p>
                <p class="mt-2 text-xs text-muted">
                  {item.authorName ?? "Household"}
                  {item.createdAt
                    ? ` · ${new Date(item.createdAt).toLocaleString()}`
                    : ""}
                </p>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <aside class="space-y-5">
      <section class="border border-ink bg-sheet p-5">
        <h2 class="text-lg font-bold tracking-[-0.02em]">Manage claim</h2>
        <label class="mt-4 block text-xs font-bold text-muted uppercase">
          Status
          <select
            bind:value={status}
            class="mt-2 min-h-11 w-full border border-rule bg-paper px-3 text-sm font-bold text-ink normal-case"
          >
            {#each claimStatuses as option}
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
          onclick={saveDetails}
          disabled={saving}
          class="mt-3 min-h-10 w-full border border-rule text-xs font-bold hover:border-ink"
        >
          Save details
        </button>
        <button
          onclick={updateStatus}
          disabled={saving}
          class="mt-2 flex min-h-11 w-full items-center justify-center gap-2 bg-ink text-xs font-bold text-white hover:bg-orange"
        >
          {#if status === "submitted"}<Send size={15} />{:else}<Circle
              size={14}
            />{/if}
          Apply status
        </button>
      </section>

      <section class="border border-rule bg-sheet p-5">
        <h2 class="text-lg font-bold">Provider contact</h2>
        <dl class="mt-4 border-t border-rule text-sm">
          <div class="border-b border-rule py-3">
            <dt class="text-xs text-muted">Provider</dt>
            <dd class="mt-1 font-bold">
              {warranty?.provider ?? "Not recorded"}
            </dd>
          </div>
          <div class="border-b border-rule py-3">
            <dt class="text-xs text-muted">Claim phone</dt>
            <dd class="mt-1 font-bold">
              {warranty?.claimPhone ?? "Not recorded"}
            </dd>
          </div>
          <div class="py-3">
            <dt class="text-xs text-muted">Claim email</dt>
            <dd class="mt-1 break-all font-bold">
              {warranty?.claimEmail ?? "Not recorded"}
            </dd>
          </div>
        </dl>
        {#if warranty?.claimPhone}
          <a
            href={`tel:${warranty.claimPhone}`}
            class="mt-3 flex min-h-11 items-center justify-center gap-2 border border-rule text-xs font-bold"
          >
            <Phone size={15} /> Call provider
          </a>
        {/if}
        {#if warranty?.claimEmail}
          <a
            href={`mailto:${warranty.claimEmail}`}
            class="mt-2 flex min-h-11 items-center justify-center gap-2 border border-rule text-xs font-bold"
          >
            <Mail size={15} /> Email provider
          </a>
        {/if}
        {#if warranty?.claimUrl}
          <a
            href={warranty.claimUrl}
            target="_blank"
            rel="noreferrer"
            class="mt-2 flex min-h-11 items-center justify-center gap-2 border border-rule text-xs font-bold"
          >
            Open claim site <ExternalLink size={14} />
          </a>
        {/if}
      </section>

      <section class="border border-rule bg-sheet p-4 text-sm">
        <h2 class="font-bold">Incident details</h2>
        <dl class="mt-3 border-t border-rule">
          <div class="border-b border-rule py-3">
            <dt class="text-xs text-muted">Date noticed</dt>
            <dd class="mt-1 font-semibold">
              {data.claim.noticedAt
                ? new Date(
                    `${data.claim.noticedAt}T00:00:00`,
                  ).toLocaleDateString()
                : "Not recorded"}
            </dd>
          </div>
          <div class="py-3">
            <dt class="text-xs text-muted">Preferred outcome</dt>
            <dd class="mt-1 font-semibold">
              {data.claim.preferredResolution?.replaceAll("_", " ") ??
                "Not recorded"}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  </div>
</div>
