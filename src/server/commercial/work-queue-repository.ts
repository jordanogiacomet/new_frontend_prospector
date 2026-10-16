import "server-only";

import type { QueryResultRow } from "pg";

import {
  cnpjNormalizadoSchema,
  commercialStageSchema,
  organizationIdSchema,
  subjectSchema,
} from "../../lib/validators/commercial";
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
import { companyDomainSchema } from "../contact-enrichment-v2/contact-enrichment-v2-contract";
import {
  appendCorrelatedCurrentLeadBatchIds,
  buildEligibleCurrentLeadsCte,
  currentLeadBaseValues,
  currentLeadDefaultOrderBy,
  currentLeadSourceGuardStatement,
  maximumCurrentLeadProjections,
} from "../repositories/current-lead-query";
import type { LeadRunVisibilityOptions } from "../repositories/production-run-predicate";
import {
  listLeadApproachDraftStates,
  type ListedLeadApproachDraftState,
} from "../lead-approach/lead-approach-draft-repository";
import { LEAD_APPROACH_GENERATOR_VERSION } from "../lead-approach/generate-lead-approach";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;
const PRODUCER_FACT_SOURCE = "producer_current_leads_v1";
const WORKSPACE_FACT_SOURCE = "app_lead_workspaces_v1";

interface CommercialWorkQueueRow extends LeadSummaryRow {
  readonly company_domain: string | null;
}

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

const approvedProducerPriorities = ["B", "C", "D", "E", "R"] as const;

type ProducerPriority = (typeof approvedProducerPriorities)[number];

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

export type CommercialWorkQueueOptions = LeadRunVisibilityOptions;

export interface CommercialWorkQueuePresentationOptions {
  readonly includeApproachDrafts?: boolean;
  readonly now?: Date;
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
  readonly rows: readonly CommercialWorkQueueRow[];
  readonly total: number | null;
  readonly provenance: CommercialWorkQueueProvenance["producer"];
}

export async function listCommercialWorkQueue(
  input: ListCommercialWorkQueueInput,
  options: CommercialWorkQueueOptions = {},
  presentationOptions: CommercialWorkQueuePresentationOptions = {},
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

  const producerPage = await readProducerPage(
    listInput,
    workspaceFilterCnpjs,
    options,
  );

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
  const approachDraftsByLead = await readApproachDraftsByLead({
    organizationId: listInput.organizationId,
    rows: producerPage.rows,
    options: presentationOptions,
  });

  return {
    kind: "listed",
    items: producerPage.rows.map((row) =>
      mapQueueItem(
        row,
        workspacesByCnpj.get(row.cnpj_normalizado) ?? null,
        approachDraftsByLead.get(
          approachDraftKey(row.cnpj_normalizado, row.lead_run_id),
        ) ?? null,
        presentationOptions.includeApproachDrafts === true,
      ),
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

async function readApproachDraftsByLead(input: {
  readonly organizationId: string;
  readonly rows: readonly CommercialWorkQueueRow[];
  readonly options: CommercialWorkQueuePresentationOptions;
}): Promise<ReadonlyMap<string, ListedLeadApproachDraftState>> {
  if (input.options.includeApproachDrafts !== true) {
    return new Map();
  }

  const now = input.options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new CommercialWorkQueueRepositoryInputError();
  }

  const states = await listLeadApproachDraftStates({
    organizationId: input.organizationId,
    generatorVersion: LEAD_APPROACH_GENERATOR_VERSION,
    identities: input.rows.map((row) => ({
      cnpjNormalizado: row.cnpj_normalizado,
      observedLeadRunId: row.lead_run_id,
    })),
    now,
  });

  return new Map(
    states.map((state) => [
      approachDraftKey(state.cnpjNormalizado, state.observedLeadRunId),
      state,
    ]),
  );
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
  options: CommercialWorkQueueOptions,
): Promise<ProducerPage> {
  try {
    const sourceRows =
      await queryProducerDatabase<SourceGuardRow>(
        currentLeadSourceGuardStatement,
      );

    if (sourceRows.length > maximumCurrentLeadProjections) {
      return unavailableProducerPage("PRODUCER_SOURCE_GUARD_EXCEEDED");
    }

    const filters = buildProducerFilters(input.filters, workspaceFilterCnpjs);
    const [countRow] = await queryProducerDatabase<LeadCountRow>(
      buildCountStatement(filters, options),
    );
    const total =
      countRow === undefined ? null : toSafeTotal(countRow.total);

    if (total === null) {
      return unavailableProducerPage("PRODUCER_SOURCE_UNAVAILABLE");
    }

    const rows = await queryProducerDatabase<CommercialWorkQueueRow>(
      buildDataStatement(filters, input, options),
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
  const values: unknown[] = [...currentLeadBaseValues];

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
  options: CommercialWorkQueueOptions,
): ProducerSqlStatement {
  const values = [...filters.values];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedCurrentLeadBatchIds(values, options);

  return {
    text: `${buildEligibleCurrentLeadsCte(
      options,
      correlatedImportBatchIdsParameter,
    )}
SELECT COUNT(*)::integer AS total
FROM eligible_current AS lead${filters.clause}`,
    values,
  };
}

function buildDataStatement(
  filters: ProducerFilterStatements,
  input: Pick<ValidatedListInput, "page" | "pageSize" | "sort">,
  options: CommercialWorkQueueOptions,
): ProducerSqlStatement {
  const values = [...filters.values];
  const correlatedImportBatchIdsParameter =
    appendCorrelatedCurrentLeadBatchIds(values, options);
  values.push(input.pageSize);
  const limitParameter = `$${values.length}`;
  values.push((input.page - 1) * input.pageSize);
  const offsetParameter = `$${values.length}`;

  return {
    text: `${buildEligibleCurrentLeadsCte(
      options,
      correlatedImportBatchIdsParameter,
    )}
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
  (
    SELECT CASE
      WHEN COUNT(DISTINCT LOWER(BTRIM(history.website_domain))) = 1
        THEN MIN(LOWER(BTRIM(history.website_domain)))
      ELSE NULL
    END
    FROM public.crm_company_history AS history
    WHERE history.cnpj = lead.cnpj_normalizado
      AND history.website_domain IS NOT NULL
      AND BTRIM(history.website_domain) <> ''
  ) AS company_domain,
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
      return currentLeadDefaultOrderBy;
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
  row: CommercialWorkQueueRow,
  workspace: LeadWorkspaceDto | null,
  approachDraft: ListedLeadApproachDraftState | null,
  includeApproachDrafts: boolean,
): CommercialWorkQueueItem {
  const companyDomain = companyDomainSchema.safeParse(row.company_domain);

  return {
    approachDraft: mapQueueApproachDraft(
      approachDraft,
      includeApproachDrafts,
      isAutomaticApproachPriority(row.priority),
    ),
    companyDomain: companyDomain.success ? companyDomain.data : null,
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

function mapQueueApproachDraft(
  draft: ListedLeadApproachDraftState | null,
  includeApproachDrafts: boolean,
  isAutomaticPriority: boolean,
): CommercialWorkQueueItem["approachDraft"] {
  if (!includeApproachDrafts) {
    return null;
  }
  if (draft !== null) {
    return mapApproachDraft(draft);
  }
  return isAutomaticPriority ? mapApproachDraft(null) : null;
}

function mapApproachDraft(
  draft: ListedLeadApproachDraftState | null,
): CommercialWorkQueueItem["approachDraft"] {
  if (draft === null) {
    return { status: "missing", message: null };
  }
  if (draft.status === "ready") {
    return { status: "ready", message: draft.message };
  }
  return { status: draft.status, message: null };
}

function isAutomaticApproachPriority(value: string | null): boolean {
  return value === "B" || value === "C";
}

function approachDraftKey(cnpj: string, leadRunId: string): string {
  return `${cnpj}:${leadRunId}`;
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
    total <= maximumCurrentLeadProjections
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
