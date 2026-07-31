<script lang="ts">
  import AccountRow from "./AccountRow.svelte";
  import type { AccessData } from "./types";

  let {
    accounts,
    permissionOptions,
    permissionPresets,
    claims,
    canGrantAllClaims,
  }: {
    accounts: AccessData["accounts"];
    permissionOptions: Array<readonly [string, string]>;
    permissionPresets: AccessData["permissionPresets"];
    claims: AccessData["claims"];
    canGrantAllClaims: boolean;
  } = $props();
</script>

<section class="mt-8" aria-labelledby="accounts-heading">
  <h2 id="accounts-heading" class="text-xl font-bold tracking-[-0.025em]">
    Accounts
  </h2>
  <div class="mt-4 border-t border-ink">
    {#each accounts as account}
      <AccountRow
        {account}
        {permissionOptions}
        {permissionPresets}
        {claims}
        {canGrantAllClaims}
      />
    {/each}
  </div>
</section>
