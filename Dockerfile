FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .
RUN DATABASE_URL=postgresql://readonly_user:replace-with-password@postgres.example.invalid:5432/read_only_leads \
  PRODUCER_DATABASE_URL=postgresql://producer_reader:replace-with-password@postgres.example.invalid:5432/producer \
  APP_DATABASE_URL=postgresql://prospecta_app:replace-with-password@postgres.example.invalid:5432/prospecta \
  AUTH_SECRET=replace-with-a-random-demo-secret-at-least-32-bytes \
  AUTH_OIDC_ISSUER=https://identity.example.com/demo \
  AUTH_OIDC_CLIENT_ID=replace-with-oidc-client-id \
  AUTH_OIDC_CLIENT_SECRET=replace-with-oidc-client-secret \
  AUTH_ALLOWED_ORG_ID=demo-organization \
  N8N_IMPORT_URL=http://192.168.0.20:30098/webhook/empresaqui/import \
  IMPORT_MAX_BYTES=10485760 \
  IMPORT_PRODUCER_TIMEOUT_MS=15000 \
  SENSITIVE_URL_HOSTS=evidence.example.com,reports.example.com \
  FEATURE_IMPORTS_ENABLED=true \
  FEATURE_BATCH_OBSERVATION_ENABLED=true \
  FEATURE_COMMERCIAL_ENABLED=false \
  FEATURE_SENSITIVE_CONTENT_ENABLED=false \
  FEATURE_DEMO_DATA_ENABLED=true \
  AUTH_DEV_BYPASS_ENABLED=true \
  pnpm build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
