<script lang="ts">
  import {
    Check,
    Database,
    ExternalLink,
    Image,
    KeyRound,
    Save,
    ShieldCheck,
  } from "lucide-svelte";
  import { untrack } from "svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  let { data, form } = $props();
  let backend = $state<"paperless" | "local">(
    untrack(
      () => data.settings.defaultDocumentBackend as "paperless" | "local",
    ),
  );
  let submittedPaperlessUrl = $derived(
    form && "paperlessUrl" in form && typeof form.paperlessUrl === "string"
      ? form.paperlessUrl
      : data.paperless.baseUrl,
  );
</script>

<svelte:head><title>Settings · Domino</title></svelte:head>

<div
  class="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9"
>
  <PageHeader
    kicker="Configuration"
    title="Settings"
    description="Control where documents live, connect household services, and tune how Domino presents coverage."
  />
  <div class="mt-8 space-y-8">
    {#if form?.settingsError}<div
        class="border border-red bg-red-soft p-4 text-sm text-red"
        role="alert"
      >
        {form.settingsError}
      </div>{/if}
    {#if form?.paperlessError}<div
        class="border border-red bg-red-soft p-4 text-sm text-red"
        role="alert"
      >
        {form.paperlessError}
      </div>{/if}
    {#if form?.settingsSaved}<div
        class="border border-green/30 bg-green-soft p-4 text-sm text-green"
        role="status"
      >
        Household settings saved.
      </div>{/if}
    {#if form?.paperlessSaved}<div
        class="border border-green/30 bg-green-soft p-4 text-sm text-green"
        role="status"
      >
        Paperless-ngx connection saved. The API token is encrypted and was not
        returned to this page.
      </div>{/if}
    {#if form?.paperlessHealthy}<div
        class="border border-green/30 bg-green-soft p-4 text-sm text-green"
        role="status"
      >
        Paperless-ngx responded successfully.
      </div>{/if}
    {#if form?.paperlessDisconnected}<div
        class="border border-rule bg-sheet p-4 text-sm text-ink"
        role="status"
      >
        Paperless-ngx disconnected. New documents now use Domino storage.
      </div>{/if}

    <section>
      <div class="flex items-start gap-3">
        <span class="grid size-10 place-items-center bg-ink text-white"
          ><Database size={19} /></span
        >
        <div>
          <h2 class="text-xl font-bold">Document storage</h2>
          <p class="mt-1 text-sm text-muted">
            Choose the authoritative backend for new attachments.
          </p>
        </div>
      </div>

      <form method="POST" action="?/save" class="mt-4">
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label
            class="flex cursor-pointer gap-3 border p-4"
            class:border-ink={backend === "paperless"}
            class:border-rule={backend !== "paperless"}
          >
            <input
              name="backend"
              type="radio"
              bind:group={backend}
              value="paperless"
              disabled={!data.paperless.configured || !data.canManageHousehold}
              class="mt-1"
            />
            <span
              ><span class="flex items-center gap-2 font-bold"
                >Paperless-ngx
                {#if data.paperless.configured}<span
                    class="text-green"
                    aria-label="Configured"><Check size={15} /></span
                  >{/if}</span
              ><span class="mt-1 block text-xs leading-relaxed text-muted"
                >Paperless stores files. Domino keeps document IDs, metadata,
                and links.</span
              ></span
            >
          </label>
          <label
            class="flex cursor-pointer gap-3 border p-4"
            class:border-ink={backend === "local"}
            class:border-rule={backend !== "local"}
          >
            <input
              name="backend"
              type="radio"
              bind:group={backend}
              value="local"
              disabled={!data.canManageHousehold}
              class="mt-1"
            />
            <span
              ><span class="font-bold">Domino volume</span><span
                class="mt-1 block text-xs leading-relaxed text-muted"
                >Domino stores files in the configured persistent volume.</span
              ></span
            >
          </label>
        </div>

        <div class="mt-7 border-t border-rule pt-6">
          <h3 class="text-base font-bold">Warranty review window</h3>
          <p class="mt-1 text-sm text-muted">
            Surface warranties this many days before they expire.
          </p>
          <div class="mt-4 flex flex-wrap items-end justify-between gap-4">
            <label>
              <span class="text-xs font-bold text-muted uppercase">Days</span>
              <input
                name="expiryWindowDays"
                type="number"
                min="1"
                max="365"
                required
                disabled={!data.canManageHousehold}
                value={data.settings.expiryWindowDays}
                class="mt-2 block min-h-11 w-40 border border-rule bg-sheet px-3"
              />
            </label>
            {#if data.canManageHousehold}<button
                class="inline-flex min-h-11 items-center gap-2 bg-ink px-5 text-sm font-bold text-white hover:bg-orange"
                ><Save size={16} /> Save household settings</button
              >{/if}
          </div>
        </div>
      </form>

      <div class="mt-8 border-t border-rule pt-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold">Paperless-ngx connection</h3>
            <p class="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted">
              Connect this household directly, or continue using credentials
              supplied by the deployment. Saving a new token rotates it without
              revealing the previous value.
            </p>
          </div>
          <span
            class={`px-2 py-1 text-[0.68rem] font-bold tracking-[0.055em] uppercase ${data.paperless.configured ? "bg-green-soft text-green" : "bg-paper text-muted"}`}
          >
            {data.paperless.configured ? "Connected" : "Not connected"}
          </span>
        </div>

        {#if data.paperless.configurationError}
          <div
            class="mt-4 border border-red bg-red-soft p-4 text-sm text-red"
            role="alert"
          >
            {data.paperless.configurationError}
          </div>
        {/if}

        <form
          method="POST"
          action="?/savePaperless"
          class="mt-4 border border-rule bg-sheet p-4 sm:p-5"
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="min-w-0">
              <span class="text-xs font-bold text-muted uppercase"
                >Paperless URL</span
              >
              <input
                name="paperlessUrl"
                type="url"
                required
                maxlength="2048"
                readonly={!data.canManagePaperless}
                value={submittedPaperlessUrl}
                placeholder="https://paperless.example.test"
                class="mt-2 min-h-11 w-full border border-rule bg-paper px-3 text-base outline-none focus:border-ink sm:text-sm"
              />
              <span class="mt-2 block text-xs leading-relaxed text-muted">
                Include a subpath if Paperless is hosted beneath one.
              </span>
            </label>
            <label class="min-w-0">
              <span class="text-xs font-bold text-muted uppercase"
                >API token</span
              >
              <input
                name="paperlessToken"
                type="password"
                maxlength="4096"
                autocomplete="new-password"
                readonly={!data.canManagePaperless}
                placeholder={data.paperless.configured
                  ? "Leave blank to keep the saved token"
                  : "Paste a Paperless API token"}
                class="mt-2 min-h-11 w-full border border-rule bg-paper px-3 text-base outline-none focus:border-ink sm:text-sm"
              />
              <span
                class="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted"
              >
                <ShieldCheck
                  size={15}
                  class={data.paperless.configured
                    ? "mt-0.5 shrink-0 text-green"
                    : "mt-0.5 shrink-0"}
                />
                {data.paperless.source === "database"
                  ? "Encrypted credential stored by Domino."
                  : data.paperless.source === "deployment"
                    ? "A deployment secret is currently in use."
                    : "The token is encrypted before it is stored."}
              </span>
            </label>
          </div>
          {#if data.canManagePaperless}
            <button
              class="mt-5 inline-flex min-h-11 items-center gap-2 bg-ink px-4 text-sm font-bold text-white hover:bg-orange"
            >
              <Save size={16} /> Save connection
            </button>
          {:else}
            <p class="mt-5 text-xs text-muted">
              You need integration-management permission to change this
              connection.
            </p>
          {/if}
        </form>

        {#if data.canManagePaperless}
          <div class="mt-3 flex flex-wrap gap-3">
            <form method="POST" action="?/testPaperless">
              <button
                disabled={!data.paperless.configured}
                class="inline-flex min-h-10 items-center gap-2 border border-rule bg-sheet px-3 text-xs font-bold hover:border-ink disabled:cursor-not-allowed disabled:opacity-45"
                >Test saved connection <ExternalLink size={14} /></button
              >
            </form>
            {#if data.paperless.enabled}
              <form method="POST" action="?/disconnectPaperless">
                <button
                  class="inline-flex min-h-10 items-center gap-2 border border-red/40 bg-sheet px-3 text-xs font-bold text-red hover:border-red"
                >
                  Disconnect Paperless-ngx
                </button>
              </form>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <section class="border-t border-rule pt-8">
      <div class="flex items-start gap-3">
        <span
          class="grid size-10 place-items-center bg-blue-soft text-[#294968]"
          ><Image size={19} /></span
        >
        <div>
          <h2 class="text-xl font-bold">Product images</h2>
          <p class="mt-1 text-sm text-muted">
            Suggest images from product pages without saving anything until a
            person confirms.
          </p>
        </div>
      </div>
      <div class="mt-4 border border-rule bg-sheet p-4 text-sm">
        <span class="block font-bold">Open Graph suggestions available</span
        ><span class="mt-1 block text-xs text-muted"
          >Domino inspects only a product URL supplied by the user, shows the
          candidate first, and stores it only when the product record is saved.</span
        >
      </div>
    </section>

    <section class="border-t border-rule pt-8">
      <div class="flex items-start gap-3">
        <span class="grid size-10 place-items-center bg-green-soft text-green"
          ><KeyRound size={19} /></span
        >
        <div>
          <h2 class="text-xl font-bold">Human sign-in</h2>
          <p class="mt-1 text-sm text-muted">
            Authenticate people with OIDC, then apply Domino household roles and
            permissions.
          </p>
        </div>
      </div>
      <div
        class="mt-4 flex items-center justify-between gap-4 border border-rule bg-sheet p-4"
      >
        <div>
          <div class="font-bold">{data.oidc.providerName}</div>
          <div class="mt-1 text-xs text-muted">
            {data.oidc.enabled
              ? "OIDC is configured for this deployment."
              : "OIDC is not enabled."}
          </div>
        </div>
        <span
          class={`px-2 py-1 text-[0.68rem] font-bold tracking-[0.055em] uppercase ${data.oidc.enabled ? "bg-green-soft text-green" : "bg-paper text-muted"}`}
        >
          {data.oidc.enabled ? "Configured" : "Disabled"}
        </span>
      </div>
      <p class="mt-3 text-xs leading-relaxed text-muted">
        Issuer URLs, client IDs, secrets, group allowlists, and bootstrap
        ownership are deployment settings. Secrets are never exposed in this
        page.
      </p>
    </section>
  </div>
</div>
