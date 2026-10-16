# Lead Location Map v2

Status: approved for repository implementation and Demo 3 verification on
2026-08-13.

## Objective

Place the embedded-map marker on the best available registered-address
coordinate for a lead while preserving an explicitly identified municipality
fallback when an address cannot be resolved.

## Authorization recorded for Demo 3

The repository owner authorized the Prospecta server to:

- send the normalized CNPJ to the configured BrasilAPI CNPJ endpoint;
- keep the returned registered address only in process memory long enough to
  submit one structured lookup to the configured Nominatim endpoint and, when
  that exact-address lookup has no valid result, submit its normalized CEP to
  the configured BrasilAPI CEP v2 endpoint;
- store an organization-scoped app-owned cache containing only CNPJ,
  resolution status, coordinates, source, precision and timestamps;
- enable the feature on the identified Demo 3 local pre-production target.

The authorization does not permit storing or logging the registered address,
provider response bodies or lookup query. It does not authorize production
deployment.

## Requirements

- `LLM2-01` — The browser SHALL call only the authenticated Prospecta map
  route for company-location resolution. BrasilAPI and Nominatim URLs SHALL be
  server-only configuration.
- `LLM2-02` — Authorization SHALL complete before producer reads, app-owned
  cache access or provider requests.
- `LLM2-03` — A cache miss SHALL submit the normalized 14-digit CNPJ once to
  the configured company-registry endpoint, validate only the allowlisted
  registered-address fields in memory, and SHALL NOT retain the response.
- `LLM2-04` — A valid address SHALL be submitted as one structured Brazilian
  address lookup to Nominatim with an identifying User-Agent, a one-result
  limit, a timeout, no automatic retry and a process-wide maximum start rate
  of one request per second.
- `LLM2-04A` — When the one Nominatim lookup has no valid result and the
  registry supplied a valid eight-digit CEP, the server MAY perform one
  BrasilAPI CEP v2 lookup with the same bounded-body, timeout, no-redirect and
  no-retry controls. This is a distinct lower-precision fallback, not a retry
  of the address lookup.
- `LLM2-05` — The app-owned cache SHALL be scoped by organization and CNPJ and
  SHALL contain only status, latitude, longitude, precision, source,
  resolution timestamp and expiry timestamp. It SHALL NOT contain company
  name, street, number, complement, district, city, state, postal code, raw
  query or raw provider payload.
- `LLM2-06` — Valid registered-address coordinates SHALL be returned with
  precision `registered_address`; valid CEP coordinates SHALL use
  `registered_postal_code`; only when both are missing, invalid, timed out or
  unavailable SHALL the app fall back to the pinned city/UF municipality
  centroid with precision `municipality_center` when that pair is available.
- `LLM2-07` — The embedded map SHALL center tightly on a registered-address or
  registered-CEP coordinate and render the marker at that exact returned
  latitude/longitude. The UI SHALL distinguish a geocoded registered address
  from a CEP vicinity and SHALL NOT claim either is a verified operating site
  or exact entrance.
- `LLM2-08` — A municipality fallback SHALL retain the wider municipality
  bounds and the existing honest municipality-center explanation.
- `LLM2-09` — Available cache entries SHALL expire after 90 days and negative
  entries after 24 hours. Expiry SHALL permit a new user-triggered page read;
  there SHALL be no background or automatic retry loop.
- `LLM2-10` — Private route responses SHALL remain `private, no-store`, and
  provider failures SHALL map to fallback/unavailable business states without
  leaking addresses, queries, upstream bodies, URLs or stack traces.

## Acceptance

| Requirement | Verification |
| --- | --- |
| LLM2-01..LLM2-04A | Environment, route, service and rate-limit tests |
| LLM2-05 | Migration, repository and privacy-contract tests |
| LLM2-06..LLM2-08 | Resolver, route and component tests |
| LLM2-09..LLM2-10 | Cache-expiry, timeout, no-retry and safe-response tests |
| Demo 3 | Guarded migration/rollout plus authenticated status-only smoke check |

## Boundaries and limitations

- The marker is a geocode of a public registered address or its registered CEP.
  It may be a building, parcel, street interpolation or postal approximation
  and is not proof of the company's operating location or entrance.
- The v1 pinned municipality centroid remains the fail-safe fallback.
- Public Nominatim use is configuration-gated, cached and rate limited. A
  production target still requires its own approved provider capacity,
  hostname, egress control, accountable owner and rollout approval.
- The standard Kubernetes NetworkPolicy cannot restrict egress by DNS name.
  Demo 3 may permit public TCP/443 while application configuration pins the two
  HTTPS endpoints; production requires a separately reviewed egress design.
