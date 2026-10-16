# Lead Location Map v1

Status: approved for repository implementation and Demo 3 verification.

## Objective

Render an approximate municipality map inside lead detail using only the
stored city and UF that the page already receives.

## Requirements

- `LLM-01` — The lead detail SHALL show a distinct `Localização da empresa`
  section when city or UF is available.
- `LLM-02` — Resolution SHALL use only the exact normalized city/UF pair from
  a version-pinned municipality centroid index. It SHALL NOT use company name,
  CNPJ, producer IDs or sensitive content.
- `LLM-03` — The UI SHALL describe the result as an approximate reference and
  SHALL NOT imply that city/UF is a verified street address.
- `LLM-04` — Entering a lead detail with city and UF SHALL call an authenticated
  Prospecta read route, resolve the municipality without runtime geocoding
  network access and render an OpenStreetMap iframe inside Prospecta.
- `LLM-05` — When both city and UF are absent, the section SHALL show an honest
  unavailable state and SHALL NOT create a map link.
- `LLM-06` — The component SHALL remain usable on narrow and wide layouts and
  preserve the existing warm-paper, dark-ink and restrained-green interface.

## Acceptance

| Requirement | Verification | Status |
| --- | --- | --- |
| LLM-01..LLM-03 | Component and page tests | Verified 2026-08-12 |
| LLM-04..LLM-05 | Resolver, route, iframe, cache and state tests | Verified 2026-08-12 |
| LLM-06 | Responsive markup review, lint and build | Verified 2026-08-12 |

## Boundaries

- The browser calls a private Prospecta route for coordinates and the
  OpenStreetMap embed endpoint for tiles. OpenStreetMap receives coordinates,
  never company identity or CNPJ.
- The private route reuses the existing `leads:read` permission and producer
  detail read. No database field, producer grant, mutation or persistence is
  introduced.
- Municipality centroids come from the MIT-licensed
  `kelvins/municipios-brasileiros` dataset pinned to commit
  `503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861`.
- A failed resolution is shown honestly and is never replaced with a guessed
  coordinate.
