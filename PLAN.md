# Domino completion plan

Last updated: 2026-07-31

This document consolidates the implementation, security, performance,
accessibility, documentation, deployment, and release feedback collected during
the household MVP review. It is the working checklist for taking Domino from the
current `0.1.1` baseline to a release that is safe to recommend for self-hosted
households.

## Status legend

- `[x]` already present in the repository; retain and verify it.
- `[-]` implementation is currently in the working tree but is not yet ready to
  merge or release.
- `[ ]` work remains.

## Decisions that guide the work

- Keep the existing polyglot repository. Do not introduce Turborepo while there
  is only one JavaScript application and one Rust workspace. Reconsider only if
  another JavaScript application or substantial shared package graph appears.
- Release the browser application and Rust CLI independently. They may share a
  repository and API contract without sharing a release cadence.
- Use Bun's test runner for every unit and integration test, including server,
  Hono handler, and database coverage. Vitest Browser Mode is limited to tests
  that require a real browser for rendered Svelte UI interactions; it is not a
  replacement unit or integration runner. Do not create a standalone Playwright
  test suite. A browser provider is an implementation detail, not the test API.
  Keep `agent-browser` for bounded exploratory checks and screenshots.
- Keep Hono as the `/api/v1` boundary and validate every path, query, header,
  JSON, and form input with `zValidator` and shared Zod schemas.
- Preserve Paperless-ngx as the authoritative document store when a household
  selects it. Domino must not silently fall back to local storage.
- Preserve PostgreSQL as the production database and Drizzle-generated,
  forward-only migrations as the schema-change mechanism.
- First-party containers must start and remain non-root. Keep the application,
  migration, CLI, and broker images Distroless with no shell or package manager.
- Treat a service account's permissions and claim selection as one authority
  boundary. A manager may never grant, edit, disable, reset, or revoke an
  identity with authority the manager does not possess.
- Prefer a small number of well-named domain modules and route-local components
  over abstract frameworks or line-count-driven fragmentation.

## Current baseline

The following capabilities are already implemented and should be protected by
regression tests rather than rebuilt:

- [x] Household products, warranties, notes, documents, product images, claims,
      claim events, instructions, and evidence tracking.
- [x] Dedicated pages for open claims and expiring warranties rather than
      dashboard controls that masquerade as toggling filters.
- [x] Local document storage and configurable Paperless-ngx storage, including
      URL and token management in the web UI.
- [x] Local authentication, invitation-only household membership, Pocket ID and
      standards-compliant OIDC, sessions, roles, and service accounts.
- [x] Rust CLI search and record-management flows, browser device authorization,
      and a credential-isolating broker for agents such as Hermes.
- [x] Docker, Compose, Kubernetes manifests, dedicated migration image, health
      endpoints, and UID/GID `10001` security contexts.
- [x] Pinned Distroless Node.js and static runtime images, read-only root
      filesystems, dropped Linux capabilities, seccomp, SBOMs, and provenance.
- [x] A self-hosted Swagger UI at `/api/docs` and OpenAPI document at
      `/api/openapi.json`.
- [x] A product identity that uses a restrained domino motif without borrowing a
      copyrighted character likeness.

The current working tree also contains uncommitted claim-delegation work:

- [x] Permission presets for read-only, inventory intake, claim assistance, and
      broader household-agent use.
- [x] Claim presets for all claims, open claims, claims needing attention, or no
      existing claims, with manual selection afterward.
- [x] Device approval and service-account settings that persist selected claim
      access.
- [x] Claim-scope authority checks and an invitation schema migration.

Do not commit or release that in-flight work until Phase 1 is complete.

## Phase 1 — Finish claim delegation safely

This is the immediate release blocker because it changes the authorization
model and contains a database migration.

### Authority model

- [x] Replace optional claim arrays with a discriminated authority type:
      `{ scope: "all" } | { scope: "selected"; claimIds: readonly string[] }`.
- [x] Add one transaction-compatible `loadActorAuthority(db, actorId,
householdId)` function and use it for service accounts, human accounts,
      invitations, resets, role changes, disabling, and revocation.
- [x] Load and verify both manager and target authority inside the same database
      transaction as every authority-changing mutation. Remove the current
      check-then-mutate windows from claim-scope updates and service-account
      revocation.
- [x] Reject every delegated claim that is outside the manager's claim set or
      household. Do not trust claim IDs supplied by the browser or CLI.
- [x] Ensure a selected-scope actor automatically receives access to a claim it
      creates, and that this is audited.
- [x] Add a database constraint for the claim-scope vocabulary. Where a direct
      same-household foreign key is impractical, enforce the invariant in the
      transaction and cover it with database tests.

### Invitations and migration safety

- [x] Change migration `0008` so pre-existing pending invitations do not
      silently acquire all-claim access. Either revoke those invitations during the
      migration or safely backfill the inviter's scope and selected claims; document
      the chosen behavior in the migration.
- [x] Let an authorized administrator choose all or selected claim access when
      inviting a human. Default to the inviter's effective scope and prohibit
      escalation.
- [x] Persist the invitation's exact claim set and apply it atomically when the
      invitation is accepted.
- [x] Add migration tests for a fresh database and an upgraded `0.1.1` database
      containing pending invitations.

### Preset behavior and UI

- [x] Track the selected preset by explicit ID. Do not infer it only by comparing
      sets, because two presets can resolve to the same set when a household has no
      matching claims.
- [x] Clear the active preset when an administrator manually changes a
      permission or claim selection.
- [x] Extract shared pure preset functions and route-local
      `PermissionPresetPicker` and `ClaimAccessPicker` components so device approval,
      service-account editing, and human invitations use the same behavior.
- [x] Replace the nested `<main>` on the device-approval page with a semantic
      `<section>` or `<div>` because the root layout already owns the page landmark.
- [x] Handle network and invalid-response failures with `try/catch/finally`, an
      actionable error message, and a reliably reset pending state.
- [x] Use Svelte class arrays or `class:` directives where selection state is
      currently expressed through long interpolated class strings.

### Phase 1 acceptance criteria

- [x] A restricted manager cannot create, expand, modify, disable, reset, or
      revoke a human or service account whose permissions or claim access exceed
      the manager's own authority.
- [x] All, open, needs-attention, none, and manual selections behave distinctly
      for households with zero, one, and many claims.
- [x] Database-backed tests cover device approval, service-account editing,
      invitation acceptance, household isolation, unauthorized claim IDs,
      revocation, and concurrent authority changes.
- [x] The generated migration, schema snapshot, and authorization tests pass on
      both fresh and upgrade paths.

## Phase 2 — Resolve correctness and security blockers

### Record editing and transactions

- [x] Remove stale `untrack` snapshots from same-route product and claim
      navigation. Use read-only derived data and key route-local editor components
      by record ID so navigating from record A to B cannot submit A's IDs with B's
      route.
- [x] Replace the product page's two-request "single save" with one transactional
      product-and-warranty mutation. If separate saves remain visible, label them as
      separate operations and report partial success explicitly.
- [x] Put archive state changes and their audit event in one transaction.
- [x] Make document purge failure-safe: do not leave a live database record
      pointing to a file that was already deleted. Define and test the retry and
      cleanup behavior.
- [x] Standardize mutation responses and client error parsing so notes,
      documents, images, device approval, and claims cannot fail silently or remain
      indefinitely pending.

### Abuse resistance and information disclosure

- [x] Make create-only duplicate detection return only the information needed to
      resolve a duplicate. Do not disclose unrelated product details to an actor
      without product-read permission.
- [x] Enforce upload limits before buffering wherever the runtime permits,
      reject oversized `Content-Length` immediately, stream local/Paperless uploads,
      and test missing or deceptive length headers.
- [x] Add application- or ingress-level rate limits for device enrollment,
      authentication, invitations, password resets, image fetching, and expensive
      searches. Preserve the outstanding-device-flow cap as a second control.
- [x] Ensure login throttling keys do not allow one reverse-proxy address to lock
      out every user. Document trusted-proxy configuration before using forwarded
      client addresses.
- [x] Retest outbound image and Paperless fetches for SSRF protections,
      redirects, DNS rebinding, timeouts, response limits, and private-address
      rejection.

### Phase 2 acceptance criteria

- [x] Same-route navigation cannot update the wrong product, warranty, or claim.
- [x] Aggregate edits, audit events, and authority changes are atomic.
- [x] Upload, fetch, login, and enrollment abuse cases have automated negative
      tests and documented operator controls.
- [x] No mutation failure is silent in the UI or CLI JSON output.

## Phase 3 — Simplify and co-locate the implementation

Refactor in behavior-preserving slices after the security boundaries above are
covered by tests.

### Server and API

- [x] Split the large Hono application into domain route modules such as auth,
      devices, products, warranties, claims, documents, images, integrations, and
      service accounts. Mount them with `app.route(...)` while preserving exported
      Hono RPC types.
- [x] Co-locate each route's Zod inputs, handlers, OpenAPI metadata, and focused
      tests. Every external input must pass through `zValidator`.
- [x] Move access-management orchestration out of the 787-line page server into
      an authorization/service module whose functions accept a transaction-capable
      database object.
- [x] Split local auth and OIDC by responsibility—configuration/discovery,
      callback verification, provisioning/linking, sessions, invitations, and
      resets—without duplicating policy checks.
- [x] Keep built-in role and permission templates in one source of truth used by
      bootstrap, OIDC provisioning, migrations, UI presets, and tests.

### Svelte UI

- [x] Split the product detail route into record header, product editor, warranty
      editor, image panel, notes, documents, and archive controls. Keep state owned
      by the smallest component that submits it.
- [x] Split the new-product route into product fields, warranty fields, image
      selection, and document attachments.
- [x] Split the claim detail route into claim editor, instructions/checklist,
      evidence/documents, notes, and timeline.
- [x] Split access settings into people, invitations, service accounts,
      permission presets, and claim access controls.
- [x] Prefer route-private components beside their route; move a component into
      `$lib` only after two real consumers share it.

### Rust CLI

- [x] Split the CLI entry point into command definitions, API client, auth,
      credential storage, broker/protocol, record manifest, search, and output
      modules.
- [x] Replace loosely typed `serde_json::Value` response handling with explicit
      API response types for stable commands and structured errors.
- [x] Add broker protocol and Unix-socket integration tests, including credential
      non-disclosure, permissions, cancellation, and server error forwarding.

### Performance

- [x] Replace product-summary nested scans with indexed maps or grouped queries;
      avoid work proportional to products multiplied by every related collection.
- [x] Load product detail directly rather than materializing every household
      summary and selecting one.
- [x] Replace household-wide duplicate-detection loads with indexed identifier
      queries and a bounded fuzzy candidate set.
- [x] Review and add indexes for common household/status/date/product-name,
      claim-scope, warranty-expiration, order-number, serial-number, and external-ID
      lookups using representative query plans.
- [x] Add pagination or bounded result limits to inventory, documents, claims,
      audit history, and CLI searches before household size can make responses
      unbounded.

### Phase 3 acceptance criteria

- [x] The large files are divided by cohesive responsibilities, not arbitrary
      line limits, and public behavior remains covered by tests.
- [x] API typing, validation, and documentation remain intact after route splits.
- [x] Representative list/detail/search queries have recorded baselines and no
      obvious N-by-M processing or unbounded result path.

## Phase 4 — UI clarity, resilience, and accessibility

- [x] Keep dashboard attention items as links to dedicated open-claim and
      expiring-warranty pages. Put actual filtering and sorting behind an explicitly
      labeled Filter & Sort control.
- [x] Remove internal engineering language such as "routes" from user-facing
      copy. Use products, claims, coverage, steps, or pages according to context.
- [x] Make product-image choices a labelled radio group. Treat image previews as
      previews, not buttons, unless they perform an action.
- [x] Move the dashboard search clear button outside its `<label>` and give the
      input an explicit accessible label.
- [x] Ensure long document names wrap or truncate without forcing horizontal
      overflow, with the full name still available accessibly.
- [x] Bring all interactive targets to the design system's 44px minimum and
      replace one-off colors with named design tokens.
- [x] Verify keyboard order, visible focus, landmarks, headings, fieldset/legend
      use, form errors, `aria-live` announcements, reduced motion, high zoom, and
      state communication that does not rely on color.
- [x] Preserve a compact household overview while elevating open claims and
      expiring warranties. On product and claim pages, keep coverage, required
      evidence, contact details, deadlines, and the next action easy to scan under
      stress.
- [x] Make claim instructions editable as explicit contacts, eligibility notes,
      submission methods, deadlines, evidence, and checklist steps so future agents
      can act on structured data rather than prose alone.

### Phase 4 acceptance criteria

- [x] Core flows work at mobile and desktop widths, 200% browser zoom, keyboard
      only, and with reduced-motion preferences.
- [x] Automated accessibility checks have no serious violations, and manual
      checks cover dialogs/overlays, file inputs, preset pickers, status changes, and
      the mobile navigation rail.
- [x] Every async action has a visible pending state, success confirmation, and
      recoverable error state.

## Phase 5 — Keep unit/integration tests in Bun and add browser UI coverage

### Fast tests

- [x] Add ordinary Bun tests for authority set operations, preset resolution,
      search/date parsing, claim status grouping, serializers, and error mapping.
- [x] Keep Svelte server and Hono handler tests in Bun and share fixture
      builders rather than maintaining demo-only assertions.

### PostgreSQL integration tests

- [x] Create isolated database fixtures for migrations, transactions, RBAC,
      claim scope, invitations, device flows, OIDC linking/provisioning, Paperless
      references, idempotent record intake, and audit history.
- [x] Run them in CI against the supported PostgreSQL major version and include
      an upgrade fixture from the last released schema.

### Real-browser UI tests

- [x] Configure a separate Vitest Browser Mode project only for rendered Svelte
      interactions and browser flows. Keep every unit and integration test on
      `bun:test`; do not introduce `@playwright/test` as a second test runner.
- [x] Start with reusable components: permission presets, claim access picker,
      filter/sort controls, image picker, document rows, error banners, and claim
      checklist.
- [x] Cover a compact set of high-value integrated flows: local sign-in,
      inventory creation, product/warranty editing, claim creation and update,
      Paperless settings, device approval with scoped claims, and service-account
      revocation.
- [x] Include automated accessibility assertions in browser tests where useful,
      while retaining a small manual keyboard and screen-reader checklist.

### Exploratory checks

- [x] After automated checks pass, use `agent-browser` for a bounded desktop and
      mobile acceptance pass, screenshots, console/network errors, and awkward
      empty/error/long-content states.

## Phase 6 — Complete the API contract and Swagger documentation

- [x] Inventory every `/api/v1` route and make the OpenAPI document complete;
      the current document covers only a subset of the Hono surface.
- [x] Generate or co-locate schemas from the same Zod definitions used by
      `zValidator` so runtime validation, RPC typing, CLI contracts, examples, and
      Swagger cannot drift silently.
- [x] Document authentication, device authorization, permissions, claim scope,
      pagination, idempotency, multipart limits, error envelopes, and rate limits.
- [x] Add contract tests that compare registered routes with documented routes
      and fail when an undocumented endpoint is added.
- [x] Decide whether the Svelte browser client will use the exported Hono RPC
      client. Either adopt it consistently for API calls or correct documentation
      that currently claims it is already used directly.
- [x] Keep Swagger assets self-hosted and test the UI and OpenAPI endpoints in
      the Distroless image.

## Phase 7 — Make the repository operable by humans and agents

### Agent documentation

- [x] Add `AGENTS.md` at the repository root and point it to `PRODUCT.md`,
      `DESIGN.md`, this plan, and the architecture documentation.
- [x] Document repository commands, Svelte 5 patterns, route-local component
      guidance, Hono plus `zValidator`, Drizzle migration rules, test placement, and
      the required validation matrix.
- [x] Record security invariants: authority subset checks, claim-scope filtering
      on related projections, Paperless/local ownership, secret handling, audit
      transactions, non-root Distroless images, and broker credential isolation.
- [x] Document which version references must change for app and CLI releases.

### Human documentation

- [x] Correct the development quickstart: either set
      `DOMINO_DEMO_MODE=true` explicitly for the demo or provide PostgreSQL and run
      migrations before `bun run dev`.
- [x] Add a production deployment guide covering Compose, external PostgreSQL,
      reverse proxy/TLS, origin and trusted-proxy settings, first-owner bootstrap,
      OIDC/Pocket ID, Paperless, storage permissions, upgrades, and troubleshooting.
- [x] Add Kubernetes guidance for StorageClasses, external managed PostgreSQL,
      DNS, Ingress/TLS, NetworkPolicy adaptation, migration Jobs, rollouts, and image
      digests.
- [x] Add backup and restore procedures for PostgreSQL, local uploads, session
      secrets, credential-encryption keys, OIDC secrets/configuration, and Paperless
      references. Include restore verification, PostgreSQL major upgrades, and
      rollback limits after forward-only migrations.
- [x] Add secret generation, rotation, and recovery procedures. State which
      rotations invalidate sessions or make stored integration credentials
      unreadable.
- [x] Add CLI installation instructions for each supported platform, checksum
      verification, configuration paths, broker setup, JSON contracts, exit codes,
      and troubleshooting.
- [x] Add root `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and an architecture
      overview. Resolve the CLI crate's MIT declaration by including the matching
      license text.
- [x] Add short architecture decision records for Hono versus SvelteKit actions,
      RBAC and claim scoping, Paperless authority, CLI broker isolation, migration
      Jobs and Distroless runtimes, testing, and release/versioning policy.
- [x] Expand `.env.example` so every supported operator setting is represented
      and clearly distinguishes a value from a secret-file path.

## Phase 8 — Harden deployment and separate releases

### Preserve and test the existing container posture

- [x] Application and migration images use pinned Node.js Distroless bases.
- [x] CLI and broker use a pinned static Distroless base.
- [x] Images declare `USER 10001:10001`; Compose and Kubernetes also enforce the
      user explicitly.
- [x] Kubernetes sets `runAsNonRoot`, drops all capabilities, disables privilege
      escalation, uses a read-only root filesystem, disables service-account-token
      mounting, and enables runtime-default seccomp.
- [x] Add container smoke tests for health/readiness, migrations, writable upload
      storage, read-only filesystem behavior, graceful shutdown, and both CPU
      architectures.
- [x] Test Compose upgrade and restore flows with real named volumes.
- [x] Add Kubernetes validation and smoke tests for fresh install, migration Job,
      rollout, restricted Pod Security admission, PVC permissions, NetworkPolicy,
      and rollback behavior.
- [x] Publish an optional Ingress example and an external-database overlay rather
      than pretending one topology fits every cluster.

### Independent release streams

- [x] Adopt explicit tag namespaces, for example `app-vX.Y.Z` and
      `cli-vX.Y.Z`, so an app release does not trigger CLI publishing and vice
      versa. Document compatibility as an API-version range.
- [x] Give the app and CLI separate version sources and make the verification
      script validate only artifacts owned by the active release stream.
- [x] Keep application and migration images atomic within one app release. Do
      not publish one without the other.
- [x] Keep CLI archives, checksums, and the CLI container atomic within one CLI
      release.
- [x] Verify every published version reference in package metadata, Cargo
      metadata, OpenAPI, README examples, Compose, Kubernetes, and release notes.
- [x] Continue publishing multi-architecture images, SBOMs, provenance, immutable
      digests, and checksum files. Add a documented signature/verification policy.
- [x] Add `bun run lint`, documentation link checks, OpenAPI coverage, migration
      upgrade tests, and Compose/Kubernetes validation to CI.

## Phase 9 — Final review and release gate

Run this only after Phases 1–8 are complete for the intended release scope.

- [x] Run `bun run lint`, `bun run check`, all Bun and Vitest Browser Mode tests,
      and `bun run build`.
- [x] Run `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets
-- -D warnings`, and `cargo test --workspace --locked`.
- [x] Run fresh and upgrade database migrations against PostgreSQL.
- [x] Build and inspect every application, migration, and CLI image; verify the
      configured numeric user and confirm there is no shell or package manager.
- [x] Validate Compose and Kubernetes manifests and execute their smoke tests.
- [x] Run the bounded `agent-browser` acceptance check after the Vitest Browser
      Mode suite is green.
- [x] Run fresh, independent security, performance, accessibility, Svelte, and
      maintainability reviews. Triage every finding as fixed, explicitly deferred
      with rationale, or release-blocking.
- [ ] Produce a release-candidate checklist with schema version, app version, CLI
      compatibility, image digests, backups tested, known limitations, and rollback
      instructions.
- [ ] Commit the completed scope, push it, wait for CI, publish the appropriate
      independent release, and verify archives, checksums, images, Swagger, health,
      migrations, and a clean install from the published artifacts.

## Deferred product work

These are valuable directions but are not prerequisites for the household MVP
unless explicitly promoted into a release milestone:

- [ ] Outbound warranty-expiration and claim-deadline notifications.
- [ ] Multi-record bulk import beyond the idempotent single-record agent
      manifest.
- [ ] Multi-household switching and administration in the browser.
- [ ] Autonomous claim-form submission, email handling, or phone calls by Hermes
      or OpenClaw. The current milestone is structured instructions, least-privilege
      access, explicit human approval, and a complete audit trail that make later
      automation safe to design.

## Definition of done

Domino is ready for the next public release when all release-scoped checkboxes
above are complete, every required CI and deployment check passes from a clean
checkout, no known authorization or data-integrity blocker remains, a household
operator can install, back up, restore, upgrade, and troubleshoot it using only
the repository documentation, and an administrator can delegate inventory and
claim work to an agent without exposing credentials or granting authority beyond
the selected permissions and claims.
