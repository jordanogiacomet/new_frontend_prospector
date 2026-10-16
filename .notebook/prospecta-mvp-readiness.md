# Prospecta MVP readiness

Entry: `.specs/features/demo3-mvp-readiness-v1/spec.md` → `README.md` → `tests/browser/README.md`.

## Presentation boundary

- The 2026-10-06 owner request closes the existing application for a Demo 3
  manager presentation. The follow-up explicitly requests finishing the
  contact front end and deploying the app to the existing HTTPS30443 target;
  synthetic verification and actual release postflight remain distinct.
- `docs/prospecta-demo3-presentation.md` gives the presentation route and
  distinguishes fixture-only reading, intercepted synthetic write UAT, and
  the existing authenticated Demo 3 target.
- `README.md` describes the actual pre-production profile and app-owned
  commercial state. Do not describe Demo 3 as the fixture-only demo.

## Verification entry points

- `scripts/build-safe.mjs:buildEnvironment()` reuses the local synthetic
  environment, then disables every known feature/demo flag and auth bypass
  for a production build. It does not modify `.env.local` or publish.
- `scripts/demo-safe.mjs` remains a loopback, read-only fixture demonstration.
  Outside-analysis APIs have no fixture branch; their unavailable state is
  legitimate there. The main Demo 3 uses approved real producer reads.
- `tests/browser/manager-import-analysis.mjs` intercepts API responses and
  blocks external traffic and unexpected mutations. Workspace changes exist
  only in the browser fixture; database persistence is not inferred.
- Global typecheck/build and the browser dev server must run separately
  because they share `.next`. Test workers stay bounded.

## Product recovery contracts

- Costs, outside-analysis and lead history now use private capabilities before
  GET; expired sessions remove prior data and do not continue polling.
- `src/components/auth/private-read-access-state.tsx` gives explicit session
  recovery versus denied reading. API authorization remains authoritative.
- Workspace cadence reloads canonical stage/action/version while preserving
  edited draft fields. Confirmed changes refresh visible audit. See
  `.notebook/prospecta-commercial-workspace.md` for the commercial flow.
- Import submission has a synchronous guard; malformed acknowledgements remain
  unknown and never unlock automatic retry. See
  `.notebook/prospecta-manager-import-analysis.md`.

## Published profile and sales follow-up

- First app release `demo3-preprod-20261006-mvp-feedback-001` is confirmed on
  HTTPS30443 after exact preflight, migration017 and 26 safe postflight checks.
- The next owner request adds stored-action commercial assessment and a
  compact manager pipeline. Contact resources remain optional; queue AI
  preparation is now explicit. See `.notebook/prospecta-company-assessment.md`
  and `.specs/features/sales-pipeline-mvp-v1/` for final publication evidence.
- App publishing does not publish the separate inactive n8n artifact. Legacy
  callbacks can still lack diagnostic facts; the UI must say so.

Evidence: `.specs/features/demo3-mvp-readiness-v1/evidence/verification-2026-10-06.md`.

Updated: 2026-10-06
