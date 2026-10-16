# Operational UX Flow v1 — Deployment Evidence

Date: 2026-08-18  
Target: authorized Demo 3 local pre-production  
Release: `demo3-preprod-20260818-operational-ux-001`

## Pre-deployment gates

- ESLint passed.
- Next route type generation and strict TypeScript passed.
- Full unit/component/route suite passed: 124 files, 2,267 tests.
- Sanitized Next.js production build passed.
- Exact cluster target and contact TLS preflights passed before mutation.
- The immutable release tags were absent before build and publication.

## Rollout

- App, PostgreSQL, request-edge and loopback-proxy images were built and
  published with the exact release tag.
- Existing app-owned migrations through `016_qualification_cadence_forward.sql`
  were applied idempotently; this UX pass introduced no migration.
- Application Deployment and PostgreSQL StatefulSet completed at `1/1` Ready.
- Every application and database container reported zero restarts.

## Value-safe postflight

- Anonymous `GET /work-queue`: `401`.
- Authenticated `GET /leads`: `200`.
- Authenticated `GET /work-queue`: `200`.
- Authenticated existing `GET /workspaces/:id`: `200`.
- Authenticated existing `GET /api/workspaces/:id/qualification-cadence`: `200`.
- Sanitized error-marker counts for app, request edge, database proxy and
  PostgreSQL over the rollout window: zero.

The checks recorded no credentials, company identifiers, report content,
commercial values or response bodies. They made no OpenAI request, n8n call,
contact-provider request, outreach action or producer write.

Rollback remains a Deployment revision rollback to the prior immutable
release while preserving the Demo 3 PVC and app-owned audit history.
