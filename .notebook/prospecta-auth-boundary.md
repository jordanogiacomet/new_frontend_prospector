# Prospecta Auth Boundary
> Auth-first private access with OIDC role claims deferred

Entry: `src/server/auth/index.ts:getServerAuthorization()` (L28-40)

Env: `src/server/env.ts:parseServerEnv()` (L251-423)
- Requires OIDC core settings and `AUTH_ALLOWED_ORG_ID`
- `AUTH_ROLE_CLAIM` and `AUTH_ROLE_MAPPING` appear only in the server-only leak list (L40-62), not parsed output
- `FEATURE_*` flags are also server-only leak-checked in `src/server/env.ts` (L40-62)
- `N8N_IMPORT_URL` must use `/webhook/empresaqui/import` or `/webhook-test/empresaqui/import`

Policy: `src/server/auth/config.ts:createAuthorizationPolicy()` (L35-42)
- Binds exact issuer and allowed organization
- Provider config requests `openid` plus organization hint, no role claim

Claims: `src/server/auth/authorization.ts:authorizeIdentityClaims()` (L104-126)
- Checks `iss`, non-empty `sub`, exact `org_id`
- Returns `permissions: []`; provider roles are ignored

Session: `src/server/auth/authorization.ts:authorizeRetainedActor()` (L128-159)
- Revalidates retained actor issuer/subject/org
- Drops stale token permissions by rebuilding `permissions: []`

API guard: `src/server/auth/require-api-session.ts:requireApiSession()` (L16-31)
- Missing/expired → safe 401
- Wrong issuer/org → safe 403
- Current lead GETs use session/org gate; `requirePermission()` remains deny-by-default future infrastructure

Private pages: `src/app/(private)/layout.tsx:PrivateLayout()` (L18-32)
- Missing/expired → `/login`
- Unauthorized → safe denial UI, no private children
- Current private surface locked by `src/app/(private)/layout.test.tsx` (L189-209): `/leads`, `/leads/[cnpj]`, GET lead APIs only

Build gotcha: plain `pnpm build` may load stale `.env.local` n8n path.
- Use process-only synthetic `N8N_IMPORT_URL=https://build-placeholder.example.com/webhook/empresaqui/import` for local verification when not inspecting/changing `.env.local`

Tests:
- `src/server/env.test.ts` — role env absent/malformed ignored; URL/env validation
- `src/server/auth/auth.test.ts` — provider roles and stale permissions ignored
- `src/server/auth/require-api-session.test.ts` — 401/403 before protected callbacks

Updated: 2026-07-06
