<script lang="ts">
  let {
    noticedAt,
    preferredResolution,
  }: {
    noticedAt?: string | null;
    preferredResolution?: string | null;
  } = $props();
</script>

<section class="border border-rule bg-sheet p-4 text-sm">
  <h2 class="font-bold">Incident details</h2>
  <dl class="mt-3 border-t border-rule">
    <div class="border-b border-rule py-3">
      <dt class="text-xs text-muted">Date noticed</dt>
      <dd class="mt-1 font-semibold">
        {noticedAt
          ? new Date(`${noticedAt}T00:00:00`).toLocaleDateString()
          : "Not recorded"}
      </dd>
    </div>
    <div class="py-3">
      <dt class="text-xs text-muted">Preferred outcome</dt>
      <dd class="mt-1 font-semibold">
        {preferredResolution?.replaceAll("_", " ") ?? "Not recorded"}
      </dd>
    </div>
  </dl>
</section>
