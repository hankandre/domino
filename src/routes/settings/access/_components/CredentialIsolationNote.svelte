<script lang="ts">
  import { KeyRound } from "lucide-svelte";
</script>

<div class="mt-8 bg-blue-soft p-4">
  <div class="flex gap-2 text-sm font-bold text-blue-ink">
    <KeyRound size={17} /> Credential isolation
  </div>
  <p class="mt-2 text-xs leading-relaxed text-blue-ink/80">
    Agents connect through revocable service accounts. The optional broker can
    hold the credential under a separate OS identity.
  </p>
</div>
