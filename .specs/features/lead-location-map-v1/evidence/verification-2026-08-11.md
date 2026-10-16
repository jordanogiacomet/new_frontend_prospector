# Lead Location Map v1 — verification 2026-08-11

Status: repository gates passed and the guarded Demo 3 rollout completed.

## Behavior

- Lead detail renders one responsive `Localização da empresa` section from the
  existing company name, city and UF fields.
- The location is explicitly described as approximate rather than a verified
  street address.
- `Abrir no mapa` creates an HTTPS OpenStreetMap search containing only company
  name, city, UF and `Brasil`. It excludes CNPJ and producer identifiers.
- No iframe, remote image, geocoder or map tile loads automatically. Without
  both city and UF, available partial location remains searchable; without
  either value, the component renders an unavailable state and no link.

## Verification

- RED: the new component import and page region were absent; both focused test
  files failed before implementation.
- GREEN: 2 focused files and 19 tests passed.
- Full unit/component suite: 105 files and 2,022 tests passed.
- ESLint, Next route generation, strict TypeScript, production build and
  `git diff --check` passed.

## Demo 3 rollout

- Exact Kubernetes/TLS preflight passed before mutation.
- Immutable app release `demo3-preprod-20260811-lead-location-map-001` rolled
  out successfully; the Deployment is 1/1 Ready and the new app container has
  zero restarts.
- No n8n, Lusha, Apollo, producer write, schema change or map-provider request
  was made during rollout.
