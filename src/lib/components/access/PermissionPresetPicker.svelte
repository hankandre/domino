<script lang="ts">
  type Preset = {
    id: string;
    label: string;
    description: string;
    permissions: readonly string[];
  };

  let {
    presets,
    selected = $bindable(),
    activePresetId = $bindable(),
    compact = false,
  }: {
    presets: readonly Preset[];
    selected: string[];
    activePresetId: string | null;
    compact?: boolean;
  } = $props();

  function apply(preset: Preset) {
    selected = [...preset.permissions];
    activePresetId = preset.id;
  }
</script>

<div
  class={compact ? "flex flex-wrap gap-2" : "grid gap-2 sm:grid-cols-2"}
  role="group"
  aria-label="Permission presets"
>
  {#each presets as preset}
    <button
      type="button"
      aria-pressed={activePresetId === preset.id}
      onclick={() => apply(preset)}
      class={[
        "border text-left font-bold transition-colors",
        compact ? "min-h-11 px-3 text-xs" : "min-h-18 p-3 text-sm",
        activePresetId === preset.id
          ? "border-ink bg-ink text-white"
          : "border-rule bg-sheet hover:border-ink",
      ]}
    >
      <span class="block">{preset.label}</span>
      {#if !compact}
        <span
          class={[
            "mt-1 block text-xs leading-relaxed",
            activePresetId === preset.id ? "text-white/75" : "text-muted",
          ]}>{preset.description}</span
        >
      {/if}
    </button>
  {/each}
</div>
