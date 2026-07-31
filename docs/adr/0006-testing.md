# ADR 0006: Bun owns unit and integration tests

Status: accepted

`bun:test` runs every unit and integration test: TypeScript logic, Svelte server
code, Hono handlers, and PostgreSQL behavior. Vitest Browser Mode is used only
for `.browser.ts` tests that need a real browser to render and interact with the
Svelte UI. It is not an alternative unit or integration runner. Playwright is a
browser provider, not a second test runner; `@playwright/test` is not used.
These are fast component-interaction checks with controlled props and fetch
stubs; they do not claim to cover SvelteKit routing, SSR, or live authentication.
The bounded `agent-browser` acceptance pass exercises the deployed application.

Migration tests cover a fresh database and the last released schema. Contract
tests compare Hono's route table with OpenAPI. A short manual browser acceptance
pass follows automated checks before release.
