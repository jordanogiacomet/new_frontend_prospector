import "server-only";

import { randomUUID } from "node:crypto";

import type { LeadListQuery, LeadHistoryQuery } from "../../lib/validators/lead-query";
import type {
  LeadDetail,
  LeadHistoryItem,
  LeadSummary,
} from "../../types/leads";
import type { BatchSummary } from "../../types/imports";
import type { SubmitImportResult } from "../imports/submit-import";
import { validateAndHashUploadFile } from "../imports/upload-file";
import type {
  ImportSubmissionRecord,
  ImportSubmissionStatus,
} from "../repositories/imports/import-submissions-repository";
import type { AuthorizedActor } from "../auth/authorization";

const retainedHistoryCompleteness = "retained_only";
const retainedHistoryLabel = "Análises retidas encontradas";
const retainedHistoryCaveat =
  "Análises mais antigas podem não estar presentes.";

const staticSubmittedAt = "2026-07-07T13:00:00.000Z";
const staticAcceptedAt = "2026-07-07T13:02:00.000Z";
const staticObservedAt = "2026-07-07T13:18:00.000Z";

type DemoSubmitActor = Pick<
  AuthorizedActor,
  "organizationId" | "subject"
>;

interface SubmitDemoImportInput {
  readonly organizationId: string;
  readonly actor: DemoSubmitActor;
  readonly idempotencyKey: string;
  readonly file: File;
}

interface DemoLeadListResult {
  readonly leads: readonly LeadSummary[];
  readonly total: number;
}

interface DemoLeadHistoryResult {
  readonly history: readonly LeadHistoryItem[];
  readonly total: number;
  readonly completeness: typeof retainedHistoryCompleteness;
  readonly label: typeof retainedHistoryLabel;
  readonly caveat: typeof retainedHistoryCaveat;
}

interface DemoImportBatchListResult {
  readonly batches: readonly BatchSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number | null;
}

type DemoImportBatchDetailResult =
  | {
      readonly kind: "found";
      readonly batch: BatchSummary;
    }
  | {
      readonly kind: "not_found";
      readonly error: {
        readonly code: "IMPORT_SUBMISSION_NOT_FOUND";
        readonly httpStatus: 404;
        readonly message: "Import submission was not found.";
      };
    };

const demoLeadDetails: readonly LeadDetail[] = [
  {
    decision_id: "demo-decision-001",
    import_batch_id: "demo-batch-20260707-a",
    lead_run_id: "lr_a1b2c3d4",
    source_row: 2,
    source_hash: "a".repeat(64),
    agent_version: "demo-agent-v1",
    cnpj: "12345678000195",
    companyName: "Atlas Energia Solar Ltda",
    city: "Sao Paulo",
    uf: "SP",
    sector: "Energia solar e instalacoes eletricas",
    score: 86,
    priority: "B",
    recommendedAction: "PROSPECTAR",
    trustStatus: "Revisão Humana",
    confidenceIndicator: "normal",
    lastAnalysisAt: "2026-07-07T13:15:00.000Z",
    legalName: "Atlas Energia Solar Ltda",
    tradeName: "Atlas Solar",
    primaryCnae: "4321-5/00",
    primaryCnaeDescription: "Instalacao e manutencao eletrica",
    companySize: "Empresa de pequeno porte",
    taxRegime: "Simples Nacional",
    estimatedRevenue: "R$ 3,8 mi a R$ 5,2 mi",
    employeeCount: "25 a 40",
    branchCount: 1,
    finalVerdict: "REVISAO_HUMANA",
    recommendedActionReason:
      "Empresa com sinais de crescimento e aderencia ao perfil comercial definido para a apresentacao.",
    icpScore: 82,
    strategicAssetScore: 78,
    strategicTier: "Conta regional prioritaria",
    riskFlags: {
      status: "available",
      items: [
        "Confirmar responsavel antes da abordagem.",
        "Validar capacidade operacional para contratos maiores.",
      ],
    },
    positiveSignals: {
      status: "available",
      items: [
        "Atua em setor com demanda recorrente.",
        "Possui indicios de expansao regional.",
      ],
    },
    evidences: {
      status: "omitted_by_policy",
      content: null,
    },
    strategicReport: {
      status: "omitted_by_policy",
      content: null,
    },
    audit: {
      decision_id: "demo-decision-001",
      import_batch_id: "demo-batch-20260707-a",
      lead_run_id: "lr_a1b2c3d4",
      source_row: 2,
      source_hash: "a".repeat(64),
      agent_version: "demo-agent-v1",
      idempotency_key: null,
      used_cache: false,
      validated_at: "2026-07-07T13:15:00.000Z",
      created_at: "2026-07-07T13:14:00.000Z",
      updated_at: "2026-07-07T13:15:00.000Z",
      expires_at: null,
    },
    dataQuality: [
      { code: "CONTENT_WITHHELD", field: "evidences" },
      { code: "CONTENT_WITHHELD", field: "strategicReport" },
    ],
  },
  {
    decision_id: "demo-decision-002",
    import_batch_id: "demo-batch-20260707-a",
    lead_run_id: "lr_b2c3d4e5",
    source_row: 3,
    source_hash: "b".repeat(64),
    agent_version: "demo-agent-v1",
    cnpj: "22345678000190",
    companyName: "NorteLog Operacoes Integradas",
    city: "Recife",
    uf: "PE",
    sector: "Logistica e armazenagem",
    score: 74,
    priority: "C",
    recommendedAction: "PROSPECTAR_COM_CAUTELA",
    trustStatus: "Revisão Humana",
    confidenceIndicator: "normal",
    lastAnalysisAt: "2026-07-07T13:12:00.000Z",
    legalName: "NorteLog Operacoes Integradas Ltda",
    tradeName: "NorteLog",
    primaryCnae: "5211-7/99",
    primaryCnaeDescription: "Depositos de mercadorias para terceiros",
    companySize: "Empresa de medio porte",
    taxRegime: "Lucro presumido",
    estimatedRevenue: "R$ 8 mi a R$ 12 mi",
    employeeCount: "60 a 90",
    branchCount: 2,
    finalVerdict: "REVISAO_HUMANA",
    recommendedActionReason:
      "Conta promissora, mas a abordagem deve validar ciclo de compra e decisor.",
    icpScore: 71,
    strategicAssetScore: 68,
    strategicTier: "Conta operacional",
    riskFlags: {
      status: "available",
      items: ["Dependencia de contratos sazonais."],
    },
    positiveSignals: {
      status: "available",
      items: ["Operacao com multiplas unidades.", "Setor com recorrencia."],
    },
    evidences: {
      status: "omitted_by_policy",
      content: null,
    },
    strategicReport: {
      status: "omitted_by_policy",
      content: null,
    },
    audit: {
      decision_id: "demo-decision-002",
      import_batch_id: "demo-batch-20260707-a",
      lead_run_id: "lr_b2c3d4e5",
      source_row: 3,
      source_hash: "b".repeat(64),
      agent_version: "demo-agent-v1",
      idempotency_key: null,
      used_cache: false,
      validated_at: "2026-07-07T13:12:00.000Z",
      created_at: "2026-07-07T13:11:00.000Z",
      updated_at: "2026-07-07T13:12:00.000Z",
      expires_at: null,
    },
    dataQuality: [
      { code: "CONTENT_WITHHELD", field: "evidences" },
      { code: "CONTENT_WITHHELD", field: "strategicReport" },
    ],
  },
  {
    decision_id: "demo-decision-003",
    import_batch_id: "demo-batch-20260707-b",
    lead_run_id: "lr_c3d4e5f6",
    source_row: 4,
    source_hash: "c".repeat(64),
    agent_version: "demo-agent-v1",
    cnpj: "32345678000194",
    companyName: "Prisma Clinica Diagnostica",
    city: "Belo Horizonte",
    uf: "MG",
    sector: "Saude diagnostica",
    score: 63,
    priority: "E",
    recommendedAction: "NUTRIR",
    trustStatus: "Revisão Humana",
    confidenceIndicator: "unknown",
    lastAnalysisAt: "2026-07-07T12:58:00.000Z",
    legalName: "Prisma Clinica Diagnostica Ltda",
    tradeName: "Prisma Diagnosticos",
    primaryCnae: "8640-2/02",
    primaryCnaeDescription: "Laboratorios clinicos",
    companySize: "Empresa de pequeno porte",
    taxRegime: "Lucro presumido",
    estimatedRevenue: "R$ 2 mi a R$ 3 mi",
    employeeCount: "15 a 25",
    branchCount: 1,
    finalVerdict: "REVISAO_HUMANA",
    recommendedActionReason:
      "Perfil de interesse futuro; manter em acompanhamento comercial.",
    icpScore: 59,
    strategicAssetScore: 61,
    strategicTier: "Conta em nutricao",
    riskFlags: {
      status: "available",
      items: ["Baixa evidencia de expansao recente."],
    },
    positiveSignals: {
      status: "available",
      items: ["Segmento com necessidade de relacionamento consultivo."],
    },
    evidences: {
      status: "omitted_by_policy",
      content: null,
    },
    strategicReport: {
      status: "omitted_by_policy",
      content: null,
    },
    audit: {
      decision_id: "demo-decision-003",
      import_batch_id: "demo-batch-20260707-b",
      lead_run_id: "lr_c3d4e5f6",
      source_row: 4,
      source_hash: "c".repeat(64),
      agent_version: "demo-agent-v1",
      idempotency_key: null,
      used_cache: true,
      validated_at: "2026-07-07T12:58:00.000Z",
      created_at: "2026-07-07T12:57:00.000Z",
      updated_at: "2026-07-07T12:58:00.000Z",
      expires_at: null,
    },
    dataQuality: [
      { code: "CONTENT_WITHHELD", field: "evidences" },
      { code: "CONTENT_WITHHELD", field: "strategicReport" },
    ],
  },
];

const demoHistoryByCnpj = new Map<string, readonly LeadHistoryItem[]>([
  [
    "12345678000195",
    [
      {
        decision_id: "demo-decision-001",
        import_batch_id: "demo-batch-20260707-a",
        lead_run_id: "lr_a1b2c3d4",
        source_row: 2,
        analyzedAt: "2026-07-07T13:15:00.000Z",
        recommendedAction: "PROSPECTAR",
        recommendedActionReason:
          "Empresa com sinais de crescimento e aderencia ao perfil comercial definido para a apresentacao.",
        isCurrent: true,
      },
      {
        decision_id: "demo-decision-001-prev",
        import_batch_id: "demo-batch-20260701-a",
        lead_run_id: "lr_d4e5f6a7",
        source_row: 9,
        analyzedAt: "2026-07-01T15:30:00.000Z",
        recommendedAction: "PROSPECTAR_COM_CAUTELA",
        recommendedActionReason:
          "Analise anterior recomendava validacao manual antes da abordagem.",
        isCurrent: false,
      },
    ],
  ],
]);

const staticDemoBatches: readonly BatchSummary[] = [
  {
    submissionId: "10000000-0000-4000-8000-000000000001",
    import_batch_id: "demo-batch-20260707-a",
    status: "COMPLETED",
    submittedAt: staticSubmittedAt,
    acceptedAt: staticAcceptedAt,
    lastObservedAt: staticObservedAt,
    rowCountAccepted: 42,
    terminalCount: 42,
    blockedCount: 3,
    failedCount: 1,
    leadCount: 38,
    statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
    observationStatus: "AVAILABLE",
    observationBasis: null,
  },
  {
    submissionId: "10000000-0000-4000-8000-000000000002",
    import_batch_id: "demo-batch-20260707-b",
    status: "PROCESSING",
    submittedAt: "2026-07-07T12:45:00.000Z",
    acceptedAt: "2026-07-07T12:47:00.000Z",
    lastObservedAt: "2026-07-07T13:05:00.000Z",
    rowCountAccepted: 18,
    terminalCount: 11,
    blockedCount: 1,
    failedCount: 0,
    leadCount: 10,
    statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
    observationStatus: "AVAILABLE",
    observationBasis: null,
  },
];

const demoSubmissionsByIdempotencyKey = new Map<
  string,
  ImportSubmissionRecord
>();

export function listDemoLeads(input: LeadListQuery): DemoLeadListResult {
  const filtered = demoLeadDetails
    .filter((lead) => input.cnpj === undefined || lead.cnpj === input.cnpj)
    .filter((lead) => input.uf === undefined || lead.uf === input.uf)
    .filter(
      (lead) =>
        input.priority === undefined || lead.priority === input.priority,
    );
  const start = (input.page - 1) * input.pageSize;
  const page = filtered.slice(start, start + input.pageSize);

  return {
    leads: page.map(toLeadSummary),
    total: filtered.length,
  };
}

export function getDemoLeadDetail(
  cnpj: string,
  leadRunId?: string,
): LeadDetail | null {
  return (
    demoLeadDetails.find(
      (lead) =>
        lead.cnpj === cnpj &&
        (leadRunId === undefined || lead.lead_run_id === leadRunId),
    ) ?? null
  );
}

export function listDemoLeadHistory(
  cnpj: string,
  input: LeadHistoryQuery,
): DemoLeadHistoryResult {
  const history =
    demoHistoryByCnpj.get(cnpj) ??
    demoLeadDetails
      .filter((lead) => lead.cnpj === cnpj)
      .map((lead) => ({
        decision_id: lead.decision_id,
        import_batch_id: lead.import_batch_id,
        lead_run_id: lead.lead_run_id,
        source_row: lead.source_row,
        analyzedAt: lead.lastAnalysisAt,
        recommendedAction: lead.recommendedAction ?? "REVISAO_HUMANA",
        recommendedActionReason: lead.recommendedActionReason,
        isCurrent: true,
      }));
  const start = (input.page - 1) * input.pageSize;

  return {
    history: history.slice(start, start + input.pageSize),
    total: history.length,
    completeness: retainedHistoryCompleteness,
    label: retainedHistoryLabel,
    caveat: retainedHistoryCaveat,
  };
}

export function listDemoImportBatches(input: {
  readonly page: number;
  readonly pageSize: number;
}): DemoImportBatchListResult {
  const batches = [
    ...[...demoSubmissionsByIdempotencyKey.values()].map(
      demoSubmissionToBatch,
    ),
    ...staticDemoBatches,
  ];
  const start = (input.page - 1) * input.pageSize;

  return {
    batches: batches.slice(start, start + input.pageSize),
    page: input.page,
    pageSize: input.pageSize,
    total: batches.length,
  };
}

export function getDemoImportBatchDetail(
  submissionId: string,
): DemoImportBatchDetailResult {
  const uploaded = [...demoSubmissionsByIdempotencyKey.values()].find(
    (submission) => submission.submissionId === submissionId,
  );
  const batch =
    uploaded === undefined
      ? staticDemoBatches.find(
          (candidate) => candidate.submissionId === submissionId,
        )
      : demoSubmissionToBatch(uploaded);

  if (batch === undefined) {
    return {
      kind: "not_found",
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        httpStatus: 404,
        message: "Import submission was not found.",
      },
    };
  }

  return {
    kind: "found",
    batch,
  };
}

export async function submitDemoImport(
  input: SubmitDemoImportInput,
): Promise<SubmitImportResult> {
  const file = await validateAndHashUploadFile(input.file);
  const existing = demoSubmissionsByIdempotencyKey.get(input.idempotencyKey);

  if (existing !== undefined) {
    return existing.fileSha256 === file.sha256
      ? {
          kind: "duplicate",
          producerOutcome: "acknowledged",
          submission: existing,
        }
      : {
          kind: "conflict",
          error: {
            code: "IMPORT_IDEMPOTENCY_CONFLICT",
            httpStatus: 409,
            message: "Submission conflicts with an earlier file.",
          },
        };
  }

  const submittedAt = new Date();
  const rowCount = countCsvDataRows(file.bytes);
  const submission = createSubmissionRecord({
    organizationId: input.organizationId,
    idempotencyKey: input.idempotencyKey,
    fileSha256: file.sha256,
    originalFilename: file.filename,
    sizeBytes: file.sizeBytes,
    mediaType: file.mediaType,
    submittedAt,
    rowCount,
  });

  demoSubmissionsByIdempotencyKey.set(input.idempotencyKey, submission);

  return {
    kind: "submitted",
    producerOutcome: "acknowledged",
    submission,
  };
}

function toLeadSummary(lead: LeadDetail): LeadSummary {
  return {
    decision_id: lead.decision_id,
    import_batch_id: lead.import_batch_id,
    lead_run_id: lead.lead_run_id,
    source_row: lead.source_row,
    source_hash: lead.source_hash,
    agent_version: lead.agent_version,
    cnpj: lead.cnpj,
    companyName: lead.companyName,
    city: lead.city,
    uf: lead.uf,
    sector: lead.sector,
    score: lead.score,
    priority: lead.priority,
    recommendedAction: lead.recommendedAction,
    trustStatus: lead.trustStatus,
    confidenceIndicator: lead.confidenceIndicator,
    lastAnalysisAt: lead.lastAnalysisAt,
  };
}

function countCsvDataRows(bytes: Uint8Array): number {
  const content = new TextDecoder("utf-8").decode(bytes);
  const nonEmptyLines = content
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0);

  return Math.max(0, nonEmptyLines.length - 1);
}

function createSubmissionRecord(input: {
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly fileSha256: string;
  readonly originalFilename: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
  readonly submittedAt: Date;
  readonly rowCount: number;
}): ImportSubmissionRecord {
  const status: ImportSubmissionStatus = "PRODUCER_ACKNOWLEDGED";
  const acknowledgedAt = new Date(input.submittedAt.getTime() + 1_000);

  return {
    submissionId: randomUUID(),
    organizationId: input.organizationId,
    idempotencyKey: input.idempotencyKey,
    fileSha256: input.fileSha256,
    originalFilename: input.originalFilename,
    sizeBytes: input.sizeBytes,
    mediaType: input.mediaType,
    appContractVersion: "prospecta-import-v1",
    status,
    statusFactSource: "demo_workflow_acknowledgement",
    submittedAt: input.submittedAt,
    producerAcknowledgement: {
      import_batch_id: `demo-upload-${input.fileSha256.slice(0, 12)}`,
      row_count: input.rowCount,
      producerAcknowledgedAt: acknowledgedAt,
    },
  };
}

function demoSubmissionToBatch(
  submission: ImportSubmissionRecord,
): BatchSummary {
  return {
    submissionId: submission.submissionId,
    import_batch_id:
      submission.producerAcknowledgement?.import_batch_id ?? null,
    status: "SUBMITTED",
    submittedAt: submission.submittedAt.toISOString(),
    acceptedAt: null,
    lastObservedAt:
      submission.producerAcknowledgement?.producerAcknowledgedAt.toISOString() ??
      null,
    rowCountAccepted: null,
    terminalCount: null,
    blockedCount: null,
    failedCount: null,
    leadCount: null,
    statusBasis: "SUBMISSION_RECORDED",
    observationStatus: "AVAILABLE",
    observationBasis: null,
  };
}
