# Query Performance Gates

**Status:** PENDING — no production query or migration is authorized

## Current Evidence

- The lead-list repository fails closed above 20 current projection rows.
- Retained history is bounded to 6 rows per company.
- Pagination page size is capped at 20.
- These are safety envelopes for the current audited dataset, not evidence that
  the proposed queue, batch search, or broader filters scale.

## Required Workloads

Performance approval must use production-like cardinality and distribution for:

- queue ordered by next action and ownership;
- exact CNPJ lookup;
- company-name search;
- city/UF, priority, final action, and trust filters;
- producer batch lookup;
- lead detail by CNPJ/run;
- retained history by CNPJ;
- app workspace lookup and ownership conflict;
- paginated batch list and batch detail counts.

## Evidence Required Per Query

- parameterized SQL or typed query shape;
- approved source/view and selected columns;
- expected and worst-case cardinality;
- `EXPLAIN (ANALYZE, BUFFERS)` from a safe production-like environment;
- median and tail latency from repeated runs;
- rows examined and returned;
- index use and index size;
- timeout and maximum page size;
- behavior when count, source, or optional join is unavailable.

Sensitive parameters and result rows must not be copied into committed
evidence.

## Approval Thresholds

The database owner must approve:

- dataset scale assumptions;
- latency budget;
- statement timeout;
- exact-total strategy;
- search semantics;
- required indexes or approved views;
- freshness/replica expectations;
- concurrency budget and pool size.

No numeric target is invented in this document. Targets must be recorded before
query tasks are created.

## Fail-closed Rules

- Omit a filter or sort that lacks evidence.
- Do not rely on browser-side filtering of large data.
- Do not remove the current 20-row/6-history guards until replacement queries
  pass the approved envelope.
- Do not add production indexes or migrations without explicit approval.
- Do not present an unavailable exact total as zero.
- Do not log query parameters or sensitive sample rows.

## Exit Criteria

- Every MVP query has recorded evidence and owner approval.
- Required indexes/views have an approved migration and rollback plan.
- Role grants expose only required objects/columns.
- Load/concurrency behavior stays within the approved database budget.
- Existing guards are superseded only by named, tested replacements.
