# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
security-advisory flow for this repository and include the affected version,
deployment shape, reproduction steps, impact, and any suggested mitigation.
Avoid including real household data or credentials.

No response-time SLA is promised before the project publishes a stable release.
Maintainers will acknowledge a valid report privately, coordinate a fix and
disclosure, and credit the reporter when requested.

## Supported versions

Until 1.0, only the latest app release and latest CLI release receive security
fixes. They are versioned and published independently. Operators should subscribe
to both release streams when they deploy both artifacts.

## Deployment boundary

Domino protects household data only when operators also protect PostgreSQL,
secret files, upload volumes, the reverse proxy, and host/container control
planes. Do not expose the application without TLS, trust arbitrary forwarded
address headers, mount the Docker socket into an agent, or share the broker's
credential volume with the agent-facing CLI.

See [docs/deployment.md](docs/deployment.md), [docs/secrets.md](docs/secrets.md),
and [docs/backup-restore.md](docs/backup-restore.md) for the supported posture.
