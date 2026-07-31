<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tone,
    children,
  }: { tone: "error" | "success" | "info"; children: Snippet } = $props();
</script>

<div
  role={tone === "error" ? "alert" : "status"}
  aria-live={tone === "error" ? "assertive" : "polite"}
  class={[
    "border p-4 text-sm font-semibold",
    tone === "error"
      ? "border-red bg-red-soft text-red"
      : tone === "success"
        ? "border-green/30 bg-green-soft text-green"
        : "border-blue-border bg-blue-soft text-blue-ink",
  ]}
>
  {@render children()}
</div>
