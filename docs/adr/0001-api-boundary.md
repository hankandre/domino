# ADR 0001: Hono is the operational API boundary

Status: accepted

Domino uses SvelteKit for pages and server loads, and a mounted Hono application
for browser mutations and the stable external API. Browser JSON calls use Hono
RPC typing. The Rust CLI uses documented HTTP endpoints so its release is not
coupled to TypeScript types. Large uploads remain raw bounded streams.

Handlers never call other handlers. Shared behavior belongs in domain or auth
services, which accept a database or transaction object. All external inputs pass
through `zValidator`; those same schemas generate OpenAPI request contracts.
