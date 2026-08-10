# Commercial Queue Membership Contract

Version: `commercial-queue-membership-v1`  
Status: implemented for repository and Demo 3 verification  
Updated: 2026-08-06

## Invariant

Without an explicit commercial-stage or responsible-person filter, the
commercial queue SHALL contain exactly the same current companies, in the same
order, as the Leads list for the same authenticated actor, producer filters,
page, and page size.

Both reads SHALL use the same:

- current-projection eligibility relation;
- production, Demo 2, or correlated Demo 3 run visibility;
- source cardinality guard;
- producer CNPJ, UF, and priority predicates; and
- default ordering by latest approved analysis and stable projection id.

## Composition rules

- Queue membership is a live producer read. It is not copied or synchronized
  into the app-owned database.
- App-owned workspace state and the approved company domain only decorate an
  eligible producer lead. They cannot add or remove a company.
- An explicit commercial-stage or responsible-person filter intentionally
  returns a subset of the current Leads relation.
- A workspace without a current eligible producer lead never creates a queue
  item.
- Producer unavailability keeps the total unknown (`null`); it is never
  represented as a confirmed empty current list.

## Verification

- Unit tests require correlated Demo 3 batch ids to remain bound SQL values and
  require the same stable ordering.
- Route tests require visibility to be resolved from the authenticated actor
  before the queue repository read.
- PostgreSQL integration tests compare the exact total, CNPJ sequence, and
  ordering returned by Leads and the unfiltered queue using synthetic rows,
  including one correlated Demo 3 test-marked row.
