# Release verification policy

Release tags are split into `app-vX.Y.Z` and `cli-vX.Y.Z`. GitHub protects the
source and generated release record; release automation publishes only after its
version-specific checks succeed.

Application, migration, and CLI container builds publish OCI SBOM and BuildKit
provenance attestations. Record and deploy the immutable manifest digest shown by:

```sh
docker buildx imagetools inspect ghcr.io/hankandre/domino:X.Y.Z
docker buildx imagetools inspect ghcr.io/hankandre/domino-migrate:X.Y.Z
docker buildx imagetools inspect ghcr.io/hankandre/domino-cli:X.Y.Z
```

Confirm that the app and migration manifests came from the same `app-vX.Y.Z`
release before rollout. CLI archives include a one-file SHA-256 checksum generated
in the same locked release workflow. Download both over authenticated HTTPS and
run `sha256sum --check` before extraction.

The project does not currently publish a separate maintainer-key or keyless
signature for archives, and it does not describe a checksum as a signature. OCI
provenance, immutable digests, GitHub release identity, and archive checksums are
the current verification boundary. A future signing mechanism must be added to
the workflows and this policy together before releases claim signature support.
