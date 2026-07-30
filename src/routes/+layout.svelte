<script lang="ts">
  import "../app.css";
  import {
    Archive,
    ClipboardCheck,
    FileText,
    LayoutGrid,
    Menu,
    Settings,
    Users,
    X,
  } from "lucide-svelte";
  import { LogOut } from "lucide-svelte";
  import { page } from "$app/state";

  let { children, data } = $props();
  let mobileNavOpen = $state(false);
  let navigationDrawer = $state<HTMLElement>();
  let navigationTrigger = $state<HTMLButtonElement>();
  let navigationClose = $state<HTMLButtonElement>();
  let isAuthPage = $derived(
    page.url.pathname === "/login" ||
      page.url.pathname.startsWith("/invite/") ||
      page.url.pathname.startsWith("/reset/"),
  );

  const nav = [
    { href: "/", label: "Inventory", icon: LayoutGrid },
    { href: "/claims", label: "Claims", icon: ClipboardCheck },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/archive", label: "Archive", icon: Archive },
  ];

  function closeMobileNavigation() {
    mobileNavOpen = false;
    queueMicrotask(() => navigationTrigger?.focus());
  }

  $effect(() => {
    if (!mobileNavOpen) return;
    queueMicrotask(() => navigationClose?.focus());
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileNavigation();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(navigationDrawer?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });
</script>

<svelte:head>
  <title>Domino · Household warranties</title>
  <meta
    name="description"
    content="Track household warranties, documents, and claims without losing the thread."
  />
</svelte:head>

{#if isAuthPage}
  {@render children()}
{:else}
  <a
    href="#main-content"
    class="fixed top-2 left-2 z-[60] -translate-y-20 bg-sheet px-4 py-3 text-sm font-bold text-ink shadow-sheet focus:translate-y-0"
  >
    Skip to main content
  </a>
  <div class="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
    <aside
      bind:this={navigationDrawer}
      id="primary-navigation"
      class="invisible fixed inset-y-0 left-0 z-50 flex w-[min(86vw,300px)] -translate-x-full flex-col border-r border-rule bg-ink text-white transition-transform duration-300 ease-out lg:visible lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0"
      class:translate-x-0={mobileNavOpen}
      class:visible={mobileNavOpen}
      aria-label="Primary navigation"
    >
      <div
        class="flex h-20 items-center justify-between border-b border-white/12 px-5"
      >
        <a href="/" class="flex items-center gap-3" aria-label="Domino home">
          <img
            src="/brand/domino-icon-192.png"
            alt=""
            width="40"
            height="40"
            class="size-10 object-contain"
            aria-hidden="true"
          />
          <span>
            <span class="block text-[1.2rem] font-bold tracking-[-0.03em]"
              >Domino</span
            >
            <span
              class="block text-[0.68rem] font-semibold tracking-[0.09em] text-white/55 uppercase"
              >Home coverage</span
            >
          </span>
        </a>
        <button
          bind:this={navigationClose}
          class="grid size-10 place-items-center text-white/70 lg:hidden"
          aria-label="Close navigation"
          onclick={closeMobileNavigation}
        >
          <X size={20} />
        </button>
      </div>

      <nav class="flex-1 space-y-1 p-3">
        {#each nav as item}
          {@const Icon = item.icon}
          <a
            href={item.href}
            aria-current={page.url.pathname === item.href ||
            (item.href !== "/" && page.url.pathname.startsWith(`${item.href}/`))
              ? "page"
              : undefined}
            onclick={() => (mobileNavOpen = false)}
            class={`group flex min-h-11 items-center gap-3 px-3 text-sm font-semibold transition-colors ${
              page.url.pathname === item.href ||
              (item.href !== "/" &&
                page.url.pathname.startsWith(`${item.href}/`))
                ? "bg-white text-ink"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>

      <div class="space-y-1 border-t border-white/12 p-3">
        {#if data.actor?.user}
          <div class="mb-3 border-b border-white/12 px-3 pb-3">
            <div class="truncate text-sm font-bold">
              {data.actor.user.displayName}
            </div>
            <div class="mt-0.5 truncate text-xs text-white/50">
              {data.actor.user.email}
            </div>
            {#if !data.demoMode}
              <form method="POST" action="/auth/logout">
                <button
                  class="mt-2 flex min-h-9 items-center gap-2 text-xs font-bold text-white/65 hover:text-white"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </form>
            {/if}
          </div>
        {/if}
        <a
          href="/settings/access"
          class="flex min-h-11 items-center gap-3 px-3 text-sm font-semibold text-white/68 hover:bg-white/8 hover:text-white"
        >
          <Users size={18} strokeWidth={1.8} /> Access
        </a>
        <a
          href="/settings"
          class="flex min-h-11 items-center gap-3 px-3 text-sm font-semibold text-white/68 hover:bg-white/8 hover:text-white"
        >
          <Settings size={18} strokeWidth={1.8} /> Settings
        </a>
        <div class="mt-3 border border-white/12 bg-white/5 p-3">
          <div
            class="text-[0.65rem] font-bold tracking-[0.08em] text-white/50 uppercase"
          >
            Document store
          </div>
          <div class="mt-2 flex items-center gap-2 text-xs font-semibold">
            <span class="size-2 rounded-full bg-[#67d7a4]"></span>
            {data.documentStore}
          </div>
        </div>
      </div>
    </aside>

    {#if mobileNavOpen}
      <button
        class="fixed inset-0 z-40 bg-ink/45 lg:hidden"
        aria-label="Close navigation"
        tabindex="-1"
        onclick={closeMobileNavigation}
      ></button>
    {/if}

    <div
      class="min-w-0"
      inert={mobileNavOpen}
      aria-hidden={mobileNavOpen ? "true" : undefined}
    >
      <header
        class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-rule bg-paper/95 px-4 backdrop-blur-sm sm:px-6 lg:hidden"
      >
        <button
          bind:this={navigationTrigger}
          class="grid size-10 place-items-center border border-rule bg-sheet"
          aria-label="Open navigation"
          aria-expanded={mobileNavOpen}
          aria-controls="primary-navigation"
          onclick={() => (mobileNavOpen = true)}
        >
          <Menu size={20} />
        </button>
        <a
          href="/"
          class="flex items-center gap-2 text-lg font-bold tracking-[-0.03em]"
        >
          <img
            src="/brand/domino-icon-192.png"
            alt=""
            width="32"
            height="32"
            class="size-8 object-contain"
            aria-hidden="true"
          />
          Domino
        </a>
        <a
          href="/products/new"
          class="grid size-10 place-items-center bg-ink text-white"
          aria-label="Add product"
        >
          <span class="text-2xl font-light">+</span>
        </a>
      </header>

      <main id="main-content" class="min-h-screen" tabindex="-1">
        {@render children()}
      </main>
    </div>
  </div>
{/if}
