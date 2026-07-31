<script lang="ts">
  import { Plus } from "lucide-svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import AccountList from "./_components/AccountList.svelte";
  import CredentialIsolationNote from "./_components/CredentialIsolationNote.svelte";
  import FormNotices from "./_components/FormNotices.svelte";
  import InvitationForm from "./_components/InvitationForm.svelte";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  let showInvite = $state(false);
  const permissionOptions = (
    [
      ["products:read", "View products"],
      ["products:create", "Add products"],
      ["products:manage", "Edit and archive products"],
      ["warranties:read", "Read warranties"],
      ["warranties:create", "Add warranties"],
      ["warranties:manage", "Edit and remove warranties"],
      ["claims:read", "Read claims"],
      ["claims:create", "Create claims"],
      ["claims:manage", "Manage claims"],
      ["documents:read", "Read documents"],
      ["documents:attach", "Attach documents"],
      ["documents:manage", "Remove and restore documents"],
      ["images:attach", "Add product images"],
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
        aria-expanded={showInvite}
        class="inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-sm font-bold text-white"
        ><Plus size={17} /> Invite person</button
      >
    {:else if data.canManage}
      <p class="max-w-64 text-xs leading-relaxed text-muted" role="status">
        No roles within your authority are available to assign.
      </p>
    {/if}
  </PageHeader>

  <FormNotices {form} />

  {#if showInvite && data.roles.length > 0}
    <InvitationForm
      roles={data.roles}
      claims={data.claims}
      canGrantAllClaims={data.canGrantAllClaims}
      defaultClaimScope={data.defaultInvitationClaimScope}
      defaultClaimIds={data.defaultInvitationClaimIds}
    />
  {/if}

  <AccountList
    accounts={data.accounts}
    {permissionOptions}
    permissionPresets={data.permissionPresets}
    claims={data.claims}
    canGrantAllClaims={data.canGrantAllClaims}
  />
  <CredentialIsolationNote />
</div>
