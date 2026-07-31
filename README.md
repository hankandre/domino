# Domino

Domino is a self-hosted household warranty tracker for products, coverage, manuals, receipts, notes, and claims. It can store documents itself or defer to Paperless-ngx as the authoritative document store. A typed Hono API and CLI make the same records available to humans and restricted agents.

The `0.1.1` household MVP persists products, warranties, structured claim instructions, notes, claims and timelines, document references, images, people, roles, sessions, invitations, and service credentials in PostgreSQL. Compose defaults demo mode off and binds to loopback; the development environment can still use the explicit demo dataset.

## Stack

- SvelteKit 2 and Svelte 5
- Tailwind CSS 4
- Drizzle ORM and PostgreSQL
- Hono RPC-compatible API contract
- Bun for web development, Node for the production server, and Rust for the separately distributed CLI and credential broker

## Develop

```sh
bun install
bun run dev
```

The demo inventory is available at `http://localhost:5173`. Validate with:

```sh
bun run check
bun test
bun run build
cargo test --workspace
```

## Docker Compose

Create the mounted secret files even when their integrations are disabled:

```sh
mkdir -p secrets
touch secrets/paperless_token
touch secrets/oidc_client_secret
openssl rand -base64 48 > secrets/session_secret
cp .env.example .env
# Replace POSTGRES_PASSWORD in .env with another independently generated value.
docker compose up --build
```

Compose binds Domino to `127.0.0.1` by default, which is appropriate for local evaluation and a same-host reverse proxy. Set `DOMINO_BIND_ADDRESS` deliberately if the container must listen on another host interface. Demo mode is disabled unless `DOMINO_DEMO_MODE=true`; because it is unauthenticated, enable it only on loopback for deliberate evaluation.

The Domino application and migration containers start directly as UID/GID `10001`. They never start as root, call `su`, or change identity. The bundled PostgreSQL service also starts directly as its image's numeric UID/GID `70`, rather than starting as root and dropping privileges. Migrations run in the separate `migrate` service before the app becomes eligible to start. Runtime root filesystems are read-only; only the explicitly mounted data and temporary paths are writable. The Docker build context excludes `.env`, `secrets/`, and application data.

The browser application and Rust CLI are separate images:

```text
ghcr.io/hankandre/domino:0.1.1
ghcr.io/hankandre/domino-migrate:0.1.1
ghcr.io/hankandre/domino-cli:0.1.1
```

The web and migration targets use pinned Node.js Distroless Debian images. The statically linked Rust CLI/broker uses a pinned static Distroless Debian image. They contain no shell or package manager. Application production dependencies and migration tooling are installed into separate targets, and every first-party runtime starts directly as UID/GID `10001`.

### First local owner

When OIDC is not creating the first owner, run the one-time bootstrap command after migrations. It refuses to run once any human account exists and reads the password from a file:

```sh
docker compose run --rm \
  -v "$PWD/secrets:/run/bootstrap:ro" \
  migrate scripts/bootstrap-owner.mjs \
  --email owner@example.test \
  --name "Household owner" \
  --password-file /run/bootstrap/owner_password
```

Delete `owner_password` after the command succeeds. Further local accounts are invitation-only and are managed under **Access → People & agents**. Owners can issue one-hour password-reset links there; Domino stores only hashes of invitations, resets, sessions, and API credentials.

## Kubernetes

1. Copy `deploy/k8s/secret.example.yaml`, replace its values, and apply it. The example NetworkPolicy expects an in-namespace PostgreSQL workload labelled `app.kubernetes.io/name: postgres`; adapt the database egress rule when using an external managed database.
2. Apply the versioned `deploy/k8s/migrate-job.yaml` and wait for completion.
3. Apply `deploy/k8s/kustomization.yaml`.

Each release uses a versioned migration Job name because Kubernetes Job pod templates are immutable. Before a future upgrade, apply that release's new Job manifest and wait for it rather than editing an older completed Job. Production operators may additionally replace the release tags with the published OCI digests for fully immutable deployment references.

Both workload manifests enforce `runAsNonRoot`, UID/GID `10001`, `allowPrivilegeEscalation: false`, a read-only root filesystem, the runtime-default seccomp profile, and a complete capability drop.

## Paperless-ngx

Household owners can enter the Paperless URL and API token under **Settings → Paperless-ngx connection**. Deployment-managed installations can instead set `PAPERLESS_URL` and provide the token through the `paperless_token` Docker/Kubernetes secret. A saved household connection takes precedence over deployment defaults.

UI-entered tokens are encrypted with AES-256-GCM, bound to both the household and normalized Paperless URL, and never returned to the browser. Changing the Paperless URL requires entering a new token; deployment-managed tokens can only be used with their deployment-managed URL. Domino uses `DOMINO_CREDENTIAL_ENCRYPTION_KEY_FILE` or `DOMINO_CREDENTIAL_ENCRYPTION_KEY` when supplied; otherwise it derives the credential key from the existing Domino session secret. Keep that key stable for as long as the saved integration is needed.

When Paperless is the selected backend:

- the original file is uploaded to Paperless;
- Domino stores its Paperless document ID, URL, kind, hash, and product/claim association;
- Domino does not keep a second local copy.

Paperless uploads are tracked as asynchronous tasks. A failed or unavailable authoritative Paperless backend returns a clear error and does not silently fall back to local storage. Existing Paperless documents can be searched and linked only by accounts granted the separate `paperless:discover` permission; built-in agent roles do not receive it. Deleting a Domino entry only unlinks it and never deletes the Paperless original.

Disconnecting Paperless in Settings deletes Domino’s encrypted token, switches new attachments back to local storage, and does not delete anything from Paperless.

Local files are limited to 50 MiB, stored under random keys with authenticated downloads, and moved into a 30-day logical trash before lazy cleanup. Back up both PostgreSQL and `/data/uploads` for a complete local-backend restore.

## Pocket ID / OIDC

Domino supports any standards-compliant OIDC provider and uses Pocket ID as the documented default.

1. In Pocket ID, create an OIDC client named `Domino`.
2. Set its callback URL to:

   ```text
   https://domino.example.test/auth/oidc/callback
   ```

3. Enable the `openid profile email groups` scopes and copy the client ID and secret.
4. Put the client secret in `secrets/oidc_client_secret`. Do not put it in `.env`.
5. Set these values in `.env`:

   ```env
   DOMINO_DEMO_MODE=false
   DOMINO_ORIGIN=https://domino.example.test
   DOMINO_OIDC_ENABLED=true
   DOMINO_OIDC_ISSUER=https://id.example.test
   DOMINO_OIDC_CLIENT_ID=your-pocket-id-client-id
   DOMINO_OIDC_BOOTSTRAP_OWNER_EMAIL=you@example.test
   ```

On the first successful login, the exact verified bootstrap email creates the initial household, the built-in Owner and Member roles, and the first Owner account. Later verified users are assigned the configurable `Member` role. Existing accounts are not silently claimed by email: an administrator must explicitly link the OIDC identity. `DOMINO_OIDC_LINK_EXISTING_BY_EMAIL=true` is available only for a controlled migration where verified email ownership is known to be authoritative.

`DOMINO_OIDC_ALLOWED_GROUPS` accepts a comma-separated Pocket ID group allowlist. Leave it empty to rely on Pocket ID's client access policy. Domino always applies its own household RBAC after authentication, so an allowed Pocket ID user receives only the permissions of their Domino role.

The authorization flow uses discovery, authorization code with PKCE, state and nonce validation, an encrypted 10-minute flow cookie, verified ID-token signatures, and revocable server-side sessions. Session and OIDC-client secrets support Docker/Kubernetes secret files through `DOMINO_SESSION_SECRET_FILE` and `DOMINO_OIDC_CLIENT_SECRET_FILE`.

OIDC is for human browser sessions. Hermes and other agents continue to use separately scoped service accounts through the CLI device flow; they never receive a human OIDC session or the Pocket ID client secret.

## CLI

Install the Rust CLI directly from Git:

```sh
cargo install --git https://github.com/hankandre/domino domino-cli
```

Tagged GitHub releases publish static Linux x86_64 and ARM64 archives with SHA-256 checksum files. The same release publishes a multi-architecture CLI image independently from the browser application:

```sh
docker run --rm ghcr.io/hankandre/domino-cli:0.1.1 --version
```

For a persistent human-operated CLI using Compose:

```sh
docker compose --profile tools run --rm cli \
  auth login --name "Alex's laptop" --no-open
docker compose --profile tools run --rm cli search "kitchenaid mixr"
```

The first command prints the browser URL and confirmation code. The CLI credential is retained in the `domino-cli-config` volume and is not present in the browser application container.

```sh
domino --server https://domino.example.test auth login --name "Alex's laptop"
domino search "kitchenaid mixr"
domino --json search --has-claim --expires-before 2027-01-01
domino search "ORDER-9921" --coverage active --purchased-after 2025-01-01
domino product create "Artisan Mixer" --brand KitchenAid --model KSM195 \
  --category "Kitchen appliance" --order-number ORDER-9921
domino product get PRODUCT_ID
domino warranty add PRODUCT_ID --provider KitchenAid --ends-at 2027-07-01 \
  --claim-deadline 2027-06-15 --instruction "Attach the receipt"
domino claim create PRODUCT_ID --issue "Leaking from the lower seal" \
  --noticed-at 2026-07-28 --preferred-resolution repair
domino note add PRODUCT_ID "Bosch requested a seal photo."
domino document upload manual.pdf --product-id PRODUCT_ID --kind manual
domino record validate --file examples/product-record.json
domino --json record create --file examples/product-record.json
```

`auth login` uses a browser-based device flow. The human sees the requested account and approves it; the CLI receives the credential only after approval.

### Agent product records

`record create` is the preferred intake path for Hermes and other agents. A JSON manifest can include product details, serials, warranties, notes, durable source identifiers, an image, and local or Paperless documents. Paths are resolved relative to the manifest. Use `--file -` to read JSON from standard input.

Validate first when an agent should ask before acting:

```sh
domino --json record validate --file examples/product-record.json
domino --json record create --file examples/product-record.json
```

The complete example is [examples/product-record.json](examples/product-record.json). `submissionId` is an optional caller-provided idempotency key. When it is omitted, the CLI derives a stable key from the manifest. Retrying the same submission does not create another product, document, or image.

Domino blocks exact durable-identifier matches—serial number, external system and ID, or retailer/order/product—and returns likely name/model matches as warnings. An account with `products:manage` can deliberately resubmit with `allowDuplicateOf` set to the matched product ID. Metadata, warranties, notes, and source attribution are committed together; attachment results are reported separately under `components`, and any partial result exits nonzero so an interrupted upload can be retried safely.

### Hermes without credential access

An application cannot hide a file from an agent running as the same unrestricted OS user. Domino therefore provides a real isolation boundary:

1. Create a dedicated `domino-broker` OS user or sidecar container.
2. Authenticate or provision the Hermes service account into a credential file readable only by that identity.
3. Run the broker under that identity:

   ```sh
   domino broker serve \
     --listen /run/domino/hermes.sock \
     --credential-file /run/secrets/domino_hermes_session.json
   ```

4. Grant the Hermes OS user access to the socket, but not the secret:

   ```sh
   domino --socket /run/domino/hermes.sock search "dishwasher"
   ```

The broker never exposes the bearer token. It only forwards `/api/v1/*`, and the server independently applies the Hermes service account’s RBAC permissions. The broker socket is explicitly created with mode `0660`; run it inside a private runtime directory owned by the broker identity and the intended Hermes group.

Compose provides the same isolation with two distinct volumes. Authenticate the broker credential, start it, and invoke the credential-free agent client:

```sh
docker compose --profile broker run --rm broker-auth \
  auth login --name "Hermes" --no-open
docker compose --profile broker up -d broker
docker compose --profile broker run --rm agent-cli search "dishwasher"
```

`broker` can mount `domino-broker-config`; `agent-cli` cannot. The agent receives only `domino-broker-socket`. Do not grant the agent access to the Docker daemon, because Docker control would allow it to mount arbitrary volumes and bypass that boundary.

Production device codes, service actors, roles, hashed credentials, and revocation state are persisted in PostgreSQL. Each bearer request checks the database, so revoking the account or credential immediately cuts off the broker. Requested grants are validated against Domino’s permission vocabulary and may not exceed the approving user’s own permissions.

`DELETE /api/v1/service-accounts/:actorId` revokes every credential for a household service account, disables the actor, and writes an audit event. Device starts are capped by `DOMINO_DEVICE_FLOW_MAX_OUTSTANDING`; expired and consumed flows are pruned. Internet-facing deployments should additionally rate-limit `/api/device/start` at the ingress or reverse proxy.

## Permission model

Permissions are granular (`products:create`, `products:manage`, `warranties:create`, `claims:manage`, `documents:attach`, `images:attach`, and so on). Roles are household-scoped. Human and service actors use the same policy system, credentials are separately revocable, and every mutation is designed to produce an audit event.

Built-in templates include Owner, Member, Agent Reader, Claim Assistant, Inventory Contributor, and Household Agent. Inventory Contributor is the safer intake default: it can add products and supporting records without editing existing products. Household Agent can manage inventory and claims but cannot administer people, service credentials, roles, integrations, or Paperless discovery.

The device-approval screen lets the approving person choose each service permission. Owners can later edit a service account’s role or revoke it under **Settings → People & agents**. A grant cannot exceed the approving user’s own permissions.

An administrator can also give any human or service account access to all household claims or only selected claims. Selected access is enforced on claim lists, individual claims, product claim summaries, claim notes, and claim-linked documents. A restricted account automatically receives access to a claim it creates, so an agent can continue the workflow it started.

## Health and API

- `GET /api/health` is the process liveness check.
- `GET /api/ready` verifies PostgreSQL and writable local storage. Paperless is reported but intentionally does not make the whole app unready.
- `GET /api/docs` serves a self-hosted Swagger UI with no CDN dependency.
- `GET /api/openapi.json` publishes the Swagger UI's OpenAPI 3.1 document. Browser calls use the Hono contract directly; the Rust CLI uses the stable `/api/v1` HTTP surface.

## Scope

The household MVP intentionally leaves outbound notifications, multi-record bulk imports, multi-household UI, and autonomous form submission or phone calls for later. The single-record manifest gives delegated agents a safe intake path today. Claim instructions and evidence are structured now so an approved agent can safely help with those workflows in a future release.
