# CLI installation and operation

The Rust CLI is released independently from the browser app. Download the archive
for `x86_64-unknown-linux-musl` or `aarch64-unknown-linux-musl` from a `cli-vX.Y.Z`
release, download its checksum file, then verify before extracting:

```sh
sha256sum --check domino-cli-vX.Y.Z-x86_64-unknown-linux-musl.tar.gz.sha256
tar -xzf domino-cli-vX.Y.Z-x86_64-unknown-linux-musl.tar.gz
install -m 0755 domino ~/.local/bin/domino
```

The same version is published as `ghcr.io/hankandre/domino-cli:X.Y.Z`. Source
installation uses
`cargo install --locked --git https://github.com/hankandre/domino.git --tag cli-vX.Y.Z domino-cli`.

Compatibility is expressed by API major version: CLI 0.2.x uses `/api/v1` and is
tested with app 0.2.x. Before 1.0, upgrade both streams when either release notes
announce a contract change even though they remain independently publishable.

Run `domino --help` and each subcommand's `--help` for the complete contract.
`auth login` performs one-time device authorization. Native operation stores the
credential in the platform configuration directory with owner-only permissions;
the container stores it in `/home/domino/.config/domino`. Set `DOMINO_SERVER` or
pass `--server`. Plain HTTP is rejected unless `DOMINO_ALLOW_INSECURE_HTTP=true`
is deliberately set for a private development network.

Use `--json` for agents and automation. Standard output then contains only the
documented JSON result; diagnostics go to standard error. Success exits 0 and
validation, authorization, conflict, network, partial attachment, and server
errors exit nonzero. Automation must consume fields rather than human text and
must treat a nonzero record-creation result as potentially containing a committed
product plus failed attachment components.

For credential isolation, run `domino broker serve` under a separate OS identity
or sidecar and give the agent only `DOMINO_BROKER_SOCKET`. See README and
[ADR 0004](adr/0004-cli-broker-isolation.md). Do not give the agent the config
directory, credential file, container socket, or orchestration privileges.

Troubleshooting:

- device code expires: restart `auth login`; codes are single-use and short-lived;
- permission denied: inspect the service account's permission and claim presets;
- server mismatch: pass the intended `--server` during login and invocation;
- broker connection fails: verify socket path, group ownership/mode 0660, and
  that the broker—not the agent—can read the credential;
- JSON command fails after product creation: inspect `components` and retry the
  same idempotent manifest after fixing the attachment problem.
