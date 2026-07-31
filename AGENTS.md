# Working on Domino

Read [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md), [PLAN.md](PLAN.md), and
[docs/architecture.md](docs/architecture.md) before changing behavior. The plan
is the delivery checklist; do not mark an item complete until its acceptance
condition is actually verified.

## Repository conventions

- Use Bun for JavaScript and TypeScript installs, developer scripts, unit tests,
  Hono handler tests, and PostgreSQL integration tests. Operational scripts that
  also run in the Distroless Node.js image may deliberately use Node; keep them
  compatible with that runtime.
- Vitest is only for `.browser.ts` interaction tests in the separate Browser
  Mode project. Do not migrate unit or integration tests from `bun:test`, and do
  not add `@playwright/test`.
- Use Svelte 5 runes and event attributes. Keep state in the smallest component
  that owns the submission. Prefer route-private components; move one to
  `src/lib/components` only after it has two real consumers.
- Prefer Svelte's `class:` directive or array/object class values for conditional
  styles. Reuse the named tokens in `src/app.css`; do not add isolated color
  literals when a semantic token fits.
- Mount Hono domains from `src/lib/server/api.ts`. Validate every external path,
  query, header, form, and JSON value with `zValidator` before the handler reads
  it. Browser JSON calls use `src/lib/api-client.ts`; raw bounded uploads are the
  deliberate exception.
- Keep each Hono domain's Zod inputs and OpenAPI metadata beside its handler in
  `*.schemas.ts` and `*.contract.ts`. The aggregate compatibility barrels must
  stay thin, and the Bun co-location and Swagger tests must continue to prove
  parity with Hono's route table.
- Put database policy and mutations in `src/lib/server/domain` or an auth service,
  not in route handlers or by calling one HTTP handler from another.
- Change `src/lib/server/db/schema.ts` first, then generate and review a forward-
  only Drizzle migration. Never edit a migration that may have shipped. Add both
  fresh and previous-release upgrade coverage.
- Keep the Rust CLI split by command, API, auth, broker, record, response, search,
  and output responsibility. Stable command responses use typed structs, not
  unstructured `serde_json::Value`.

## Security invariants

- A manager can delegate only a subset of their own permissions and claim scope.
  Re-check the grantor inside the same locked transaction that changes authority.
- `claimAccessScope=selected` applies to claims and every related product
  projection, note, document, and content download. An inaccessible identifier is
  reported as not found.
- Paperless-ngx is authoritative when selected. Never silently fall back to local
  storage, return saved tokens, or delete a Paperless original when unlinking.
- Secrets enter through secret files in production. Tokens, sessions, device
  codes, invitations, and reset values are stored encrypted or hashed as designed.
- Mutations and authority changes write audit data in the same transaction.
- First-party containers run directly as UID/GID 10001 on read-only Distroless
  filesystems. Do not introduce a root entrypoint, shell, package manager, `su`,
  or runtime ownership fixup.
- The CLI broker owns credentials. Agent-facing clients receive only the Unix
  socket and must never receive a token, credential file, broker config volume,
  or Docker daemon access.

## Validation matrix

Run the smallest relevant checks while iterating, then before handoff run:

```sh
bun run lint
bun run check
bun run test
bun run test:browser
DATABASE_URL=postgresql://... bun run test:integration
DATABASE_URL=postgresql://... bun run test:migrations
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
bun run build
```

Browser Mode needs Chromium; CI installs it with Playwright's browser provider.
Unit and integration tests never require Vitest. Deployment changes also require
Compose rendering, Kubernetes rendering, and image smoke tests described in
[docs/deployment.md](docs/deployment.md).

## Releases

The app and CLI release independently. App references live in `package.json`,
the OpenAPI `info.version`, README examples, Compose/Kubernetes image references,
and app release workflow. CLI references live in `crates/domino-cli/Cargo.toml`,
`Cargo.lock`, README examples, and the CLI release workflow. Follow
[docs/adr/0007-release-versioning.md](docs/adr/0007-release-versioning.md).
