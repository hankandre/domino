# Deployment guide

Domino supports Docker, Compose, and Kubernetes. Production deployments require
PostgreSQL 17, durable uploads when local storage is enabled, TLS at the reverse
proxy or Ingress, and stable secret material. All first-party containers start
directly as UID/GID 10001 and have no shell.

## Compose

1. Copy `.env.example` to `.env`, generate independent database and session
   secrets, and create the optional Paperless/OIDC secret files.
2. Set `DOMINO_ORIGIN` to the exact public HTTPS origin. Leave
   `DOMINO_BIND_ADDRESS=127.0.0.1` when a same-host reverse proxy is used.
3. Render and inspect the deployment with `docker compose config`.
4. Run `docker compose up --build -d` and wait for `docker compose ps` to show
   PostgreSQL and Domino healthy and the migration service completed.
5. Open `/api/ready`, then bootstrap the first local owner as shown in README or
   sign in with the exact OIDC bootstrap-owner email.

For published images, use the checked-in override and set the app and CLI
versions independently:

```sh
DOMINO_IMAGE_TAG=0.2.0 DOMINO_CLI_IMAGE_TAG=0.2.0 \
  docker compose -f compose.yaml -f compose.published.yaml up -d --no-build
```

The override removes local builds and selects the GHCR images. Keep the app and
`domino-migrate` versions identical; the CLI may follow its own release cadence.

### Reverse proxy and client addresses

Terminate TLS at a maintained proxy and forward the original `Host`, scheme, and
request body without altering upload limits below 55 MiB. Set `ORIGIN` to the
browser-visible origin. Configure `ADDRESS_HEADER=x-forwarded-for` and `XFF_DEPTH`
only when Domino is unreachable except through the stated number of trusted hops
and the first trusted proxy overwrites incoming forwarding headers. Enforce
internet-facing request limits at the proxy because in-process limits are per
replica.

### Compose upgrades

1. Read release notes and take the coordinated backup in
   [backup-restore.md](backup-restore.md).
2. Pull/build the matching app and migration images.
3. Run `docker compose run --rm migrate`; stop if it fails.
4. Recreate the app with `docker compose up -d --no-deps app`.
5. Verify `/api/health`, `/api/ready`, `/api/docs`, sign-in, one read, and the
   upload backend. Retain the database backup until verification finishes.

Forward migrations are not automatically reversible. Restoring the old app image
after a migration is supported only when the release notes say its schema remains
compatible; otherwise restore the coordinated pre-upgrade backup.

## Kubernetes

The checked-in base is intentionally small. It needs a cluster-specific
StorageClass, database route, DNS name, TLS issuer/secret, and NetworkPolicy
adaptation before production use.

1. Copy `deploy/k8s/secret.example.yaml` outside version control or create the
   Secret through your secret controller. Prefer an external managed PostgreSQL
   service and a TLS-verified connection URL.
2. Set the PVC `storageClassName` and access mode for the cluster. A single
   replica with `ReadWriteOnce` is the default. Multiple replicas need shared
   writable storage or Paperless-only document custody.
3. Set `ORIGIN`, OIDC, and Paperless values in the ConfigMap. Apply a cluster-
   specific Ingress based on `deploy/k8s/ingress.example.yaml`.
4. Update the NetworkPolicy database egress target. The base selector expects an
   in-namespace pod labelled `app.kubernetes.io/name=postgres`; an external
   database needs the overlay described below or a cluster-supported egress rule.
5. Pin the app and migration images to the same published version or digest.
6. Apply the namespace/config/storage/policy prerequisites, then apply the new
   versioned migration Job and wait for `Complete`.
7. Apply the Deployment and wait for rollout. Readiness checks PostgreSQL and
   local storage; Paperless health is advisory and does not make Domino unready.

Kubernetes can and does enforce the numeric identity independently of the image:
the pod security context sets `runAsNonRoot`, `runAsUser`, `runAsGroup`, and
`fsGroup` to 10001. The container context drops all capabilities, blocks privilege
escalation, and uses a read-only root filesystem. The image declares the same
user so none of these controls relies on starting as root.

Use `kubectl kustomize deploy/k8s` for base validation and
`kubectl kustomize deploy/overlays/external-database` for the external-database
variant. The example overlay removes the in-cluster PostgreSQL selector but must
be narrowed to your provider's supported IP/CIDR or egress gateway before use.

## Troubleshooting

- `ready` reports database failure: verify DNS/TLS, credentials, NetworkPolicy,
  and that migrations completed against the same database.
- upload storage is not writable: mount a volume whose effective group permits
  GID 10001; do not add a root init container just to run `chown`.
- OIDC callback fails: compare the exact HTTPS callback, issuer discovery URL,
  client ID/secret file, session secret length, public `ORIGIN`, and provider
  group policy.
- Paperless fails: test its URL from the workload network, verify the token, and
  allow HTTPS egress. Domino will not fall back to local storage.
- client throttling sees one address: either leave direct-peer behavior or set
  the trusted forwarding variables exactly as described above.
