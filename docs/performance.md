# Performance baselines

Domino keeps household-scoped collection reads bounded and records representative
PostgreSQL query plans here. Timings are diagnostic baselines, not service-level
objectives; hardware, cache state, and PostgreSQL versions change them.

## Collection bounds

- API list windows default to 100 rows and accept at most 200 rows.
- Product fuzzy search evaluates at most 1,000 household candidates, reports
  whether that candidate set was truncated, and then applies the requested result
  window.
- Claims, documents, and audit history fetch one additional row only to calculate
  `page.hasMore`.
- Domain list functions enforce the same bounds even when called outside Hono.
- Duplicate-product checks use indexed identity queries and at most 50 fuzzy
  candidates.
- Product summaries load one selected warranty, image, and active claim per
  product, aggregate document and note counts in PostgreSQL, and cap serials at
  the input contract's 20-item maximum.
- Product and claim detail reads cap each nested timeline or related collection
  at 200 records and return explicit `relatedPage.*Truncated` flags.

## Reproducing the supported baseline

CI runs `bun run test:performance` against the pinned PostgreSQL 17 service and
publishes `postgresql-17-performance-baseline.json`. The script creates 5,000
related household records inside a rolled-back transaction and records JSON
`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)` plans for inventory, image, serial, and
claim-note hot paths. Run it only against an expendable development database;
`ANALYZE` updates planner statistics even though fixture rows are rolled back.

## Historical diagnostic

Recorded 2026-07-31 with PostgreSQL 18.4 after migration `0011`. This predates
the reproducible PostgreSQL 17 CI artifact and is retained only for comparison.
The fixture had
10 households, 10,000 products per household, 5,000 claims per household, and
10,000 documents and audit events per household. Five percent of products were
archived. The fixture ran inside a transaction and was rolled back after
`ANALYZE` and `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)`.

| Read                                | Limit | Principal plan                                                                   | Observed execution |
| ----------------------------------- | ----: | -------------------------------------------------------------------------------- | -----------------: |
| Active inventory                    |   100 | backward index-only scan on `products_household_active_updated_idx`              |           0.048 ms |
| Claims with product household check |   100 | backward scan on `claims_household_updated_idx`, then product primary-key lookup |           0.240 ms |
| Active documents                    |   100 | backward index-only scan on `documents_household_active_created_idx`             |           0.033 ms |
| Audit history                       |    50 | backward scan on `audit_events_household_idx`                                    |           0.020 ms |

The exact-identity paths additionally use the normalized product-name,
brand/model, retailer/order, serial-number, and external-ID indexes introduced by
migration `0010`. Warranty expiration selection uses `warranties_product_idx` for
the correlated product lookup and `warranties_ends_at_idx` for direct expiration
queries.

Re-record this table after changing a query predicate, ordering, relevant index,
or supported PostgreSQL major version. A sequential scan is not automatically a
regression for a small or single-household table; compare selectivity and elapsed
work before changing an index solely to alter the plan label.
