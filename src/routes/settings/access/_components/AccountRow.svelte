<script lang="ts">
  import { Bot, UserRound } from "lucide-svelte";
  import { pendingForm } from "$lib/form-pending";
  import AccountAccessEditor from "./AccountAccessEditor.svelte";
  import type { AccessAccount, AccessData } from "./types";

  let {
    account,
    permissionOptions,
    permissionPresets,
    claims,
    canGrantAllClaims,
  }: {
    account: AccessAccount;
    permissionOptions: Array<readonly [string, string]>;
    permissionPresets: AccessData["permissionPresets"];
    claims: AccessData["claims"];
    canGrantAllClaims: boolean;
  } = $props();
</script>

<div
  class="grid grid-cols-[auto_1fr] items-center gap-4 border-b border-rule py-4 sm:grid-cols-[auto_1fr_auto]"
>
  <span
    class={[
      "grid size-11 place-items-center text-white",
      account.kind === "service" ? "bg-orange" : "bg-ink",
    ]}
  >
    {#if account.kind === "service"}<Bot size={19} />{:else}<UserRound
        size={19}
      />{/if}
  </span>
  <div>
    <div class="font-bold">{account.name}</div>
    <div class="mt-1 text-xs text-muted">
      {account.email ?? "Service account"} · {account.roleName ?? "No role"}
    </div>
  </div>
  {#if account.canReset || account.canToggle}
    <div class="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
      {#if account.canReset}<form method="POST" action="?/reset" use:pendingForm>
          <input type="hidden" name="actorId" value={account.id} /><button
            data-pending-label="Creating reset…"
            aria-label={`Reset ${account.name}'s password`}
            class="min-h-11 border border-rule px-3 text-xs font-bold"
            >Reset password</button
          >
        </form>{/if}
      {#if account.canToggle}
        <form method="POST" action="?/toggle" use:pendingForm>
          <input type="hidden" name="actorId" value={account.id} />
          <input
            type="hidden"
            name="disabled"
            value={account.disabled ? "false" : "true"}
          />
          <button
            data-pending-label={account.disabled ? "Enabling…" : "Disabling…"}
            aria-label={`${account.disabled ? "Enable" : "Disable"} ${account.name}`}
            class={[
              "min-h-11 border px-3 text-xs font-bold",
              account.disabled
                ? "border-rule text-muted"
                : "border-green/30 text-green",
            ]}>{account.disabled ? "Enable" : "Disable"}</button
          >
        </form>
      {/if}
    </div>
  {:else}
    <span class="text-xs font-bold text-green"
      >{account.disabled ? "Disabled" : "Active"}</span
    >
  {/if}
</div>

<AccountAccessEditor
  {account}
  {permissionOptions}
  {permissionPresets}
  {claims}
  {canGrantAllClaims}
/>
