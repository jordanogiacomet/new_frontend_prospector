# Lead Location Map v1 — embedded-map verification 2026-08-12

Status: repository gates passed and the guarded Demo 3 rollout completed.

## Behavior

- Lead detail renders OpenStreetMap inside `Localização da empresa`; the map is
  no longer an external search button.
- Prospecta resolves an exact normalized city/UF pair from a repository-owned,
  version-pinned index of 5,571 Brazilian municipality centroids.
- The resolver fails closed for incomplete, unknown or city/UF-mismatched
  values. It never searches by company name or CNPJ.
- The UI identifies the marker as the approximate municipality center, not a
  verified company address.
- The browser calls only the authenticated Prospecta read route for location
  resolution. The OpenStreetMap iframe receives coordinates and bounds.

## Verification

- Generator produced 5,571 unique municipality keys from
  `kelvins/municipios-brasileiros@503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861`.
- Focused map/page/route/resolver suite: 4 files and 28 tests passed.
- Private surface inventory: 11 tests passed after explicitly registering the
  new route.
- Full unit/component suite: 107 files and 2,031 tests passed.
- ESLint, Next route generation, strict TypeScript, production build and
  `git diff --check` passed.
- The generated OpenStreetMap embed URL returned HTTP 200 without company or
  CNPJ data.

## Demo 3 rollout

- Exact Kubernetes/TLS preflight passed before mutation.
- Immutable release `demo3-preprod-20260812-embedded-lead-map-001` rolled out
  successfully.
- Deployment and StatefulSet were 1/1 Ready; every container reported zero
  restarts.
- The authenticated lead page and location route returned HTTP 200, and the
  route returned a valid available municipality location.
- No n8n workflow was changed or activated, no provider enrichment request was
  made, and no producer write or schema change was introduced by this feature.
