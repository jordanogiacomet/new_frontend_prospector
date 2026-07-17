# Project Structure

**Root:** `/home/jordanogiacomet/new_frontend_prospector`

```text
src/
  app/                 pages, layouts, and route handlers
  components/          shared lead UI
  lib/                 labels, formatters, validators
  server/              auth, services, repositories, DB clients, demo data
  types/               shared DTO/domain types
db/
  app/                 app-owned migrations and grants
  producer/            reviewed non-production observation artifacts
integrations/           versioned external integration artifacts, when present
k8s/                   local demo workload assets
scripts/               local demo and operational helpers
tests/                 smoke, contract, and integration tests
.specs/                product, feature, decision, evidence, and task records
.notebook/             durable codebase discoveries
```

## Where Things Live

- Lead UI: `src/app/(private)/leads`, `src/components/leads`
- Import UI/API: `src/app/(private)/imports`, `src/app/api/imports`,
  `src/server/imports`
- Commercial workspace: `src/app/(private)/work-*`, `src/app/api/work*`,
  `src/server/commercial`
- Authentication: `src/server/auth`
- Sensitive mapping: `src/server/mappers`, `src/server/sensitive-content`
- Deployment: `Dockerfile`, `k8s`, `scripts`
