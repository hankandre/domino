<script lang="ts">
  import { Copy, Trash2 } from "lucide-svelte";
  import { invalidateAll } from "$app/navigation";
  import { networkError, responseError } from "$lib/api-errors";
  import { dominoApi } from "$lib/api-client";
  import AsyncNotice from "$lib/components/AsyncNotice.svelte";
  import { pendingForm } from "$lib/form-pending";
  import ClaimAccessPicker from "$lib/components/access/ClaimAccessPicker.svelte";
  import PermissionPresetPicker from "$lib/components/access/PermissionPresetPicker.svelte";
  import type { ClaimAccessPresetId } from "$lib/access-presets";
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

  const initialPermissions = () => [...account.permissions];
  const initialClaimIds = () => [...account.selectedClaimIds];
  const initialClaimScope = (): "all" | "selected" =>
    account.claimAccessScope === "selected" ? "selected" : "all";
  let selectedPermissions = $state<string[]>(initialPermissions());
  let selectedClaimIds = $state<string[]>(initialClaimIds());
  let claimScope = $state<"all" | "selected">(initialClaimScope());
  let permissionPresetId = $state<string | null>(null);
  let claimPresetId = $state<ClaimAccessPresetId>("manual");
  let setupCopied = $state(false);
  let copyingSetup = $state(false);
  let setupCopyError = $state("");
  let revoking = $state(false);
  let revoked = $state(false);
  let revokeError = $state("");

  const hasClaimPermission = $derived(
    account.permissions?.includes("*") ||
      account.permissions?.some((permission) =>
        ["claims:read", "claims:create", "claims:manage"].includes(permission),
      ),
  );

  async function revoke() {
    if (
      revoking ||
      !confirm(
        `Revoke ${account.name}? Existing CLI credentials will stop working immediately.`,
      )
    )
      return;
    revoking = true;
    revokeError = "";
    try {
      const response = await dominoApi.api.v1["service-accounts"][":id"].$delete({
        param: { id: account.id },
      });
      if (!response.ok) {
        revokeError = await responseError(
          response,
          "The service account could not be revoked.",
        );
        return;
      }
      revoked = true;
      await invalidateAll();
    } catch (cause) {
      revokeError = networkError(
        cause,
        "The service account could not be revoked.",
      );
    } finally {
      revoking = false;
    }
  }

  async function copySetup() {
    copyingSetup = true;
    setupCopyError = "";
    try {
      await navigator.clipboard.writeText(
        `domino auth login --name "${account.name}" --no-open\ndomino broker serve --listen /run/domino/${account.id}.sock\ndomino --socket /run/domino/${account.id}.sock record create --file product.json --json`,
      );
      setupCopied = true;
    } catch {
      setupCopyError =
        "The setup commands could not be copied. Select and copy them manually from the CLI guide.";
    } finally {
      copyingSetup = false;
    }
  }
</script>

{#if account.canEditPermissions}
  <details class="border-b border-rule bg-paper px-4 py-3">
    <summary class="min-h-11 cursor-pointer py-3 text-xs font-bold"
      >Edit {account.name} permissions</summary
    >
    <form method="POST" action="?/permissions" class="mt-3" use:pendingForm>
      <input type="hidden" name="actorId" value={account.id} />
      <PermissionPresetPicker
        presets={permissionPresets}
        bind:selected={selectedPermissions}
        bind:activePresetId={permissionPresetId}
        compact
      />
      <p class="mt-2 text-xs leading-relaxed text-muted">
        Start with a template, then adjust individual permissions.
      </p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3">
        {#each permissionOptions as option}
          <label
            class="flex min-h-11 items-center gap-2 border-b border-rule text-xs"
          >
            <input
              name="permission"
              type="checkbox"
              value={option[0]}
              bind:group={selectedPermissions}
              onchange={() => (permissionPresetId = null)}
              class="size-4 accent-orange"
            />
            {option[1]}
          </label>
        {/each}
      </div>
      <button data-pending-label="Saving permissions…" class="mt-3 min-h-11 bg-ink px-4 text-xs font-bold text-white"
        >Save permissions</button
      >
    </form>
  </details>
{/if}

{#if account.kind === "service"}
  <div class="border-b border-rule bg-paper px-4 py-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-xs font-bold">Credential-isolated setup</div>
        <p class="mt-1 text-xs text-muted">
          Authenticate once, then let the agent use only the broker socket.
        </p>
      </div>
      <button
        type="button"
        disabled={copyingSetup}
        class="inline-flex min-h-11 items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink"
        onclick={copySetup}
      >
        <Copy size={15} />
        {copyingSetup ? "Copying…" : setupCopied ? "Copied setup" : "Copy setup"}
      </button>
    </div>
    {#if setupCopyError}
      <div class="mt-3">
        <AsyncNotice tone="error">{setupCopyError}</AsyncNotice>
      </div>
    {/if}
    {#if account.canToggle}
      <div class="mt-4 border-t border-rule pt-4">
        <button
          type="button"
          disabled={revoking || revoked}
          class="inline-flex min-h-11 items-center gap-2 border border-red/40 bg-sheet px-3 text-xs font-bold text-red hover:border-red disabled:cursor-not-allowed disabled:opacity-45"
          onclick={revoke}
        >
          <Trash2 size={15} aria-hidden="true" />
          {revoking
            ? "Revoking…"
            : revoked
              ? "Account revoked"
              : "Revoke account"}
        </button>
        <p class="mt-2 text-xs leading-relaxed text-muted">
          Revocation disables this account and invalidates every active API
          credential. It does not delete audit history.
        </p>
      </div>
    {/if}
    {#if revokeError}
      <div class="mt-3">
        <AsyncNotice tone="error">{revokeError}</AsyncNotice>
      </div>
    {/if}
    {#if revoked}
      <div class="mt-3">
        <AsyncNotice tone="success">Service account revoked.</AsyncNotice>
      </div>
    {/if}
  </div>
{/if}

{#if account.canEditClaimAccess && hasClaimPermission}
  <details class="border-b border-rule bg-paper px-4 py-3">
    <summary class="min-h-11 cursor-pointer py-3 text-xs font-bold">
      Claims visible to {account.name}
    </summary>
    <form method="POST" action="?/claims" class="mt-4" use:pendingForm>
      <input type="hidden" name="actorId" value={account.id} />
      <ClaimAccessPicker
        {claims}
        canGrantAll={canGrantAllClaims}
        bind:scope={claimScope}
        bind:selectedClaimIds
        bind:activePresetId={claimPresetId}
      />
      <p class="mt-2 max-w-2xl text-xs leading-relaxed text-muted">
        Restricted accounts automatically retain access to claims they create.
        Product and document views follow this same claim scope.
      </p>
      <button data-pending-label="Saving claim access…" class="mt-3 min-h-11 bg-ink px-4 text-xs font-bold text-white">
        Save claim access
      </button>
    </form>
  </details>
{/if}
