<script lang="ts">
  import {
    resolveClaimPreset,
    type ClaimAccessPresetId,
  } from "$lib/access-presets";

  type Claim = {
    id: string;
    reference: string;
    issue: string;
    status: string;
    productName: string;
  };

  let {
    claims,
    canGrantAll,
    scope = $bindable(),
    selectedClaimIds = $bindable(),
    activePresetId = $bindable(),
    inputName = "claimId",
  }: {
    claims: readonly Claim[];
    canGrantAll: boolean;
    scope: "all" | "selected";
    selectedClaimIds: string[];
    activePresetId: ClaimAccessPresetId;
    inputName?: string;
  } = $props();

  function apply(preset: Exclude<ClaimAccessPresetId, "manual">) {
    const selection = resolveClaimPreset(preset, claims);
    scope = selection.scope;
    selectedClaimIds = selection.claimIds;
    activePresetId = preset;
  }

  function customize() {
    if (scope === "all") {
      scope = "selected";
      selectedClaimIds = claims.map((claim) => claim.id);
    }
    activePresetId = "manual";
  }
</script>

<fieldset>
  <legend class="sr-only">Claim access scope</legend>
  <div class="grid gap-2 sm:grid-cols-2">
    {#if canGrantAll}
      <label
        class="flex min-h-11 items-center gap-3 border border-rule bg-sheet px-3 text-xs font-bold"
      >
        <input
          type="radio"
          name="claimAccessScope"
          value="all"
          bind:group={scope}
          onchange={() => (activePresetId = "manual")}
          class="size-4 accent-orange"
        />
        All household claims
      </label>
    {/if}
    <label
      class="flex min-h-11 items-center gap-3 border border-rule bg-sheet px-3 text-xs font-bold"
    >
      <input
        type="radio"
        name="claimAccessScope"
        value="selected"
        bind:group={scope}
        onchange={() => (activePresetId = "manual")}
        class="size-4 accent-orange"
      />
      Only selected claims
    </label>
  </div>
</fieldset>

<div
  class="mt-3 flex flex-wrap gap-2"
  role="group"
  aria-label="Claim selection presets"
>
  {#if canGrantAll}
    <button
      type="button"
      aria-pressed={activePresetId === "all"}
      onclick={() => apply("all")}
      class={[
        "min-h-11 border px-3 text-xs font-bold",
        activePresetId === "all"
          ? "border-ink bg-ink text-white"
          : "border-rule bg-sheet hover:border-ink",
      ]}>Every claim</button
    >
  {/if}
  {#each [["open", "Open claims"], ["attention", "Needs attention"], ["none", "None yet"]] as option}
    <button
      type="button"
      aria-pressed={activePresetId === option[0]}
      onclick={() =>
        apply(option[0] as Exclude<ClaimAccessPresetId, "all" | "manual">)}
      class={[
        "min-h-11 border px-3 text-xs font-bold",
        activePresetId === option[0]
          ? "border-ink bg-ink text-white"
          : "border-rule bg-sheet hover:border-ink",
      ]}>{option[1]}</button
    >
  {/each}
</div>

<div
  class="mt-3 max-h-72 overflow-y-auto border-t border-ink"
  role="group"
  aria-label="Available claims"
>
  {#each claims as claim}
    <label
      class="grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-rule py-2 text-xs"
    >
      <input
        name={inputName}
        type="checkbox"
        value={claim.id}
        bind:group={selectedClaimIds}
        onchange={customize}
        class="size-4 accent-orange"
      />
      <span class="min-w-0">
        <span class="block font-bold">{claim.reference}</span>
        <span class="mt-0.5 block truncate text-muted"
          >{claim.productName} · {claim.issue}</span
        >
      </span>
      <span class="text-[11px] font-bold text-muted capitalize"
        >{claim.status.replaceAll("_", " ")}</span
      >
    </label>
  {:else}
    <p class="border-b border-rule py-4 text-xs text-muted">
      No claims exist yet. Restricted accounts automatically gain access to
      claims they create.
    </p>
  {/each}
</div>
<p class="mt-2 text-xs font-semibold text-muted" aria-live="polite">
  {scope === "all"
    ? "All current and future claims"
    : `${selectedClaimIds.length} existing claim${selectedClaimIds.length === 1 ? "" : "s"} selected`}
</p>
