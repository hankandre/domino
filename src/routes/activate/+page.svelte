<script lang="ts">
  import { Check, KeyRound, ShieldCheck } from "lucide-svelte";
  import { page } from "$app/state";

  let code = $state(page.url.searchParams.get("code") ?? "");
  let approvalState = $state<"idle" | "submitting" | "approved" | "error">(
    "idle",
  );
  let message = $state("");
  const grants = [
    ["warranties:read", "Read products and warranties"],
    ["claims:read", "Read claims"],
    ["claims:create", "Create claim drafts"],
    ["claims:manage", "Manage claim status"],
    ["documents:read", "Read documents"],
    ["documents:attach", "Attach documents"],
    ["notes:read", "Read notes"],
    ["notes:write", "Add notes"],
  ];
  let selected = $state([
    "warranties:read",
    "claims:read",
    "claims:create",
    "documents:read",
    "notes:read",
    "notes:write",
  ]);

  async function approve() {
    approvalState = "submitting";
    const response = await fetch("/api/device/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userCode: code, permissions: selected }),
    });
    const body = await response.json();
    if (response.ok) {
      approvalState = "approved";
      message = `${body.name} can now finish signing in.`;
    } else {
      approvalState = "error";
      message = body.error ?? "The code could not be approved.";
    }
  }
</script>

<div class="grid min-h-screen place-items-center px-4 py-10">
  <main
    class="w-full max-w-lg border border-ink bg-sheet p-6 shadow-sheet sm:p-8"
  >
    <span class="grid size-11 place-items-center bg-ink text-white"
      ><KeyRound size={20} /></span
    >
    <p class="mt-6 text-xs font-bold tracking-[0.07em] text-muted uppercase">
      CLI authorization
    </p>
    <h1 class="mt-2 text-3xl font-bold tracking-[-0.035em]">
      Approve this device
    </h1>
    <p class="mt-3 text-sm leading-relaxed text-muted">
      Only approve a code shown by a Domino CLI you started. Permissions remain
      controlled by the service account.
    </p>

    {#if approvalState === "approved"}
      <div class="mt-6 flex gap-3 bg-green-soft p-4 text-green">
        <Check class="shrink-0" size={20} />
        <div>
          <div class="font-bold">Device approved</div>
          <p class="mt-1 text-sm">{message}</p>
        </div>
      </div>
    {:else}
      <form
        class="mt-6"
        onsubmit={(event) => {
          event.preventDefault();
          approve();
        }}
      >
        <label
          for="code"
          class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >One-time code</label
        >
        <input
          id="code"
          bind:value={code}
          required
          class="mt-2 min-h-13 w-full border border-ink bg-paper px-4 text-center text-xl font-bold tracking-[0.16em] uppercase outline-none"
          placeholder="A1B2C3D4"
        />
        <fieldset class="mt-5 border-t border-rule">
          <legend
            class="pt-4 text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >Grant permissions</legend
          >
          <div class="mt-2 grid sm:grid-cols-2">
            {#each grants as grant}
              <label
                class="flex min-h-10 items-center gap-2 border-b border-rule text-xs"
              >
                <input
                  type="checkbox"
                  value={grant[0]}
                  bind:group={selected}
                  class="size-4 accent-orange"
                />
                {grant[1]}
              </label>
            {/each}
          </div>
        </fieldset>
        {#if approvalState === "error"}<p
            class="mt-3 text-sm font-semibold text-red"
            role="alert"
          >
            {message}
          </p>{/if}
        <button
          disabled={approvalState === "submitting"}
          class="mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-ink text-sm font-bold text-white disabled:opacity-50"
        >
          <ShieldCheck size={17} />
          {approvalState === "submitting" ? "Approving…" : "Approve device"}
        </button>
      </form>
    {/if}
  </main>
</div>
