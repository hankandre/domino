<script lang="ts">
  import { Archive } from "lucide-svelte";
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";

  let {
    productId,
    productName,
    archived,
  }: { productId: string; productName: string; archived: boolean } = $props();

  let pending = $state(false);
  let error = $state("");

  async function toggle() {
    if (
      !archived &&
      !confirm(`Archive ${productName}? You can restore it from the archive.`)
    )
      return;
    if (pending) return;
    pending = true;
    error = "";
    try {
      const response = archived
        ? await dominoApi.api.v1.products[":id"].restore.$post({
            param: { id: productId },
          })
        : await dominoApi.api.v1.products[":id"].$delete({
            param: { id: productId },
          });
      if (!response.ok) {
        error = await responseError(
          response,
          `The product could not be ${archived ? "restored" : "archived"}.`,
        );
        return;
      }
      location.href = archived ? `/products/${productId}` : "/archive";
    } catch (cause) {
      error = networkError(
        cause,
        `The product could not be ${archived ? "restored" : "archived"}.`,
      );
    } finally {
      pending = false;
    }
  }
</script>

<div class="relative shrink-0">
  <button
    aria-label={archived ? "Restore product" : "Archive product"}
    title={archived ? "Restore product" : "Archive product"}
    class="grid size-11 place-items-center border border-rule bg-sheet text-muted hover:border-ink hover:text-ink"
    onclick={toggle}
    disabled={pending}
  >
    <Archive size={19} />
  </button>
  {#if error}
    <div
      role="alert"
      class="absolute top-13 right-0 z-10 w-72 border border-orange/50 bg-orange-soft px-4 py-3 text-sm font-semibold text-orange-ink shadow-sheet"
    >
      {error}
    </div>
  {/if}
</div>
