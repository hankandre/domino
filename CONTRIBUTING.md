# Contributing

Start with [AGENTS.md](AGENTS.md) even when contributing manually; it is the
shortest statement of the repository's architecture and safety rules. Discuss a
large behavior or schema change in an issue before implementation.

Use a focused branch and keep generated migrations, schema changes, code, tests,
and documentation in the same pull request. Do not rewrite unrelated user work
or generated migration history.

The minimum local checks are:

```sh
bun install --frozen-lockfile
bun run lint
bun run check
bun run test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
bun run build
```

Run Browser Mode, PostgreSQL integration, migration, and deployment checks when
the changed area needs them. Bun is the only unit/integration test runner;
Vitest is reserved for `.browser.ts` checks that require a real browser.
Those tests cover rendered component interactions; use the documented bounded
`agent-browser` pass when a change needs route-level deployed-app confidence.
Before a release, complete the short
[accessibility checklist](docs/accessibility-checklist.md) after the automated
browser checks are green.

By submitting a contribution, you agree that it is licensed under the repository
[MIT license](LICENSE).
