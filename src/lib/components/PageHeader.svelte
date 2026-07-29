<script lang="ts">
  let {
    kicker,
    title,
    description,
    children,
  }: {
    kicker?: string;
    title: string;
    description?: string;
    children?: import("svelte").Snippet;
  } = $props();
</script>

<header
  class="flex flex-col justify-between gap-5 border-b border-ink pb-6 sm:flex-row sm:items-end"
>
  <div>
    {#if kicker}
      <p
        class="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.07em] text-muted uppercase"
      >
        <span class="inline-block h-px w-7 bg-orange"></span>{kicker}
      </p>
    {/if}
    <h1
      class="text-[clamp(2rem,5vw,3.5rem)] leading-none font-bold tracking-[-0.04em] text-balance"
    >
      {title}
    </h1>
    {#if description}
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
        {description}
      </p>
    {/if}
  </div>
  {#if children}
    <div class="shrink-0">{@render children()}</div>
  {/if}
</header>
