<script lang="ts">
  import { Copy } from "lucide-svelte";
  import type { AccessForm } from "./types";

  let { form }: { form?: AccessForm | null } = $props();
  let invitationCopied = $state(false);
  let resetCopied = $state(false);
  let copying = $state<"invitation" | "reset" | null>(null);
  let copyError = $state("");

  async function copy(value: string, kind: "invitation" | "reset") {
    copying = kind;
    copyError = "";
    try {
      await navigator.clipboard.writeText(value);
      if (kind === "invitation") invitationCopied = true;
      else resetCopied = true;
    } catch {
      copyError = "The link could not be copied. Select the text and copy it manually.";
    } finally {
      copying = null;
    }
  }
</script>

{#if form?.error}
  <div
    class="mt-6 border border-red bg-red-soft p-4 text-sm text-red"
    role="alert"
  >
    {form.error}
  </div>
{/if}
{#if form?.invitationUrl}
  <div
    class="mt-6 border border-green/30 bg-green-soft p-4 text-green"
    role="status"
  >
    <strong>Invitation created.</strong>
    <p class="mt-1 text-sm">Share this once; Domino only stores its hash.</p>
    <div class="mt-3 flex gap-2">
      <input
        readonly
        value={form.invitationUrl}
        aria-label="Invitation URL"
        class="min-h-11 min-w-0 flex-1 border border-green/30 bg-sheet px-3 text-xs text-ink"
      />
      <button
        type="button"
        disabled={copying !== null}
        onclick={() => copy(form.invitationUrl!, "invitation")}
        class="inline-flex min-h-11 items-center gap-2 bg-green px-4 text-xs font-bold text-white"
        ><Copy size={15} /> {copying === "invitation"
          ? "Copying…"
          : invitationCopied
            ? "Copied"
            : "Copy"}</button
      >
    </div>
  </div>
{/if}
{#if form?.permissionsSaved}<div
    class="mt-6 border border-green/30 bg-green-soft p-4 text-sm text-green"
    role="status"
  >
    Service-account permissions saved.
  </div>{/if}
{#if form?.claimAccessSaved}<div
    class="mt-6 border border-green/30 bg-green-soft p-4 text-sm text-green"
    role="status"
  >
    Claim access saved.
  </div>{/if}
{#if form?.accountUpdated}<div
    class="mt-6 border border-green/30 bg-green-soft p-4 text-sm text-green"
    role="status"
  >
    Account access updated.
  </div>{/if}
{#if form?.resetUrl}
  <div
    class="mt-6 border border-green/30 bg-green-soft p-4 text-sm text-green"
    role="status"
  >
    <strong>Password-reset link created.</strong>
    <div class="mt-3 flex gap-2">
      <input
        readonly
        value={form.resetUrl}
        aria-label="Password reset URL"
        class="min-h-11 min-w-0 flex-1 border border-green/30 bg-sheet px-3 text-xs text-ink"
      /><button
        type="button"
        disabled={copying !== null}
        onclick={() => copy(form.resetUrl!, "reset")}
        class="min-h-11 bg-green px-4 text-xs font-bold text-white"
        >{copying === "reset" ? "Copying…" : resetCopied ? "Copied" : "Copy"}</button
      >
    </div>
  </div>
{/if}
{#if copyError}
  <p class="mt-3 text-sm font-semibold text-red" role="alert">{copyError}</p>
{/if}
