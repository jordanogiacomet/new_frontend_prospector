import "server-only";

import type { QueryResultRow } from "pg";

import {
  cnpjNormalizadoSchema,
  commercialStageSchema,
  organizationIdSchema,
  subjectSchema,
} from "../../lib/validators/commercial";
import { leadRunIdPattern } from "../../lib/validators/lead-query";
import type {
  CommercialActorContext,
  CommercialStage,
  CommercialWorkQueueItem,
  CommercialWorkQueueProvenance,
  CommercialWorkQueueSort,
  LeadWorkspaceDto,
} from "../../types/commercial";
import { commercialWorkQueueSorts } from "../../types/commercial";
import {
  DatabaseUnavailableError as ProducerDatabaseUnavailableError,
  query as queryProducerDatabase,
  type SqlStatement as ProducerSqlStatement,
} from "../db/producer-client";
import {
  query as queryAppDatabase,
  type SqlStatement as AppSqlStatement,
} from "../db/app-client";
import {
  mapLeadSummary,
  type LeadSummaryRow,
} from "../mappers/lead-summary-mapper";
import { buildProductionRunPredicate } from "../repositories/production-run-predicate";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;
const MAXIMUM_CURRENT_PROJECTIONS = 1_000;
const SOURCE_GUARD_LIMIT = MAXIMUM_CURRENT_PROJECTIONS + 1;
const PRODUCER_FACT_SOURCE = "producer_current_leads_v1";
const WORKSPACE_FACT_SOURCE = "app_lead_workspaces_v1";

const brazilianUfs = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

type BrazilianUf = (typeof brazilianUfs)[number];

const approvedProducerPriorities = ["B", "C", "E", "R"] as const;

type ProducerPriority = (typeof approvedProducerPriorities)[number];

const sourceGuardStatement: ProducerSqlStatement = {
  text: `SELECT company_validations.cnpj
FROM public.company_validations AS company_validations
LIMIT $1`,
  values: [SOURCE_GUARD_LIMIT],
};

const eligibleCurrentCte = `WITH current_terminal_candidates AS (
  SELECT
    terminal.id::text AS decision_id,
    terminal.import_batch_id,
    terminal.lead_run_id,
    terminal.source_row,
    company_validations.source_hash,
    company_validations.agent_version,
    company_validations.cnpj_normalizado,
    company_validations.nome_fantasia,
    company_validations.razao_social,
    company_validations.cidade,
    company_validations.uf,
    company_validations.cnae_descricao,
    company_validations.trust_score,
    company_validations.priority,
    terminal.final_action,
    company_validations.trust_status,
    company_validations.validated_at,
    company_validations.id AS projection_id,
    COUNT(*) OVER (
      PARTITION BY company_validations.id
    ) AS terminal_count
  FROM public.company_validations AS company_validations
  INNER JOIN public.company_validation_runs AS terminal
    ON terminal.lead_run_id = company_validations.last_lead_run_id
  WHERE company_validations.integrity_status = $1
    AND company_validations.cnpj_normalizado ~ $2
    AND company_validations.cnpj::text = company_validations.cnpj_normalizado
    AND BTRIM(company_validations.last_lead_run_id) <> $4
    AND BTRIM(company_validations.agent_version) <> $4
    AND company_validations.validated_at <= CURRENT_TIMESTAMP
    AND terminal.integrity_status = $1
    AND terminal.processing_result = $3
    AND ${buildProductionRunPredicate("terminal")}
    AND terminal.lead_run_id ~ $5
    AND terminal.cnpj_normalizado = company_validations.cnpj_normalizado
    AND terminal.import_batch_id IS NOT DISTINCT FROM company_validations.last_import_batch_id
    AND terminal.source_row IS NOT DISTINCT FROM company_validations.last_source_row
    AND BTRIM(terminal.final_action) <> $4
    AND terminal.run_created_at <= CURRENT_TIMESTAMP
),
eligible_current AS (
  SELECT
    current_terminal_candidates.decision_id,
    current_terminal_candidates.import_batch_id,
    current_terminal_candidates.lead_run_id,
    current_terminal_candidates.source_row,
    current_terminal_candidates.source_hash,
    current_terminal_candidates.agent_version,
    current_terminal_candidates.cnpj_normalizado,
    current_terminal_candidates.nome_fantasia,
    current_terminal_candidates.razao_social,
    current_terminal_candidates.cidade,
    current_terminal_candidates.uf,
    current_terminal_candidates.cnae_descricao,
    current_terminal_candidates.trust_score,
    current_terminal_candidates.priority,
    current_terminal_candidates.final_action,
    current_terminal_candidates.trust_status,
    current_terminal_candidates.validated_at,
    current_terminal_candidates.projection_id
  FROM current_terminal_candidates
  WHERE current_terminal_candidates.terminal_count = $6
)`;

const baseProducerValues: readonly unknown[] = [
  "OK",
  "^[0-9]{14}$",
  "INSERIDO_VALIDATION",
  "",
  leadRunIdPattern.source,
  1,
];

export interface CommercialWorkQueueFilters {
  readonly cnpj_normalizado?: string;
  readonly uf?: BrazilianUf;
  readonly priority?: ProducerPriority;
  readonly commercial_stage?: CommercialStage;
  readonly responsible_subject?: string | null;
}

export interface ListCommercialWorkQueueInput {
  readonly actor: Pick<CommercialActorContext, "organizationId">;
  readonly page?: number;
  readonly pageSize?: number;
  readonly filters?: CommercialWorkQueueFilters;
  readonly sort?: CommercialWorkQueueSort;
}

export interface ListCommercialWorkQueueResult {
  readonly kind: "listed";
  readonly items: readonly CommercialWorkQueueItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number | null;
  readonly provenance: CommercialWorkQueueProvenance;
}

export class CommercialWorkQueueRepositoryInputError extends Error {
  readonly code = "INVALID_COMMERCIAL_WORK_QUEUE_INPUT";

  constructor() {
    super("Invalid commercial work queue input.");
    this.name = "CommercialWorkQueueRepositoryInputError";
  }
}

interface SourceGuardRow extends QueryResultRow {
  readonly cnpj: string;
}

interface LeadCountRow extends QueryResultRow {
  readonly total: number | string;
}

interface LeadWorkspaceRow extends QueryResultRow {
  readonly workspace_id: string;
  readonly organization_id: string;
  readonly cnpj_normalizado: string;
  readonly observed_lead_run_id: string;
  readonly responsible_subject: string | null;
  readonly commercial_stage: CommercialStage;
  readonly next_action: string | null;
  readonly next_action_due_at: Date | string | null;
  readonly commercial_outcome: LeadWorkspaceDto["commercial_outcome"];
  readonly version: number;
  readonly created_by_subject: string;
  readonly updated_by_subject: string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly archived_at: Date | string | null;
  readonly archived_by_subject: string | null;
}

interface WorkspaceCnpjRow extends QueryResultRow {
  readonly cnpj_normalizado: string;
}

interface ValidatedListInput {
  readonly organizationId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly filters: CommercialWorkQueueFilters;
  readonly sort: CommercialWorkQueueSort;
}

interface ProducerFilterStatements {
  readonly clause: string;
  readonly values: readonly unknown[];
}

interface ProducerPage {
  readonly rows: readonly LeadSummaryRow[];
  readonly total: number | null;
  readonly provenance: CommercialWorkQueueProvenance["producer"];
}

export async function listCommercialWorkQueue(
  input: ListCommercialWorkQueueInput,
): Promise<ListCommercialWorkQueueResult> {
  const listInput = validateListInput(input);
  const workspaceFilterCnpjs = await readWorkspaceFilterCnpjs(listInput);

  if (workspaceFilterCnpjs !== undefined && workspaceFilterCnpjs.length === 0) {
    return {
      kind: "listed",
      items: [],
      page: listInput.page,
      pageSize: listInput.pageSize,
      total: 0,
      provenance: {
        producer: {
          factSource: PRODUCER_FACT_SOURCE,
          availability: "NOT_QUERIED",
        },
        workspace: workspaceProvenance(),
      },
    };
  }

  const producerPage = await readProducerPage(listInput, workspaceFilterCnpjs);

  if (producerPage.provenance.availability !== "AVAILABLE") {
    return {
      kind: "listed",
      items: [],
      page: listInput.page,
      pageSize: listInput.pageSize,
      total: null,
      provenance: {
        producer: producerPage.provenance,
        workspace: workspaceProvenance(),
      },
    };
  }

  const workspacesByCnpj = await readWorkspacesByCnpj({
    organizationId: listInput.organizationId,
    cnpjs: producerPage.rows.map((row) => row.cnpj_normalizado),
  });

  return {
    kind: "listed",
    items: producerPage.rows.map((row) =>
      mapQueueItem(row, workspacesByCnpj.get(row.cnpj_normalizado) ?? null),
    ),
    page: listInput.page,
    pageSize: listInput.pageSize,
    total: producerPage.total,
    provenance: {
      producer: producerPage.provenance,
      workspace: workspaceProvenance(),
    },
  };
}

async function readWorkspaceFilterCnpjs(
  input: ValidatedListInput,
): Promise<readonly string[] | undefined> {
  if (!hasWorkspaceFilters(input.filters)) {
    return undefined;
  }

  const rows = await queryAppDatabase<WorkspaceCnpjRow>(
    buildWorkspaceFilterCnpjsStatement(input),
  );

  return rows.map((row) => row.cnpj_normalizado);
}

async function readProducerPage(
  input: ValidatedListInput,
  workspaceFilterCnpjs: readonly string[] | undefined,
): Promise<ProducerPage> {
  try {
    const sourceRows =
      await queryProducerDatabase<SourceGuardRow>(sourceGuardStatement);

    if (sourceRows.length > MAXIMUM_CURRENT_PROJECTIONS) {
      return unavailableProducerPage("PRODUCER_SOURCE_GUARD_EXCEEDED");
    }

    const filters = buildProducerFilters(input.filters, workspaceFilterCnpjs);
    const [countRow] = await queryProducerDatabase<LeadCountRow>(
      buildCountStatement(filters),
    );
    const total =
      countRow === undefined ? null : toSafeTotal(countRow.total);

    if (total === null) {
      return unavailableProducerPage("PRODUCER_SOURCE_UNAVAILABLE");
    }

    const rows = await queryProducerDatabase<LeadSummaryRow>(
      buildDataStatement(filters, input),
    );

    return {
      rows,
      total,
      provenance: {
        factSource: PRODUCER_FACT_SOURCE,
        availability: "AVAILABLE",
      },
    };
  } catch (error) {
    if (error instanceof ProducerDatabaseUnavailableError) {
      return unavailableProducerPage("PRODUCER_SOURCE_UNAVAILABLE");
    }

    throw error;
  }
}

async function readWorkspacesByCnpj(input: {
  readonly organizationId: string;
  readonly cnpjs: readonly string[];
}): Promise<ReadonlyMap<string, LeadWorkspaceDto>> {
  if (input.cnpjs.length === 0) {
    return new Map();
  }

  const rows = await queryAppDatabase<LeadWorkspaceRow>(
    buildSelectWorkspacesByCnpjStatement(input),
  );

  return new Map(
    rows.map((row) => [row.cnpj_normalizado, mapWorkspaceRow(row)]),
  );
}

function buildWorkspaceFilterCnpjsStatement(
  input: ValidatedListInput,
): AppSqlStatement {
  const values: unknown[] = [input.organizationId];
  const conditions = [
    "organization_id = $1",
    "archived_at IS NULL",
  ];

  if (input.filters.commercial_stage !== undefined) {
    values.push(input.filters.commercial_stage);
    conditions.push(`commercial_stage = $${values.length}`);
  }

  if (Object.hasOwn(input.filters, "responsible_subject")) {
    if (input.filters.responsible_subject === null) {
      conditions.push("responsible_subject IS NULL");
    } else {
      values.push(input.filters.responsible_subject);
      conditions.push(`responsible_subject = $${values.length}`);
    }
  }

  return {
    text: `
      SELECT cnpj_normalizado
      FROM prospecting_app.lead_workspaces
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY cnpj_normalizado ASC`,
    values,
  };
}

function buildSelectWorkspacesByCnpjStatement(input: {
  readonly organizationId: string;
  readonly cnpjs: readonly string[];
}): AppSqlStatement {
  return {
    text: `
      SELECT ${workspaceColumns()}
      FROM prospecting_app.lead_workspaces
      WHERE organization_id = $1
        AND archived_at IS NULL
        AND cnpj_normalizado = ANY($2::text[])
      ORDER BY cnpj_normalizado ASC`,
    values: [input.organizationId, input.cnpjs],
  };
}

function buildProducerFilters(
  filters: CommercialWorkQueueFilters,
  workspaceFilterCnpjs: readonly string[] | undefined,
): ProducerFilterStatements {
  const conditions: string[] = [];
  const values: unknown[] = [...baseProducerValues];

  if (filters.cnpj_normalizado !== undefined) {
    values.push(filters.cnpj_normalizado);
    conditions.push(`lead.cnpj_normalizado = $${values.length}`);
  }

  if (filters.uf !== undefined) {
    values.push(filters.uf);
    conditions.push(`lead.uf = $${values.length}`);
  }

  if (filters.priority !== undefined) {
    values.push(filters.priority);
    conditions.push(`lead.priority = $${values.length}`);
  }

  if (workspaceFilterCnpjs !== undefined) {
    values.push(workspaceFilterCnpjs);
    conditions.push(`lead.cnpj_normalizado = ANY($${values.length}::text[])`);
  }

  return {
    clause:
      conditions.length === 0
        ? ""
        : `\nWHERE ${conditions.join("\n  AND ")}`,
    values,
  };
}

function buildCountStatement(
  filters: ProducerFilterStatements,
): ProducerSqlStatement {
  return {
    text: `${eligibleCurrentCte}
SELECT COUNT(*)::integer AS total
FROM eligible_current AS lead${filters.clause}`,
    values: filters.values,
  };
}

function buildDataStatement(
  filters: ProducerFilterStatements,
  input: Pick<ValidatedListInput, "page" | "pageSize" | "sort">,
): ProducerSqlStatement {
  const values = [...filters.values, input.pageSize];
  const limitParameter = `$${values.length}`;
  values.push((input.page - 1) * input.pageSize);
  const offsetParameter = `$${values.length}`;

  return {
    text: `${eligibleCurrentCte}
SELECT
  lead.decision_id,
  lead.import_batch_id,
  lead.lead_run_id,
  lead.source_row,
  lead.source_hash,
  lead.agent_version,
  lead.cnpj_normalizado,
  lead.nome_fantasia,
  lead.razao_social,
  lead.cidade,
  lead.uf,
  lead.cnae_descricao,
  lead.trust_score,
  lead.priority,
  lead.final_action,
  lead.trust_status,
  lead.validated_at
FROM eligible_current AS lead${filters.clause}
ORDER BY ${orderByClause(input.sort)}
LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
    values,
  };
}

function orderByClause(sort: CommercialWorkQueueSort): string {
  switch (sort) {
    case "last_analysis_desc":
      return "lead.validated_at DESC, lead.projection_id DESC";
  }
}

function workspaceColumns(): string {
  return `
        workspace_id,
        organization_id,
        cnpj_normalizado,
        observed_lead_run_id,
        responsible_subject,
        commercial_stage,
        next_action,
        next_action_due_at,
        commercial_outcome,
        version,
        created_by_subject,
        updated_by_subject,
        created_at,
        updated_at,
        archived_at,
        archived_by_subject`;
}

function validateListInput(
  input: ListCommercialWorkQueueInput,
): ValidatedListInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  if (
    typeof input.actor !== "object" ||
    input.actor === null ||
    Array.isArray(input.actor)
  ) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  const page = input.page ?? DEFAULT_PAGE;
  const requestedPageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE ||
    !Number.isSafeInteger(requestedPageSize) ||
    requestedPageSize < 1
  ) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return {
    organizationId: parseOrganizationId(input.actor.organizationId),
    page,
    pageSize: Math.min(requestedPageSize, MAX_PAGE_SIZE),
    filters: parseFilters(input.filters),
    sort: parseSort(input.sort),
  };
}

function parseOrganizationId(value: string): string {
  const result = organizationIdSchema.safeParse(value);

  if (!result.success) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return result.data;
}

function parseFilters(
  filters: CommercialWorkQueueFilters | undefined,
): CommercialWorkQueueFilters {
  if (filters === undefined) {
    return {};
  }

  if (
    typeof filters !== "object" ||
    filters === null ||
    Array.isArray(filters)
  ) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  const allowedKeys = new Set([
    "cnpj_normalizado",
    "uf",
    "priority",
    "commercial_stage",
    "responsible_subject",
  ]);

  for (const key of Object.keys(filters)) {
    if (!allowedKeys.has(key)) {
      throw new CommercialWorkQueueRepositoryInputError();
    }
  }

  return {
    cnpj_normalizado: parseOptionalCnpj(filters.cnpj_normalizado),
    uf: parseOptionalUf(filters.uf),
    priority: parseOptionalPriority(filters.priority),
    commercial_stage: parseOptionalCommercialStage(
      filters.commercial_stage,
    ),
    ...(Object.hasOwn(filters, "responsible_subject")
      ? {
          responsible_subject: parseOptionalResponsibleSubject(
            filters.responsible_subject,
          ),
        }
      : {}),
  };
}

function parseSort(
  sort: CommercialWorkQueueSort | undefined,
): CommercialWorkQueueSort {
  if (sort === undefined) {
    return "last_analysis_desc";
  }

  if (!isOneOf(commercialWorkQueueSorts, sort)) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return sort;
}

function parseOptionalCnpj(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const result = cnpjNormalizadoSchema.safeParse(value);

  if (!result.success) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return result.data;
}

function parseOptionalUf(value: unknown): BrazilianUf | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isOneOf(brazilianUfs, value)) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return value;
}

function parseOptionalPriority(value: unknown): ProducerPriority | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isOneOf(approvedProducerPriorities, value)) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return value;
}

function parseOptionalCommercialStage(
  value: unknown,
): CommercialStage | undefined {
  if (value === undefined) {
    return undefined;
  }

  const result = commercialStageSchema.safeParse(value);

  if (!result.success) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return result.data;
}

function parseOptionalResponsibleSubject(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  const result = subjectSchema.safeParse(value);

  if (!result.success) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  return result.data;
}

function hasWorkspaceFilters(filters: CommercialWorkQueueFilters): boolean {
  return (
    filters.commercial_stage !== undefined ||
    Object.hasOwn(filters, "responsible_subject")
  );
}

function mapQueueItem(
  row: LeadSummaryRow,
  workspace: LeadWorkspaceDto | null,
): CommercialWorkQueueItem {
  return {
    producerLead: mapLeadSummary(row),
    workspace,
    sources: {
      producer: {
        factSource: PRODUCER_FACT_SOURCE,
      },
      workspace: {
        factSource: WORKSPACE_FACT_SOURCE,
        state: workspace === null ? "missing" : "matched",
      },
    },
  };
}

function mapWorkspaceRow(row: LeadWorkspaceRow): LeadWorkspaceDto {
  return {
    workspace_id: row.workspace_id,
    organization_id: row.organization_id,
    cnpj_normalizado: row.cnpj_normalizado,
    observed_lead_run_id: row.observed_lead_run_id,
    responsible_subject: row.responsible_subject,
    commercial_stage: row.commercial_stage,
    next_action: row.next_action,
    next_action_due_at: toIsoStringOrNull(row.next_action_due_at),
    commercial_outcome: row.commercial_outcome,
    version: row.version,
    created_by_subject: row.created_by_subject,
    updated_by_subject: row.updated_by_subject,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
    archived_at: toIsoStringOrNull(row.archived_at),
    archived_by_subject: row.archived_by_subject,
  };
}

function unavailableProducerPage(
  unavailableBasis: NonNullable<
    CommercialWorkQueueProvenance["producer"]["unavailableBasis"]
  >,
): ProducerPage {
  return {
    rows: [],
    total: null,
    provenance: {
      factSource: PRODUCER_FACT_SOURCE,
      availability: "UNAVAILABLE",
      unavailableBasis,
    },
  };
}

function workspaceProvenance(): CommercialWorkQueueProvenance["workspace"] {
  return {
    factSource: WORKSPACE_FACT_SOURCE,
    availability: "AVAILABLE",
  };
}

function isOneOf<Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  );
}

function toSafeTotal(value: number | string): number | null {
  const total = typeof value === "number" ? value : Number(value);

  if (
    Number.isSafeInteger(total) &&
    total >= 0 &&
    total <= MAXIMUM_CURRENT_PROJECTIONS
  ) {
    return total;
  }

  return null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoStringOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}
