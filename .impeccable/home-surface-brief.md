# Inventory home

- Scope: authenticated household inventory home at `src/routes/+page.svelte`
- Mode: Operate
- Audience and job: a household member adding or reviewing products during routine upkeep, with an urgent path when a covered product breaks.
- Primary task: scan the household inventory, find a product quickly, and act on open claims or expiring coverage.
- Content: card-based product inventory, universal fuzzy/date/identifier search, open-claim and expiring counts, status filters, product imagery, coverage windows, and claim state.
- Chosen direction: Household Dispatch Manifest, composed from approved option C with option B’s richer product details.
- Memorable moment: a marketplace-like product card doubles as a compact claim docket, showing both the object and exactly what needs attention.
- Constraints: reduce the approved comp’s density; omit room management; keep familiar controls; do not literalize the bounty-hunter metaphor; support mobile and keyboard operation.
- Approved comp: `.impeccable/mocks/domino-dashboard-c.png`

## Implementation fidelity

| Visible ingredient | Medium | Decision |
| --- | --- | --- |
| Dominant search and compact command header | Semantic HTML/CSS | Produce |
| Marketplace-like product card grid | Semantic HTML/CSS | Produce |
| Coverage and claim badges | Semantic HTML/CSS/SVG icons | Produce |
| Product thumbnails | Remote suggestion with local fallback artwork | Produce |
| Attention summary for claims and expiry | Semantic HTML/CSS | Produce |
| Selected-product claim guidance | Semantic HTML/CSS; detail route/drawer on wide screens | Produce |
| Dense left attention route from comp | — | Accepted omission |
| Room grouping from comp | — | Accepted omission |

## Unresolved decisions

- External product-image provider remains configurable; suggestions require confirmation.
- Notification transports beyond in-app reminders are deferred.
