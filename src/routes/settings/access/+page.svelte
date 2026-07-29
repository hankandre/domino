<script lang="ts">
  import { Bot, Copy, KeyRound, Plus, UserRound } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  let { data, form } = $props();
  let showInvite = $state(false);
  let copied = $state(false);
  let resetCopied = $state(false);
  const permissionOptions = (
    [
      ["warranties:read", "Read warranties"],
      ["warranties:write", "Manage products"],
      ["claims:read", "Read claims"],
      ["claims:create", "Create claims"],
      ["claims:manage", "Manage claims"],
      ["documents:read", "Read documents"],
      ["documents:attach", "Attach documents"],
      ["paperless:discover", "Search and link Paperless documents"],
      ["notes:read", "Read notes"],
      ["notes:write", "Add notes"],
    ] as const
  ).filter(([permission]) => data.grantablePermissions.includes(permission));
</script>

<svelte:head><title>People & agents · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <PageHeader
    kicker="Household access"
    title="People & agents"
    description="Give each person or service account only the authority it needs."
  >
    {#if data.canManage && data.roles.length > 0}
      <button
        onclick={() => (showInvite = !showInvite)}
        class="inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-sm font-bold text-white"
        ><Plus size={17} /> Invite person</button
      >
    {:else if data.canManage}
      <p class="max-w-64 text-xs leading-relaxed text-muted" role="status">
        No roles within your authority are available to assign.
      </p>
    {/if}
  </PageHeader>

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
          class="min-h-11 min-w-0 flex-1 border border-green/30 bg-sheet px-3 text-xs text-ink"
        />
        <button
          type="button"
          onclick={async () => {
            await navigator.clipboard.writeText(form.invitationUrl);
            copied = true;
          }}
          class="inline-flex min-h-11 items-center gap-2 bg-green px-4 text-xs font-bold text-white"
          ><Copy size={15} /> {copied ? "Copied" : "Copy"}</button
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
          class="min-h-11 min-w-0 flex-1 border border-green/30 bg-sheet px-3 text-xs text-ink"
        /><button
          type="button"
          onclick={async () => {
            await navigator.clipboard.writeText(form.resetUrl);
            resetCopied = true;
          }}
          class="min-h-11 bg-green px-4 text-xs font-bold text-white"
          >{resetCopied ? "Copied" : "Copy"}</button
        >
      </div>
    </div>
  {/if}

  {#if showInvite && data.roles.length > 0}
    <form
      method="POST"
      action="?/invite"
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
          >{#each data.roles as role}<option value={role.id}>{role.name}</option
            >{/each}</select
        ></label
      >
      <div class="flex items-end">
        <button class="min-h-11 w-full bg-ink px-4 text-sm font-bold text-white"
          >Create invitation</button
        >
      </div>
    </form>
  {/if}

  <section class="mt-8" aria-labelledby="accounts-heading">
    <h2 id="accounts-heading" class="text-xl font-bold tracking-[-0.025em]">
      Accounts
    </h2>
    <div class="mt-4 border-t border-ink">
      {#each data.accounts as account}
        <div
          class="grid grid-cols-[auto_1fr] items-center gap-4 border-b border-rule py-4 sm:grid-cols-[auto_1fr_auto]"
        >
          <span
            class={`grid size-11 place-items-center text-white ${account.kind === "service" ? "bg-orange" : "bg-ink"}`}
          >
            {#if account.kind === "service"}<Bot size={19} />{:else}<UserRound
                size={19}
              />{/if}
          </span>
          <div>
            <div class="font-bold">{account.name}</div>
            <div class="mt-1 text-xs text-muted">
              {account.email ?? "Service account"} · {account.roleName ??
                "No role"}
            </div>
          </div>
          {#if account.canReset || account.canToggle}
            <div class="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
              {#if account.canReset}<form method="POST" action="?/reset">
                  <input
                    type="hidden"
                    name="actorId"
                    value={account.id}
                  /><button
                    aria-label={`Reset ${account.name}'s password`}
                    class="min-h-9 border border-rule px-3 text-xs font-bold"
                    >Reset password</button
                  >
                </form>{/if}
              {#if account.canToggle}
                <form method="POST" action="?/toggle">
                  <input type="hidden" name="actorId" value={account.id} />
                  <input
                    type="hidden"
                    name="disabled"
                    value={account.disabled ? "false" : "true"}
                  />
                  <button
                    aria-label={`${account.disabled ? "Enable" : "Disable"} ${account.name}`}
                    class={`min-h-9 border px-3 text-xs font-bold ${account.disabled ? "border-rule text-muted" : "border-green/30 text-green"}`}
                    >{account.disabled ? "Enable" : "Disable"}</button
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
        {#if account.canEditPermissions}
          <details class="border-b border-rule bg-paper px-4 py-3">
            <summary class="cursor-pointer text-xs font-bold"
              >Edit {account.name} permissions</summary
            >
            <form method="POST" action="?/permissions" class="mt-3">
              <input type="hidden" name="actorId" value={account.id} />
              <div class="grid sm:grid-cols-2 lg:grid-cols-3">
                {#each permissionOptions as option}
                  <label
                    class="flex min-h-10 items-center gap-2 border-b border-rule text-xs"
                  >
                    <input
                      name="permission"
                      type="checkbox"
                      value={option[0]}
                      checked={account.permissions?.includes(option[0])}
                      class="size-4 accent-orange"
                    />
                    {option[1]}
                  </label>
                {/each}
              </div>
              <button
                class="mt-3 min-h-10 bg-ink px-4 text-xs font-bold text-white"
                >Save permissions</button
              >
            </form>
          </details>
        {/if}
      {/each}
    </div>
  </section>

  <div class="mt-8 bg-blue-soft p-4">
    <div class="flex gap-2 text-sm font-bold text-[#294968]">
      <KeyRound size={17} /> Credential isolation
    </div>
    <p class="mt-2 text-xs leading-relaxed text-[#294968]/80">
      Agents connect through revocable service accounts. The optional broker can
      hold the credential under a separate OS identity.
    </p>
  </div>
</div>
