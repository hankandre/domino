<script lang="ts">
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
</script>

<div class="grid gap-3">
  <AsyncNotice tone="error">
    The document could not be attached. Check the connection and try again.
  </AsyncNotice>
  <AsyncNotice tone="success">Evidence attached.</AsyncNotice>
</div>
