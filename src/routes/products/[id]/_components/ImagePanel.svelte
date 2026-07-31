<script lang="ts">
  import { ImagePlus, ShieldCheck } from "lucide-svelte";
  import { invalidateAll } from "$app/navigation";
  import { networkError, responseError } from "$lib/api-errors";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
  import { uploadProductImage } from "$lib/uploads";

  let {
    productId,
    imageUrl,
    demoMode,
    canAttach,
  }: {
    productId: string;
    imageUrl: string | null;
    demoMode: boolean;
    canAttach: boolean;
  } = $props();

  let uploading = $state(false);
  let message = $state("");
  let error = $state("");

  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || uploading) return;
    uploading = true;
    message = "";
    error = "";
    try {
      const response = await uploadProductImage(file, productId);
      if (!response.ok) {
        error = await responseError(
          response,
          "The image could not be uploaded.",
        );
        return;
      }
      message = "Product image updated.";
      if (!demoMode) await invalidateAll();
    } catch (cause) {
      error = networkError(cause, "The image could not be uploaded.");
    } finally {
      uploading = false;
      input.value = "";
    }
  }
</script>

<div>
  <div
    class="relative aspect-[16/10] overflow-hidden border border-rule bg-surface-muted"
  >
    {#if imageUrl}
      <img src={imageUrl} alt="" class="h-full w-full object-cover" />
    {:else}
      <div class="grid h-full place-items-center text-muted">
        <ShieldCheck size={60} strokeWidth={1.2} />
      </div>
    {/if}
    {#if canAttach}
      <label
        class="absolute right-3 bottom-3 flex min-h-11 cursor-pointer items-center gap-2 bg-sheet px-3 text-xs font-bold shadow-sheet"
      >
        <ImagePlus size={16} />
        {uploading ? "Uploading…" : "Change image"}
        <input
          type="file"
          class="sr-only"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={uploading}
          onchange={upload}
        />
      </label>
    {/if}
  </div>
  {#if error}
    <div class="mt-3"><AsyncNotice tone="error">{error}</AsyncNotice></div>
  {/if}
  {#if message}
    <div class="mt-3"><AsyncNotice tone="success">{message}</AsyncNotice></div>
  {/if}
</div>
