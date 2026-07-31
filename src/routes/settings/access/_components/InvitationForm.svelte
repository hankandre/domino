<script lang="ts">
  import ClaimAccessPicker from "$lib/components/access/ClaimAccessPicker.svelte";
  import { pendingForm } from "$lib/form-pending";
  import type { ClaimAccessPresetId } from "$lib/access-presets";
  import type { AccessClaim, AccessRole } from "./types";

  let {
    roles,
    claims,
    canGrantAllClaims,
    defaultClaimScope,
    defaultClaimIds,
  }: {
    roles: AccessRole[];
    claims: AccessClaim[];
    canGrantAllClaims: boolean;
    defaultClaimScope: "all" | "selected";
    defaultClaimIds: string[];
  } = $props();

  const initialScope = () => defaultClaimScope;
  const initialIds = () => [...defaultClaimIds];
  let claimScope = $state<"all" | "selected">(initialScope());
  let claimIds = $state<string[]>(initialIds());
  let activePresetId = $state<ClaimAccessPresetId>("manual");
</script>

<form
  method="POST"
  action="?/invite"
  use:pendingForm
  class="mt-6 grid gap-4 border border-ink bg-sheet p-5 sm:grid-cols-2"
>
  <label
    ><span class="text-xs font-bold text-muted uppercase">Email</span><input
      name="email"
      type="email"
      required
      class="mt-2 min-h-11 w-full border border-rule px-3"
    /></label
  >
  <label
    ><span class="text-xs font-bold text-muted uppercase">Display name</span
    ><input
      name="displayName"
      class="mt-2 min-h-11 w-full border border-rule px-3"
    /></label
  >
  <label
    ><span class="text-xs font-bold text-muted uppercase">Role</span><select
      name="roleId"
      required
      class="mt-2 min-h-11 w-full border border-rule bg-sheet px-3"
      >{#each roles as role}<option value={role.id}>{role.name}</option
        >{/each}</select
    ></label
  >
  <div class="sm:col-span-2">
    <h3 class="text-xs font-bold text-muted uppercase">Visible claims</h3>
    <p class="mt-1 text-xs leading-relaxed text-muted">
      The invitation stores this exact selection. It cannot gain access beyond
      your own.
    </p>
    <div class="mt-3">
      <ClaimAccessPicker
        {claims}
        canGrantAll={canGrantAllClaims}
        bind:scope={claimScope}
        bind:selectedClaimIds={claimIds}
        bind:activePresetId
      />
    </div>
  </div>
  <div class="flex items-end sm:col-span-2 sm:justify-end">
    <button data-pending-label="Creating invitation…" class="min-h-11 bg-ink px-4 text-sm font-bold text-white"
      >Create invitation</button
    >
  </div>
</form>
