<script lang="ts">
  import { KeyRound } from "lucide-svelte";
  let { data, form } = $props();
</script>

<svelte:head><title>Reset password · Domino</title></svelte:head>
<main class="grid min-h-screen place-items-center bg-paper px-5 py-12">
  <section class="w-full max-w-md border-t-2 border-ink bg-sheet p-6 sm:p-8">
    <span class="grid size-11 place-items-center bg-ink text-white"
      ><KeyRound size={21} /></span
    >
    <h1 class="mt-6 text-3xl font-bold tracking-[-0.035em]">
      Reset your password
    </h1>
    <p class="mt-3 text-sm text-muted">
      Set a new local password for {data.email}.
    </p>
    {#if form?.error}<div
        class="mt-5 border border-red bg-red-soft p-3 text-sm text-red"
        role="alert"
      >
        {form.error}
      </div>{/if}
    <form method="POST" class="mt-6 space-y-4">
      <label class="block"
        ><span class="text-xs font-bold text-muted uppercase">New password</span
        ><input
          name="password"
          type="password"
          required
          minlength="12"
          autocomplete="new-password"
          class="mt-2 min-h-12 w-full border border-rule px-3"
        /></label
      >
      <label class="block"
        ><span class="text-xs font-bold text-muted uppercase"
          >Confirm password</span
        ><input
          name="confirmation"
          type="password"
          required
          minlength="12"
          autocomplete="new-password"
          class="mt-2 min-h-12 w-full border border-rule px-3"
        /></label
      >
      <button class="min-h-12 w-full bg-ink text-sm font-bold text-white"
        >Set password</button
      >
    </form>
  </section>
</main>
