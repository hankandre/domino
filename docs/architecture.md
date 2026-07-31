# Architecture

Domino is a household-scoped SvelteKit application with a Hono API mounted under
`/api`, PostgreSQL persistence through Drizzle, and an independently released
Rust CLI. The browser and CLI share server policy; neither reimplements RBAC.

```text
browser ── typed Hono RPC ─┐
                           ├─ SvelteKit/Node Distroless ─ PostgreSQL
Rust CLI ─ stable HTTP ────┤              │
agent ─ Unix socket ─ broker              ├─ local upload volume, or
                                          └─ Paperless-ngx (authoritative)
```

## Request flow

Svelte routes load display data on the server. Browser mutations call the typed
Hono client; large document and image bodies use bounded raw streams. Hono applies
common header validation, bearer/session authentication, same-origin checks for
browser mutations, permission middleware, route-specific `zValidator` schemas,
and domain services. Domain services scope all reads and writes to the actor's
household and, where applicable, selected claim IDs.

API domains live under `src/lib/server/api`. `api.ts` is only the composition
root. Reusable validation schemas are the source for both runtime parsing and
OpenAPI generation. `swagger.test.ts` compares the generated contract with
Hono's registered operational routes.

## Identity and authority

Humans authenticate locally or through OIDC. Verified OIDC identities can be
auto-provisioned into the configured household and default role/claim preset.
Agents authenticate as service actors through the one-time device flow. Roles
contain permission strings; actors independently have all-claim or selected-claim
scope. Delegation is a subset operation checked again inside a locked transaction.

The Rust broker is the credential-isolation boundary for an agent. It reads the
credential, exposes a mode-0660 Unix socket, forwards only the Domino API surface,
and never returns a bearer token. Server-side RBAC remains authoritative.

## Data and documents

Products own warranties, images, notes, sources, claims, and document references.
Claim events form the durable timeline. Mutations write audit events in the same
transaction when persistence is enabled.

Local uploads are streamed to staging files, checked against limits, then moved
under random storage keys. Paperless-backed documents retain only the external
reference and Domino associations. If Paperless is selected, it is authoritative;
an upstream failure never causes an undeclared local copy.

## Deployment

Migration and application artifacts are separate images from one app release.
The migration Job/service must finish before the application rolls forward. All
first-party images are Distroless, read-only, and start directly as UID/GID 10001.
The CLI image is released independently and is not included in the web runtime.

Architecture decisions begin with [the API boundary decision](adr/0001-api-boundary.md)
and are kept together under `docs/adr`.
