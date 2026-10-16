# Lead Location Map v2 — Tasks

| Task | Verification | Status |
| --- | --- | --- |
| Record authorization, provider boundaries and precision contract | Spec review | Complete |
| Add organization-scoped coordinate/negative cache migration | Migration and repository tests | Complete |
| Implement server-only registry and structured geocoding resolution | Service, timeout, rate-limit and privacy tests | Complete |
| Add a distinct BrasilAPI CEP v2 fallback when Nominatim has no address match | Service, migration and privacy-contract tests | Complete |
| Return explicit precision and retain municipality fallback | Route and resolver tests | Complete |
| Present registered-address, CEP and municipality states distinctly | Component and page tests | Complete |
| Package the guarded Demo 3 configuration and migration | Contract tests and deploy preflight | Complete |
| Verify quality gates and Demo 3 status-only behavior | lint, typecheck, test, build and smoke evidence | Complete |
