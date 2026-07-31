# ADR 0007: App and CLI release independently

Status: accepted

App tags use `app-vX.Y.Z`; CLI tags use `cli-vX.Y.Z`. The app release publishes
matching web and migration images. The CLI release publishes matching archives,
checksums, and a CLI/broker image. A release never combines artifacts from two
versions under one mutable tag.

The app version source is `package.json`; OpenAPI and deployment references must
match it. The CLI version source is `crates/domino-cli/Cargo.toml`; `Cargo.lock`
and CLI examples must match it. Workflows verify tag namespaces and metadata
before publishing multi-architecture images, SBOMs, provenance, and immutable
digests.

Each namespaced release calls the complete reusable CI workflow first. Images
are built and pushed under commit-scoped staging tags; version tags are promoted
only after the stream's complete artifact set succeeds. This prevents a reduced
tag check from racing comprehensive validation or publishing the first image
before its companion is buildable.
