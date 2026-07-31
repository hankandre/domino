<script lang="ts">
  import { ExternalLink, Mail, Phone } from "lucide-svelte";
  import type { ClaimWarranty } from "./types";

  let { warranty }: { warranty?: ClaimWarranty } = $props();
</script>

<section class="border border-rule bg-sheet p-5">
  <h2 class="text-lg font-bold">Provider contact</h2>
  <dl class="mt-4 border-t border-rule text-sm">
    <div class="border-b border-rule py-3">
      <dt class="text-xs text-muted">Provider</dt>
      <dd class="mt-1 font-bold">{warranty?.provider ?? "Not recorded"}</dd>
    </div>
    <div class="border-b border-rule py-3">
      <dt class="text-xs text-muted">Claim phone</dt>
      <dd class="mt-1 font-bold">{warranty?.claimPhone ?? "Not recorded"}</dd>
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
