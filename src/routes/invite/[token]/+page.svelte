<script lang="ts">
  import { ShieldCheck } from "lucide-svelte";
  let { data, form } = $props();
</script>

<svelte:head><title>Join {data.householdName} · Domino</title></svelte:head>

<main class="grid min-h-screen place-items-center bg-paper px-5 py-12">
  <section class="w-full max-w-md border-t-2 border-ink bg-sheet p-6 sm:p-8">
    <span class="grid size-11 place-items-center bg-ink text-white"
      ><ShieldCheck size={21} /></span
    >
    <p class="mt-6 text-xs font-bold tracking-[0.06em] text-muted uppercase">
      Invitation
    </p>
    <h1 class="mt-2 text-3xl font-bold tracking-[-0.035em]">
      Join {data.householdName}
    </h1>
    <p class="mt-3 text-sm leading-relaxed text-muted">
      Create the local password for <strong class="text-ink"
        >{data.email}</strong
      >. Domino does not allow public registration.
    </p>
    {#if form?.error}
      <div
        class="mt-5 border border-red bg-red-soft p-3 text-sm text-red"
        role="alert"
      >
        {form.error}
      </div>
    {/if}
    <form method="POST" class="mt-6 space-y-4">
      <label class="block">
        <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Your name</span
        >
        <input
          name="displayName"
          required
          minlength="2"
          value={data.displayName ?? ""}
          autocomplete="name"
          class="mt-2 min-h-12 w-full border border-rule px-3 outline-none focus:border-ink"
        />
      </label>
      <label class="block">
        <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Password</span
        >
        <input
          name="password"
          type="password"
          required
          minlength="12"
          autocomplete="new-password"
          class="mt-2 min-h-12 w-full border border-rule px-3 outline-none focus:border-ink"
        />
      </label>
      <label class="block">
        <span class="text-xs font-bold tracking-[0.055em] text-muted uppercase"
          >Confirm password</span
        >
        <input
          name="confirmation"
          type="password"
          required
          minlength="12"
          autocomplete="new-password"
          class="mt-2 min-h-12 w-full border border-rule px-3 outline-none focus:border-ink"
        />
      </label>
      <button
        class="min-h-12 w-full bg-ink px-5 text-sm font-bold text-white hover:bg-orange"
        >Create account</button
      >
    </form>
  </section>
</main>
