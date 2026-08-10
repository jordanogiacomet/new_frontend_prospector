import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool, type QueryResultRow } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

const forwardSql = readAppSql("001_app_schema_forward.sql");
const rollbackSql = readAppSql("002_app_schema_rollback.sql");
const grantsSql = readAppSql("003_app_schema_grants.sql");
const auditRedactionSql = readAppSql(
  "004_commercial_audit_redaction_forward.sql",
);
const producerReadRole = "prospecta_t033_producer_read";
const producerReadPassword =
  "prospecta-t033-producer-read-synthetic-password";
const appDisposableDatabaseUrl = requireAppDisposableDatabaseUrl();
const producerDisposableDatabaseUrl = requireProducerDisposableDatabaseUrl();
const appPool = new Pool({
  connectionString: appDisposableDatabaseUrl,
  application_name: "prospecta-t033-work-queue-app-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});
const producerOwnerPool = new Pool({
  connectionString: producerDisposableDatabaseUrl,
  application_name: "prospecta-t033-work-queue-producer-integration-test",
  max: 1,
  connectionTimeoutMillis: 1_000,
  statement_timeout: 5_000,
  lock_timeout: 1_000,
  idle_in_transaction_session_timeout: 5_000,
  allowExitOnIdle: true,
});

type WorkQueueRepository = typeof import("./work-queue-repository");
type LeadListRepository = typeof import("../repositories/lead-list-repository");

let workQueueRepository: WorkQueueRepository | null = null;
let leadListRepository: LeadListRepository | null = null;

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const otherSubject = "oidc|synthetic-seller";
const cnpj = "12345678000195";
const otherCnpj = "22345678000196";
const thirdCnpj = "32345678000197";
const leadRunId = `lr_${"a".repeat(64)}`;
const otherLeadRunId = `lr_${"b".repeat(64)}`;
const thirdLeadRunId = `lr_${"c".repeat(64)}`;
const workspaceId = "00000000-0000-4000-8000-000000000333";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000334";

function readAppSql(filename: string): string {
  return readFileSync(resolve(process.cwd(), "db/app", filename), "utf8");
}

function requireAppDisposableDatabaseUrl(): string {
  return validateAppDisposableDatabaseUrl(
    process.env.PROSPECTA_APP_TEST_DATABASE_URL,
  );
}

function requireProducerDisposableDatabaseUrl(): string {
  return validateProducerDisposableDatabaseUrl(
    process.env.PROSPECTA_PRODUCER_TEST_DATABASE_URL,
  );
}

function validateAppDisposableDatabaseUrl(rawValue: string | undefined): string {
  if (!rawValue) {
    throw new Error(
      "PROSPECTA_APP_TEST_DATABASE_URL is required for T033 integration tests.",
    );
  }

  return validateDisposableDatabaseUrl(rawValue, {
    databaseName: "prospecta_t009_test",
    error:
      "PROSPECTA_APP_TEST_DATABASE_URL must point to an approved local disposable app target.",
  });
}

function validateProducerDisposableDatabaseUrl(
  rawValue: string | undefined,
): string {
  if (!rawValue) {
    throw new Error(
      "PROSPECTA_PRODUCER_TEST_DATABASE_URL is required for T033 integration tests.",
    );
  }

  return validateDisposableDatabaseUrl(rawValue, {
    databaseName: "prospecta_t022_producer_test",
    error:
      "PROSPECTA_PRODUCER_TEST_DATABASE_URL must point to an approved local disposable producer target.",
  });
}

function validateDisposableDatabaseUrl(
  rawValue: string,
  input: { readonly databaseName: string; readonly error: string },
): string {
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(input.error);
  }

  const usesPostgres =
    url.protocol === "postgres:" || url.protocol === "postgresql:";
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const isApprovedTarget =
    url.hostname === "localhost" &&
    (url.port === "5432" || url.port === "55432") &&
    databaseName === input.databaseName;

  if (
    !usesPostgres ||
    !isApprovedTarget ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(input.error);
  }

  return rawValue;
}

function parseDisposableDatabaseTarget(rawValue: string): {
  readonly hostname: string;
  readonly port: string;
  readonly databaseName: string;
} {
  const url = new URL(rawValue);

  return {
    hostname: url.hostname,
    port: url.port,
    databaseName: decodeURIComponent(url.pathname.slice(1)),
  };
}

function appOwnerDatabaseUrlWithCredentials(): string {
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (!user || !password) {
    throw new Error(
      "PGUSER and PGPASSWORD are required for T033 repository integration tests.",
    );
  }

  const url = new URL(appDisposableDatabaseUrl);
  url.username = user;
  url.password = password;

  return url.toString();
}

function producerReadDatabaseUrl(): string {
  const url = new URL(producerDisposableDatabaseUrl);
  url.username = producerReadRole;
  url.password = producerReadPassword;

  return url.toString();
}

function configureRepositoryEnvironment(): void {
  const appDatabaseUrl = appOwnerDatabaseUrlWithCredentials();

  process.env.DATABASE_URL = appDatabaseUrl;
  process.env.APP_DATABASE_URL = appDatabaseUrl;
  process.env.PRODUCER_DATABASE_URL = producerReadDatabaseUrl();
  process.env.AUTH_SECRET =
    "synthetic-auth-secret-synthetic-auth-secret";
  process.env.AUTH_OIDC_ISSUER = "https://issuer.synthetic.example";
  process.env.AUTH_OIDC_CLIENT_ID = "prospecta-synthetic-client";
  process.env.AUTH_OIDC_CLIENT_SECRET =
    "synthetic-client-secret-synthetic-client-secret";
  process.env.AUTH_ALLOWED_ORG_ID = organizationId;
  process.env.N8N_IMPORT_URL =
    "https://n8n.synthetic.example/webhook/empresaqui/import";
  process.env.IMPORT_MAX_BYTES = "10485760";
  process.env.IMPORT_PRODUCER_TIMEOUT_MS = "15000";
  process.env.SENSITIVE_URL_HOSTS = "example.com";
  process.env.FEATURE_IMPORTS_ENABLED = "false";
  process.env.FEATURE_BATCH_OBSERVATION_ENABLED = "false";
  process.env.FEATURE_COMMERCIAL_ENABLED = "false";
  process.env.FEATURE_SENSITIVE_CONTENT_ENABLED = "false";
}

async function loadWorkQueueRepository(): Promise<WorkQueueRepository> {
  if (workQueueRepository === null) {
    configureRepositoryEnvironment();
    workQueueRepository = await import("./work-queue-repository");
  }

  return workQueueRepository;
}

async function loadLeadListRepository(): Promise<LeadListRepository> {
  if (leadListRepository === null) {
    configureRepositoryEnvironment();
    leadListRepository = await import("../repositories/lead-list-repository");
  }

  return leadListRepository;
}

async function executeApp(sql: string): Promise<void> {
  await appPool.query(sql);
}

async function executeProducer(
  sql: string,
  values: readonly unknown[] = [],
): Promise<void> {
  await producerOwnerPool.query(sql, [...values]);
}

async function queryProducerRows<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await producerOwnerPool.query<Row>(text, [...values]);

  return result.rows;
}

async function setupProducerSource(): Promise<void> {
  await terminateProducerReadRoleConnections();
  await dropProducerReadRole();
  await dropProducerFixtures();
  await createProducerFixtures();
  await createProducerReadRole();
}

async function resetAppDatabase(): Promise<void> {
  await executeApp(rollbackSql);
  await executeApp(forwardSql);
  await executeApp(auditRedactionSql);
  await executeApp(grantsSql);
}

async function resetProducerRows(): Promise<void> {
  await executeProducer(`
    TRUNCATE
      public.crm_company_history,
      public.company_validation_runs,
      public.company_validations
    RESTART IDENTITY
  `);
  await grantProducerReadAccess();
}

async function cleanupAppDatabase(): Promise<void> {
  await executeApp(rollbackSql);
}

async function cleanupProducerSource(): Promise<void> {
  await terminateProducerReadRoleConnections();
  await dropProducerReadRole();
  await dropProducerFixtures();
}

async function createProducerFixtures(): Promise<void> {
  await executeProducer(`
    CREATE TABLE public.company_validations (
      id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      cnpj text NOT NULL,
      cnpj_normalizado text NOT NULL,
      nome_fantasia text,
      razao_social text,
      cidade text,
      uf text,
      cnae_descricao text,
      trust_score integer,
      priority text,
      trust_status text,
      source_hash text,
      agent_version text NOT NULL,
      validated_at timestamptz NOT NULL,
      last_lead_run_id text NOT NULL,
      last_import_batch_id text,
      last_source_row integer,
      integrity_status text NOT NULL
    );

    CREATE TABLE public.company_validation_runs (
      id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      import_batch_id text,
      lead_run_id text NOT NULL,
      source_row integer,
      cnpj_normalizado text NOT NULL,
      final_action text NOT NULL,
      processing_result text NOT NULL,
      integrity_status text NOT NULL,
      run_created_at timestamptz NOT NULL,
      test_case_id text
    );

    CREATE TABLE public.crm_company_history (
      cnpj varchar(14),
      website_domain text,
      latest_contact_email text,
      website_status text
    );

    CREATE INDEX crm_company_history_cnpj_synthetic_idx
      ON public.crm_company_history (cnpj);
  `);
}

async function dropProducerFixtures(): Promise<void> {
  await executeProducer(`
    DROP VIEW IF EXISTS public.prospecta_import_batch_observations_v1;
    DROP TABLE IF EXISTS public.crm_company_history;
    DROP TABLE IF EXISTS public.company_validation_runs;
    DROP TABLE IF EXISTS public.company_validations;
  `);
}

async function createProducerReadRole(): Promise<void> {
  await executeProducer(`
    CREATE ROLE ${quoteIdentifier(producerReadRole)}
      LOGIN
      PASSWORD ${quoteLiteral(producerReadPassword)}
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      INHERIT;

    GRANT CONNECT ON DATABASE ${quoteIdentifier(
      parseDisposableDatabaseTarget(producerDisposableDatabaseUrl)
        .databaseName,
    )}
      TO ${quoteIdentifier(producerReadRole)};
  `);
  await grantProducerReadAccess();
}

async function grantProducerReadAccess(): Promise<void> {
  await executeProducer(`
    GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(producerReadRole)};
    GRANT SELECT ON
      public.company_validations,
      public.company_validation_runs
    TO ${quoteIdentifier(producerReadRole)};
    GRANT SELECT (cnpj, website_domain)
      ON public.crm_company_history
      TO ${quoteIdentifier(producerReadRole)};
  `);
}

async function revokeProducerReadAccess(): Promise<void> {
  await executeProducer(`
    REVOKE SELECT ON
      public.company_validations,
      public.company_validation_runs
    FROM ${quoteIdentifier(producerReadRole)};
    REVOKE SELECT (cnpj, website_domain)
      ON public.crm_company_history
      FROM ${quoteIdentifier(producerReadRole)};
  `);
}

async function terminateProducerReadRoleConnections(): Promise<void> {
  await executeProducer(
    `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND usename = $1
        AND pid <> pg_backend_pid()
    `,
    [producerReadRole],
  );
}

async function dropProducerReadRole(): Promise<void> {
  await executeProducer(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(
        producerReadRole,
      )}) THEN
        EXECUTE 'DROP OWNED BY ${quoteIdentifier(producerReadRole)}';
        EXECUTE 'DROP ROLE ${quoteIdentifier(producerReadRole)}';
      END IF;
    END $$;
  `);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function insertProducerLead(input: {
  readonly projectionId?: number;
  readonly runId?: number;
  readonly cnpj_normalizado?: string;
  readonly lead_run_id?: string;
  readonly import_batch_id?: string;
  readonly source_row?: number;
  readonly company_name?: string;
  readonly uf?: string;
  readonly priority?: string;
  readonly trust_score?: number | null;
  readonly final_action?: string;
  readonly trust_status?: string | null;
  readonly validated_at?: string;
  readonly test_case_id?: string | null;
} = {}): Promise<void> {
  const projectionId = input.projectionId ?? 1;
  const runId = input.runId ?? projectionId;
  const cnpjNormalizado = input.cnpj_normalizado ?? cnpj;
  const leadRunId = input.lead_run_id ?? leadRunIdForProjection(projectionId);
  const importBatchId =
    input.import_batch_id ?? `batch-synthetic-${projectionId}`;
  const sourceRow = input.source_row ?? projectionId;

  await executeProducer(
    `
      INSERT INTO public.company_validations (
        id,
        cnpj,
        cnpj_normalizado,
        nome_fantasia,
        razao_social,
        cidade,
        uf,
        cnae_descricao,
        trust_score,
        priority,
        trust_status,
        source_hash,
        agent_version,
        validated_at,
        last_lead_run_id,
        last_import_batch_id,
        last_source_row,
        integrity_status
      )
      VALUES (
        $1, $2, $2, $3, $4, 'Recife', $5, 'Servicos sinteticos',
        $6, $7, $8, $9, 'agent-synthetic-v1', $10::timestamptz,
        $11, $12, $13, 'OK'
      )
    `,
    [
      projectionId,
      cnpjNormalizado,
      input.company_name ?? `Empresa Sintetica ${projectionId}`,
      `${input.company_name ?? `Empresa Sintetica ${projectionId}`} Ltda.`,
      input.uf ?? "PE",
      Object.hasOwn(input, "trust_score")
        ? (input.trust_score ?? null)
        : 80 + projectionId,
      input.priority ?? "B",
      Object.hasOwn(input, "trust_status")
        ? (input.trust_status ?? null)
        : "Revisao Humana",
      `sha256:synthetic-source-hash-${projectionId}`,
      input.validated_at ?? "2026-07-08T12:00:00Z",
      leadRunId,
      importBatchId,
      sourceRow,
    ],
  );

  await executeProducer(
    `
      INSERT INTO public.company_validation_runs (
        id,
        import_batch_id,
        lead_run_id,
        source_row,
        cnpj_normalizado,
        final_action,
        processing_result,
        integrity_status,
        run_created_at,
        test_case_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'INSERIDO_VALIDATION', 'OK',
        $7::timestamptz, $8
      )
    `,
    [
      runId,
      importBatchId,
      leadRunId,
      sourceRow,
      cnpjNormalizado,
      input.final_action ?? "PROSPECTAR",
      input.validated_at ?? "2026-07-08T12:00:00Z",
      Object.hasOwn(input, "test_case_id")
        ? (input.test_case_id ?? null)
        : `SR_${sourceRow}`,
    ],
  );
}

async function insertCompanyDomain(
  cnpjNormalizado: string,
  companyDomain: string,
): Promise<void> {
  await executeProducer(
    `
      INSERT INTO public.crm_company_history (cnpj, website_domain)
      VALUES ($1, $2)
    `,
    [cnpjNormalizado, companyDomain],
  );
}

function leadRunIdForProjection(projectionId: number): string {
  if (projectionId === 1) {
    return leadRunId;
  }

  if (projectionId === 2) {
    return otherLeadRunId;
  }

  if (projectionId === 3) {
    return thirdLeadRunId;
  }

  return `lr_${String(projectionId).padStart(64, "0")}`;
}

async function insertWorkspace(input: {
  readonly workspace_id?: string;
  readonly organization_id?: string;
  readonly cnpj_normalizado?: string;
  readonly observed_lead_run_id?: string;
  readonly responsible_subject?: string | null;
  readonly commercial_stage?: string;
  readonly next_action?: string | null;
} = {}): Promise<void> {
  await appPool.query(
    `
      INSERT INTO prospecting_app.lead_workspaces (
        workspace_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        responsible_subject,
        commercial_stage,
        next_action,
        created_by_subject,
        updated_by_subject
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    `,
    [
      input.workspace_id ?? workspaceId,
      input.organization_id ?? organizationId,
      input.cnpj_normalizado ?? cnpj,
      input.observed_lead_run_id ?? leadRunId,
      Object.hasOwn(input, "responsible_subject")
        ? (input.responsible_subject ?? null)
        : actorSubject,
      input.commercial_stage ?? "ASSIGNED",
      Object.hasOwn(input, "next_action")
        ? (input.next_action ?? null)
        : "Ligar para financeiro",
      actorSubject,
    ],
  );
}

beforeAll(async () => {
  await setupProducerSource();
});

beforeEach(async () => {
  await resetAppDatabase();
  await resetProducerRows();
});

afterAll(async () => {
  try {
    await cleanupAppDatabase();
    await cleanupProducerSource();
  } finally {
    await Promise.all([appPool.end(), producerOwnerPool.end()]);
  }
});

describe("commercial work queue repository integration", () => {
  it("keeps the unfiltered queue in exact parity with current leads", async () => {
    const queueRepository = await loadWorkQueueRepository();
    const leadsRepository = await loadLeadListRepository();
    const correlatedBatchId = "batch-synthetic-correlated";
    const visibility = {
      includeTestRunsFromImportBatchIds: [correlatedBatchId],
    } as const;
    await insertProducerLead({
      projectionId: 1,
      cnpj_normalizado: cnpj,
      lead_run_id: leadRunId,
      validated_at: "2026-07-08T12:00:00Z",
    });
    await insertProducerLead({
      projectionId: 2,
      cnpj_normalizado: otherCnpj,
      lead_run_id: otherLeadRunId,
      import_batch_id: correlatedBatchId,
      test_case_id: "DEMO3_SYNTHETIC_CONTROLLED",
      validated_at: "2026-07-08T13:00:00Z",
    });

    const leads = await leadsRepository.listLeads(
      { page: 1, pageSize: 100 },
      visibility,
    );
    const queue = await queueRepository.listCommercialWorkQueue(
      {
        actor: { organizationId },
        page: 1,
        pageSize: 100,
        sort: "last_analysis_desc",
      },
      visibility,
    );

    expect(queue.total).toBe(leads.total);
    expect(queue.items.map((item) => item.producerLead.cnpj)).toEqual(
      leads.leads.map((lead) => lead.cnpj),
    );
  });

  it("grants only the two approved company-domain columns", async () => {
    const [privileges] = await queryProducerRows<{
      readonly cnpj_select: boolean;
      readonly domain_select: boolean;
      readonly contact_select: boolean;
      readonly status_select: boolean;
      readonly table_select: boolean;
    }>(
      `
        SELECT
          has_column_privilege($1, 'public.crm_company_history', 'cnpj', 'SELECT')
            AS cnpj_select,
          has_column_privilege($1, 'public.crm_company_history', 'website_domain', 'SELECT')
            AS domain_select,
          has_column_privilege($1, 'public.crm_company_history', 'latest_contact_email', 'SELECT')
            AS contact_select,
          has_column_privilege($1, 'public.crm_company_history', 'website_status', 'SELECT')
            AS status_select,
          has_table_privilege($1, 'public.crm_company_history', 'SELECT')
            AS table_select
      `,
      [producerReadRole],
    );

    expect(privileges).toEqual({
      cnpj_select: true,
      domain_select: true,
      contact_select: false,
      status_select: false,
      table_select: false,
    });
  });

  it("returns one normalized company domain and withholds ambiguous matches", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({ cnpj_normalizado: cnpj });
    await insertProducerLead({
      projectionId: 2,
      cnpj_normalizado: otherCnpj,
      lead_run_id: otherLeadRunId,
    });
    await insertCompanyDomain(cnpj, " EMPRESA.EXAMPLE ");
    await insertCompanyDomain(otherCnpj, "primeiro.example");
    await insertCompanyDomain(otherCnpj, "segundo.example");

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
    });
    const byCnpj = new Map(
      result.items.map((item) => [item.producerLead.cnpj, item]),
    );

    expect(byCnpj.get(cnpj)?.companyDomain).toBe("empresa.example");
    expect(byCnpj.get(otherCnpj)?.companyDomain).toBeNull();
  });

  it("lists producer lead facts with an organization-scoped app workspace", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({
      projectionId: 1,
      cnpj_normalizado: cnpj,
      lead_run_id: leadRunId,
      trust_score: 91,
      priority: "B",
      final_action: "PROSPECTAR",
    });
    await insertWorkspace({
      cnpj_normalizado: cnpj,
      observed_lead_run_id: leadRunId,
      commercial_stage: "CONTACTED",
    });

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
    });

    expect(result).toMatchObject({
      kind: "listed",
      page: 1,
      pageSize: 20,
      total: 1,
      provenance: {
        producer: {
          factSource: "producer_current_leads_v1",
          availability: "AVAILABLE",
        },
        workspace: {
          factSource: "app_lead_workspaces_v1",
          availability: "AVAILABLE",
        },
      },
      items: [
        {
          producerLead: {
            cnpj,
            score: 91,
            priority: "B",
            recommendedAction: "PROSPECTAR",
          },
          workspace: {
            organization_id: organizationId,
            cnpj_normalizado: cnpj,
            commercial_stage: "CONTACTED",
          },
        },
      ],
    });
  });

  it("returns a missing workspace state for an approved producer lead without workspace", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({ cnpj_normalizado: cnpj });

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
    });

    expect(result).toMatchObject({
      kind: "listed",
      total: 1,
      items: [
        {
          producerLead: { cnpj },
          workspace: null,
          sources: {
            workspace: {
              factSource: "app_lead_workspaces_v1",
              state: "missing",
            },
          },
        },
      ],
    });
  });

  it("does not associate a workspace from another organization", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({ cnpj_normalizado: cnpj });
    await insertWorkspace({
      organization_id: otherOrganizationId,
      cnpj_normalizado: cnpj,
      observed_lead_run_id: leadRunId,
      responsible_subject: otherSubject,
    });

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
    });

    expect(result.items[0]).toMatchObject({
      producerLead: { cnpj },
      workspace: null,
    });
  });

  it("applies commercial stage filters through app workspaces before producer composition", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({
      projectionId: 1,
      cnpj_normalizado: cnpj,
      lead_run_id: leadRunId,
    });
    await insertProducerLead({
      projectionId: 2,
      cnpj_normalizado: otherCnpj,
      lead_run_id: otherLeadRunId,
    });
    await insertWorkspace({
      cnpj_normalizado: cnpj,
      observed_lead_run_id: leadRunId,
      commercial_stage: "CONTACTED",
    });
    await insertWorkspace({
      workspace_id: otherWorkspaceId,
      cnpj_normalizado: otherCnpj,
      observed_lead_run_id: otherLeadRunId,
      commercial_stage: "ASSIGNED",
    });

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
      filters: { commercial_stage: "CONTACTED" },
    });

    expect(result).toMatchObject({
      kind: "listed",
      total: 1,
      items: [
        {
          producerLead: { cnpj },
          workspace: { commercial_stage: "CONTACTED" },
        },
      ],
    });
  });

  it("does not create an item for a workspace without an approved producer lead", async () => {
    const repository = await loadWorkQueueRepository();
    await insertWorkspace({
      cnpj_normalizado: cnpj,
      observed_lead_run_id: leadRunId,
      commercial_stage: "CONTACTED",
    });

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
      filters: { commercial_stage: "CONTACTED" },
    });

    expect(result).toMatchObject({
      kind: "listed",
      items: [],
      total: 0,
    });
  });

  it("applies producer filters and stable server-side pagination", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({
      projectionId: 1,
      cnpj_normalizado: cnpj,
      lead_run_id: leadRunId,
      priority: "B",
      validated_at: "2026-07-08T12:00:00Z",
    });
    await insertProducerLead({
      projectionId: 2,
      cnpj_normalizado: otherCnpj,
      lead_run_id: otherLeadRunId,
      priority: "B",
      validated_at: "2026-07-08T13:00:00Z",
    });
    await insertProducerLead({
      projectionId: 3,
      cnpj_normalizado: thirdCnpj,
      lead_run_id: thirdLeadRunId,
      priority: "C",
      validated_at: "2026-07-08T14:00:00Z",
    });

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
      page: 2,
      pageSize: 1,
      filters: { priority: "B" },
      sort: "last_analysis_desc",
    });

    expect(result).toMatchObject({
      kind: "listed",
      page: 2,
      pageSize: 1,
      total: 2,
      items: [
        {
          producerLead: { cnpj },
          workspace: null,
        },
      ],
    });
  });

  it("returns unavailable producer state with null total when producer SELECT is unavailable", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({ cnpj_normalizado: cnpj });
    await revokeProducerReadAccess();
    await terminateProducerReadRoleConnections();

    const result = await repository.listCommercialWorkQueue({
      actor: { organizationId },
    });

    expect(result).toMatchObject({
      kind: "listed",
      items: [],
      total: null,
      provenance: {
        producer: {
          availability: "UNAVAILABLE",
          unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
        },
      },
    });
  });

  it("propagates app database unavailability as a safe database error", async () => {
    const repository = await loadWorkQueueRepository();
    await insertProducerLead({ cnpj_normalizado: cnpj });
    await executeApp(rollbackSql);

    const error = await repository
      .listCommercialWorkQueue({ actor: { organizationId } })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      message: "Database temporarily unavailable.",
    });
    expect(String(error)).not.toMatch(/prospecting_app|lead_workspaces|SELECT/i);
  });

  it("uses a producer read role that cannot mutate producer fixtures", async () => {
    const readPool = new Pool({
      connectionString: producerReadDatabaseUrl(),
      application_name: "prospecta-t033-producer-read-denial-test",
      max: 1,
      connectionTimeoutMillis: 1_000,
      statement_timeout: 5_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 5_000,
      allowExitOnIdle: true,
    });

    try {
      await expect(
        readPool.query(
          `
            INSERT INTO public.company_validations (
              cnpj,
              cnpj_normalizado,
              agent_version,
              validated_at,
              last_lead_run_id,
              integrity_status
            )
            VALUES ($1, $1, 'agent-synthetic-v1', now(), $2, 'OK')
          `,
          [cnpj, leadRunId],
        ),
      ).rejects.toThrow();
    } finally {
      await readPool.end();
    }

    const rows = await queryProducerRows<{ readonly total: string }>(
      "SELECT count(*)::text AS total FROM public.company_validations",
    );

    expect(rows[0]?.total).toBe("0");
  });
});
