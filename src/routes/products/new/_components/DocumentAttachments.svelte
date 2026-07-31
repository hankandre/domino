<script lang="ts">
  import { Upload } from "lucide-svelte";

  let { backend }: { backend: string } = $props();
</script>

<fieldset>
  <legend class="text-xl font-bold tracking-[-0.025em]">Documents</legend>
  <p class="mt-1 text-sm text-muted">
    New attachments use the household’s authoritative backend:
    <strong
      >{backend === "paperless" ? "Paperless-ngx" : "Domino storage"}</strong
    >.
  </p>
  <label class="mt-4 block">
    <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
      >Attachment type</span
    >
    <select
      name="documentKind"
      class="mt-2 min-h-11 w-full border border-rule bg-sheet px-3 text-sm font-bold"
    >
      <option value="receipt">Receipt</option>
      <option value="manual">Manual</option>
      <option value="warranty">Warranty terms</option>
      <option value="other">Other</option>
    </select>
  </label>
  <label
    class="mt-4 flex min-h-28 cursor-pointer items-center justify-center gap-3 border border-dashed border-muted/60 bg-sheet text-sm font-bold hover:border-ink"
  >
    <Upload size={19} /> Attach receipt, manual, or warranty file
    <input
      name="documents"
      type="file"
      class="sr-only"
      multiple
      accept="image/*,.pdf"
    />
  </label>
</fieldset>
