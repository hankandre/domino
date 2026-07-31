<script lang="ts">
  import { Check, KeyRound, ShieldCheck } from "lucide-svelte";
  import { page } from "$app/state";
  import PermissionPresetPicker from "$lib/components/access/PermissionPresetPicker.svelte";
  import ClaimAccessPicker from "$lib/components/access/ClaimAccessPicker.svelte";
  import type { ClaimAccessPresetId } from "$lib/access-presets";
  import { dominoApi } from "$lib/api-client";
  import type { Permission } from "$lib/server/auth/permissions";

  let { data } = $props();
  let code = $state(page.url.searchParams.get("code") ?? "");
  let approvalState = $state<"idle" | "submitting" | "approved" | "error">(
    "idle",
  );
  let message = $state("");
  let approvalConfirmation = $state<HTMLElement>();
  const grantLabels = [
    ["products:read", "View products"],
    ["products:create", "Add products"],
    ["products:manage", "Edit and archive products"],
    ["warranties:read", "View warranties"],
    ["warranties:create", "Add warranties"],
    ["warranties:manage", "Edit warranties"],
    ["claims:read", "Read claims"],
    ["claims:create", "Create claim drafts"],
    ["claims:manage", "Manage claim status"],
    ["documents:read", "Read documents"],
    ["documents:attach", "Attach documents"],
    ["documents:manage", "Remove and restore documents"],
    ["images:attach", "Attach product images"],
    ["paperless:discover", "Search and link Paperless documents"],
    ["notes:read", "Read notes"],
    ["notes:write", "Add notes"],
  ] as const;
  const grants = grantLabels.filter(([permission]) =>
    data.grantablePermissions.includes(permission),
  );
  function initialPermissions() {
    const preset =
      data.permissionPresets.find((candidate) => candidate.id === "inventory") ??
      data.permissionPresets[0];
    return [...(preset?.permissions ?? [])];
  }
  function initialClaimIds() {
    return data.claims
      .filter((claim) => !["resolved", "closed"].includes(claim.status))
      .map((claim) => claim.id);
  }
  let selected = $state<Permission[]>(initialPermissions());
  let activePermissionPresetId = $state<string | null>("inventory");
  let claimAccessScope = $state<"all" | "selected">("selected");
  let selectedClaimIds = $state<string[]>(initialClaimIds());
  let activeClaimPresetId = $state<ClaimAccessPresetId>("open");

  $effect(() => {
    if (approvalState === "approved") {
      queueMicrotask(() => approvalConfirmation?.focus());
    }
  });

  async function approve() {
    approvalState = "submitting";
    message = "";
    try {
      const response = await dominoApi.api.device.approve.$post({
        json: {
          userCode: code,
          permissions: selected,
          claimAccessScope,
          claimIds: claimAccessScope === "selected" ? selectedClaimIds : [],
        },
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        name?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          body?.error ?? `Approval failed with status ${response.status}.`,
        );
      }
      approvalState = "approved";
      message = `${body?.name ?? "The agent"} can now finish signing in.`;
    } catch (cause) {
      approvalState = "error";
      message =
        cause instanceof Error
          ? cause.message
          : "The code could not be approved. Check your connection and try again.";
    } finally {
      if (approvalState === "submitting") approvalState = "idle";
    }
  }
</script>

<svelte:head><title>Connect an agent · Domino</title></svelte:head>

<div class="grid min-h-screen place-items-center px-4 py-10">
  <section
    aria-labelledby="device-approval-heading"
    class="w-full max-w-3xl border border-ink bg-sheet p-6 shadow-sheet sm:p-8"
  >
    <span class="grid size-11 place-items-center bg-ink text-white"
      ><KeyRound size={20} /></span
    >
    <p class="mt-6 text-xs font-bold tracking-[0.07em] text-muted uppercase">
      CLI authorization
    </p>
    <h1 id="device-approval-heading" class="mt-2 text-3xl font-bold tracking-[-0.035em]">
      Approve this device
    </h1>
    <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
      Start with a useful template, then adjust individual permissions and
      claims. Only approve a code shown by a Domino CLI you started.
    </p>

    {#if approvalState === "approved"}
      <div
        bind:this={approvalConfirmation}
        class="mt-6 flex gap-3 bg-green-soft p-4 text-green outline-none focus-visible:ring-2 focus-visible:ring-ink"
        role="status"
        tabindex="-1"
      >
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

        <fieldset class="mt-6 border-t border-rule">
          <legend
            class="pt-5 text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >Start with a permission template</legend
          >
          <div class="mt-3">
            <PermissionPresetPicker
              presets={data.permissionPresets}
              bind:selected
              bind:activePresetId={activePermissionPresetId}
            />
          </div>
          <details class="mt-3 border-t border-rule pt-3">
            <summary class="cursor-pointer text-xs font-bold"
              >Customize {selected.length} permissions</summary
            >
            <div class="mt-2 grid sm:grid-cols-2 lg:grid-cols-3">
              {#each grants as grant}
                <label
                  class="flex min-h-11 items-center gap-2 border-b border-rule text-xs"
                >
                  <input
                    type="checkbox"
                    value={grant[0]}
                    bind:group={selected}
                    onchange={() => (activePermissionPresetId = null)}
                    class="size-4 accent-orange"
                  />
                  {grant[1]}
                </label>
              {/each}
            </div>
          </details>
        </fieldset>

        <fieldset class="mt-6 border-t border-rule">
          <legend
            class="pt-5 text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >Choose visible claims</legend
          >
          <p class="mt-2 max-w-2xl text-xs leading-relaxed text-muted">
            Templates select a starting set. You can add or remove any claim
            below before approving the agent.
          </p>
          <ClaimAccessPicker
            claims={data.claims}
            canGrantAll={data.canGrantAllClaims}
            bind:scope={claimAccessScope}
            bind:selectedClaimIds
            bind:activePresetId={activeClaimPresetId}
            inputName=""
          />
        </fieldset>

        {#if approvalState === "error"}<p
            class="mt-4 text-sm font-semibold text-red"
            role="alert"
          >
            {message}
          </p>{/if}
        <button
          disabled={approvalState === "submitting" || selected.length === 0}
          class="mt-5 flex min-h-12 w-full items-center justify-center gap-2 bg-ink text-sm font-bold text-white disabled:opacity-50"
        >
          <ShieldCheck size={17} />
          {approvalState === "submitting" ? "Approving…" : "Approve device"}
        </button>
      </form>
    {/if}
  </section>
</div>
