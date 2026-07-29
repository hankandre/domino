<script lang="ts">
  let {
    tone = "neutral",
    children,
  }: {
    tone?: "neutral" | "attention" | "danger" | "success" | "info";
    children: import("svelte").Snippet;
  } = $props();

  const styles = {
    neutral: "border-rule bg-paper text-ink",
    attention: "border-orange/30 bg-orange-soft text-[#99330f]",
    danger: "border-red/25 bg-red-soft text-red",
    success: "border-green/25 bg-green-soft text-green",
    info: "border-[#aebed0] bg-blue-soft text-[#294968]",
  };
</script>

<span
  class={`inline-flex min-h-6 items-center border px-2 py-0.5 text-[0.66rem] font-bold tracking-[0.045em] uppercase ${styles[tone]}`}
>
  {@render children()}
</span>
