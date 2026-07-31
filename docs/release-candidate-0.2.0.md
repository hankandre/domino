# Release candidate 0.2.0

This checklist records the evidence for the first independently released Domino
application and CLI. Empty publication fields are release blockers and must be
filled from the successful GitHub workflows before the release is declared
complete.

## Identity and compatibility

- Application version: `0.2.0` (`app-v0.2.0`)
- CLI version: `0.2.0` (`cli-v0.2.0`)
- Database schema: Drizzle migration `0014_easy_squadron_supreme`
- Stable HTTP contract: `/api/v1`
- CLI compatibility: Domino API v1
- PostgreSQL test target: 17

## Candidate evidence

- [x] Bun owns every unit and integration test; Vitest is scoped to
      `src/**/*.browser.ts` only.
- [x] Formatting, Svelte checks, documentation links, role-template alignment,
      Bun unit tests, browser tests, and the production build pass locally.
- [x] PostgreSQL integration tests pass against schema `0014`.
- [x] Fresh and `0.1.1` upgrade migration fixtures pass.
- [x] Rust formatting, Clippy with warnings denied, and workspace tests pass.
- [x] Local rootless builds produce non-root Distroless application, migration,
      and CLI images; runtime inspection confirms no shell or package manager,
      and the read-only application image serves health, Swagger, its local
      assets, and OpenAPI.
- [x] Bounded desktop/mobile browser acceptance covers keyboard operation, 200%
      zoom, reduced motion, responsive reflow, service-account presets, claim
      management, Paperless settings, and self-hosted Swagger.
- [x] Main-branch CI run
      [`30664881780`](https://github.com/hankandre/domino/actions/runs/30664881780)
      passed at `c0a72ee168c2db30c1226b706b62cbe2b3fc1f65`.
- [x] Native AMD64 and emulated ARM64 container smoke passed in that run.
- [x] Compose named-volume backup/restore smoke passed in that run.
- [x] Kubernetes fresh install/migration/rollout/rollback smoke passed in that
      run under restricted Pod Security admission.
- [x] Independent security, performance, accessibility, Svelte, and
      maintainability review dispositions are recorded below; no code or design
      release blocker remains.

## Published artifacts

Record immutable manifest digests after both independent workflows succeed.

- Application image `ghcr.io/hankandre/domino:0.2.0`: pending
- Migration image `ghcr.io/hankandre/domino-migrate:0.2.0`: pending
- CLI image `ghcr.io/hankandre/domino-cli:0.2.0`: pending
- Application GitHub release: pending
- CLI GitHub release and archive checksum verification: pending

## Independent review dispositions

The release reviews are rerun after the fixes below. Their final verdicts and
commit SHA must be recorded in the candidate evidence before tagging.

- Security: approved after invitation and reset authority revalidation, issuer
  invalidation, system-only human/OIDC role enforcement at issuance and
  acceptance, single-assignee service roles, selected-claim audit filtering and
  redaction, claim-scoped product notes, and Paperless refresh permissions.
- Performance: fixed browser collection pagination, generated bounded product
  thumbnails, hot relationship indexes, bounded background document cleanup,
  API authentication duplication and activity-write amplification, broad note
  projections, bounded two-wave Paperless polling with one reused client, lazy
  thumbnail upgrades, and broker HTTP client reuse.
  PostgreSQL 17 CI now publishes a reproducible query-plan artifact.
- Accessibility/Svelte: approved after fixing source versus visual order,
  server-owned inventory search/filter state, accurate empty versus no-match
  states, product-editor focus restoration, device-approval focus
  and announcements, drawer resize/modal/scroll behavior, record-local state
  keys, pending cancellation, dynamic-list focus, redundant card links, result
  announcement noise, semantic groups, and conditional class style.
- Maintainability/deployment: fixed the reused release version, full-CI release
  gating with staged image promotion, API co-location guidance, Docker context,
  and the missing published-image Compose override.
- Explicitly deferred: splitting the cohesive product read/write domain, CLI
  dispatcher, broker protocol handler, and large security fixtures is useful
  cleanup but does not change release behavior. Automated Browser Mode remains
  intentionally component-level; the deployed `agent-browser` pass supplies
  route-level acceptance. Nested detail pages remain capped at 200 records and
  disclose truncation; top-level pages and note APIs provide paging. These are
  household-scale limits, not silent data loss.

## Backup and rollback

The automated Compose path writes markers to PostgreSQL and the named upload
volume, backs them up, destroys the deployment volumes, restores both, and then
checks the markers through a ready application. Its successful CI run must be
recorded above.

Schema migrations are forward-only. Before an upgrade, coordinate a PostgreSQL
dump, upload-volume snapshot, and backup of the credential-encryption and session
secrets. A rollback after migration restores that coordinated snapshot and the
previous matching app/migration image pair; deploying only an older app image is
not a rollback. See [Backup and restore](backup-restore.md) and
[Deployment and upgrades](deployment.md).

## Known limitations

The household MVP does not yet send outbound expiration/deadline notifications,
bulk-import multiple records in one request, switch among households in the UI,
or autonomously submit/call warranty providers. Agent intake is deliberately
single-record and idempotent, while claim actions remain explicitly delegated
through permissions and selected claims.
