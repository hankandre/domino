# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Domino is primarily for a household. Household owners and members keep track of the products they own, their warranty coverage, manuals, receipts, and claims. An owner or administrator can also create service accounts for agents such as Hermes and limit what those accounts may see or change.

## Product Purpose

Domino gives a household one dependable place to know what is covered, find the supporting document, and manage a warranty claim from discovery through resolution. Success means a user can answer “is this still covered?” quickly and can file a claim with the required information already assembled.

## Positioning

Domino treats warranties as active, searchable household records rather than a folder of documents. It combines structured coverage and claim tracking with a document store that can either be built in or defer to Paperless-ngx.

## Operating Context

Users add purchases and warranty terms, attach receipts and manuals, search by product name or date, and file claims when something fails. Paperless-ngx is an optional integration. When connected and enabled as the document backend, Paperless-ngx is authoritative and Domino stores references and useful metadata rather than duplicate files.

Automation clients use a CLI. A human authenticates and provisions a restricted service account or local CLI session once; an agent such as Hermes can then invoke approved commands without receiving or reading the underlying credential.

## Capabilities and Constraints

- Responsive SvelteKit web application styled with Tailwind CSS.
- Drizzle ORM for persistence.
- A stable typed API suitable for both the web client and CLI. Hono RPC may be used where a dedicated API boundary is useful.
- Household-oriented accounts and role-based access control.
- Human accounts and separately revocable service accounts.
- Administrators can scope service-account privileges, including warranty read/write, document attachment, claim creation and management, and household administration.
- Warranty records include product identity, purchase and coverage dates, retailer/manufacturer details, identifiers, notes, and lifecycle status.
- Claims can be created, tracked through resolution, and associated with notes, supporting documents, status changes, resolution details, and a durable event history.
- Manuals, receipts, photos, and other documents can be attached.
- Product records support a primary image. Domino may suggest an image from an external provider or product URL, but the user confirms the image before it becomes part of the household record.
- Documents can use local storage or Paperless-ngx. Paperless-ngx becomes authoritative when selected.
- Claim guidance can record manufacturer contacts, eligibility notes, required evidence, submission methods, deadlines, and a step-by-step checklist.
- The claim model and permission system should leave room for a service account to complete web forms or calls in the future, with explicit grants and an auditable history.
- CLI search supports fuzzy product matching and structured filters such as dates, names, status, and identifiers.
- Self-hosted and containerized, with straightforward Docker, Docker Compose, and Kubernetes deployment.
- Application containers start and remain as a non-root user. Startup does not depend on briefly acquiring root privileges or changing identity.
- The product name is Domino, inspired by a bounty hunter searching for people with warrants. The metaphor should remain useful and restrained.
- PostgreSQL is the assumed production database. SQLite may be used for local development if it does not fragment behavior.

## Evidence on Hand

There are no existing product assets, interface implementation, testimonials, benchmarks, or compatibility claims. Future work must not fabricate them.

## Product Principles

- Find coverage before the moment becomes stressful.
- Keep the claim trail complete and legible.
- Let households own the deployment and choose where documents live.
- Give automation only the authority it needs.
- Prefer quiet reliability over administrative ceremony.

## Accessibility & Inclusion

The web application should support keyboard operation, clear focus states, sufficient color contrast, reduced-motion preferences, and semantic status communication. Important states must not rely on color alone.
