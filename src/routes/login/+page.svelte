<script lang="ts">
  import { ArrowRight, KeyRound, ShieldCheck } from "lucide-svelte";
  import { page } from "$app/state";

  let { data, form } = $props();
  const returnTo = $derived(page.url.searchParams.get("returnTo") ?? "/");
  const errorMessage = $derived(page.url.searchParams.get("error"));
</script>

<svelte:head>
  <title>Sign in · Domino</title>
</svelte:head>

<main
  class="grid min-h-screen bg-paper lg:grid-cols-[minmax(320px,0.78fr)_minmax(520px,1.22fr)]"
>
  <section
    class="flex flex-col justify-between bg-ink px-6 py-8 text-white sm:px-10 lg:px-14 lg:py-12"
  >
    <a
      href="/login"
      class="flex items-center gap-3"
      aria-label="Domino sign in"
    >
      <span
        class="grid size-10 place-items-center border border-white/25 bg-white/8"
      >
        <ShieldCheck size={22} strokeWidth={1.8} />
      </span>
      <span>
        <span class="block text-xl font-bold tracking-[-0.03em]">Domino</span>
        <span
          class="block text-[0.68rem] font-semibold tracking-[0.09em] text-white/55 uppercase"
          >Home coverage</span
        >
      </span>
    </a>

    <div class="my-16 max-w-lg">
      <p class="text-xs font-bold tracking-[0.07em] text-white/55 uppercase">
        Household dispatch
      </p>
      <h1
        class="mt-4 text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.9] font-bold tracking-[-0.04em]"
      >
        Your coverage stays yours.
      </h1>
      <p class="mt-6 max-w-md text-base leading-relaxed text-white/68">
        Sign in through your household identity provider. Domino receives your
        verified identity, then applies its own household roles and permissions.
      </p>
    </div>

    <p class="text-xs leading-relaxed text-white/45">
      OIDC handles human sign-in. Restricted agents continue to use separately
      revocable service accounts.
    </p>
  </section>

  <section class="flex items-center justify-center px-5 py-12 sm:px-10">
    <div class="w-full max-w-md border-y border-ink bg-sheet py-8 sm:px-8">
      <span class="grid size-11 place-items-center bg-blue-soft text-[#294968]">
        <KeyRound size={21} />
      </span>
      <h2 class="mt-6 text-3xl font-bold tracking-[-0.035em]">
        Sign in to Domino
      </h2>
      <p class="mt-3 text-sm leading-relaxed text-muted">
        Use your household account or continue through {data.oidc.providerName}.
      </p>

      {#if errorMessage}
        <div
          class="mt-5 border border-red bg-red-soft p-4 text-sm text-red"
          role="alert"
        >
          <strong class="block">Sign-in was not completed</strong>
          <span class="mt-1 block">{errorMessage}</span>
        </div>
      {/if}

      {#if form?.localError}
        <div
          class="mt-5 border border-red bg-red-soft p-4 text-sm text-red"
          role="alert"
        >
          <strong class="block">Sign-in was not completed</strong>
          <span class="mt-1 block">{form.localError}</span>
        </div>
      {/if}

      <form method="POST" class="mt-6 space-y-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <label class="block">
          <span
            class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >Email</span
          >
          <input
            name="email"
            type="email"
            required
            autocomplete="username"
            value={form?.email ?? ""}
            class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
          />
        </label>
        <label class="block">
          <span
            class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
            >Password</span
          >
          <input
            name="password"
            type="password"
            required
            autocomplete="current-password"
            class="mt-2 min-h-12 w-full border border-rule bg-sheet px-3 outline-none focus:border-ink"
          />
        </label>
        <button
          class="min-h-12 w-full bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-orange"
        >
          Sign in
        </button>
      </form>

      {#if data.oidc.enabled}
        <div
          class="my-5 flex items-center gap-3 text-xs font-bold text-muted uppercase"
        >
          <span class="h-px flex-1 bg-rule"></span>or<span
            class="h-px flex-1 bg-rule"
          ></span>
        </div>
        <a
          href={`/auth/oidc/login?returnTo=${encodeURIComponent(returnTo)}`}
          class="flex min-h-12 w-full items-center justify-between border border-ink px-5 text-sm font-bold transition-colors hover:bg-paper"
        >
          Continue with {data.oidc.providerName}
          <ArrowRight size={18} />
        </a>
      {:else}
        <div
          class="mt-6 border border-rule bg-paper p-4 text-sm leading-relaxed text-muted"
        >
          OIDC has not been configured by the Domino administrator.
        </div>
      {/if}
    </div>
  </section>
</main>
