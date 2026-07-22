import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listImportSubmissions: vi.fn(),
  getImportSubmissionDetail: vi.fn(),
  readProducerBatchObservations: vi.fn(),
  readProducerBatchObservationsByBatchIds: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("../repositories/imports/import-submissions-repository", () => ({
  listImportSubmissions: mocks.listImportSubmissions,
  getImportSubmissionDetail: mocks.getImportSubmissionDetail,
}));
vi.mock(
  "../repositories/imports/producer-batch-observations-repository",
  () => ({
    readProducerBatchObservations: mocks.readProducerBatchObservations,
    readProducerBatchObservationsByBatchIds:
      mocks.readProducerBatchObservationsByBatchIds,
  }),
);

import {
  BatchReadServiceInputError,
  getImportBatchDetail,
  listImportBatches,
  type GetImportBatchDetailInput,
  type ListImportBatchesInput,
} from "./batch-read-service";
import type {
  ImportSubmissionReadModel,
  GetImportSubmissionDetailResult,
  ListImportSubmissionsResult,
} from "../repositories/imports/import-submissions-repository";
import type {
  BatchProducerObservationFacts,
  BatchSummary,
  BatchTerminalOutcomeFact,
} from "../../types/imports";

const organizationId = "org-synthetic-a";
const submissionId = "00000000-0000-4000-8000-000000000023";
const secondSubmissionId = "00000000-0000-4000-8000-000000000024";
const submittedAt = new Date("2026-07-07T12:00:00.000Z");
const acknowledgedAt = new Date("2026-07-07T12:01:00.000Z");
const acceptedAt = new Date("2026-07-07T12:02:00.000Z");
const observedAt = new Date("2026-07-07T12:03:00.000Z");
const closedAt = new Date("2026-07-07T12:04:00.000Z");
const importBatchId = "empresaqui_2026-07-07T12:00:00.000Z";

function submission(
  overrides: Partial<ImportSubmissionReadModel> = {},
): ImportSubmissionReadModel {
  return {
    submissionId: overrides.submissionId ?? submissionId,
    originalFilename:
      overrides.originalFilename ?? "empresaqui-sintetica.csv",
    sizeBytes: overrides.sizeBytes ?? 128,
    mediaType: overrides.mediaType ?? "text/csv",
    appContractVersion:
      overrides.appContractVersion ?? "prospecta-import-v1",
    appStatus: overrides.appStatus ?? "SUBMISSION_RECORDED",
    statusFactSource: overrides.statusFactSource ?? "app_submission",
    submittedAt: overrides.submittedAt ?? submittedAt,
    lastObservedAt: overrides.lastObservedAt ?? null,
    workflowAcknowledgement:
      "workflowAcknowledgement" in overrides
        ? (overrides.workflowAcknowledgement ?? null)
        : null,
    durableAcceptance:
      "durableAcceptance" in overrides
        ? (overrides.durableAcceptance ?? null)
        : null,
  };
}

function acknowledgedSubmission(
  overrides: Partial<ImportSubmissionReadModel> = {},
): ImportSubmissionReadModel {
  return submission({
    appStatus: "PRODUCER_ACKNOWLEDGED",
    statusFactSource: "workflow_acknowledgement",
    workflowAcknowledgement: {
      import_batch_id: importBatchId,
      row_count: 3,
      acknowledgedAt,
    },
    lastObservedAt: acknowledgedAt,
    ...overrides,
  });
}

function acceptedSubmission(
  overrides: Partial<ImportSubmissionReadModel> = {},
): ImportSubmissionReadModel {
  return acknowledgedSubmission({
    appStatus: "DURABLE_ACCEPTED",
    statusFactSource: "durable_acceptance",
    durableAcceptance: {
      acceptedAt,
      rowCountAccepted: 3,
    },
    ...overrides,
  });
}

function observations(
  overrides: Partial<BatchProducerObservationFacts> = {},
): BatchProducerObservationFacts {
  return {
    factSource: "producer_x4_batch_observations_v1",
    availability: "AVAILABLE",
    lastObservedAt: null,
    acceptedRows: [],
    terminalOutcomes: [],
    close: null,
    retainedLegacyObservations: [],
    ...overrides,
  };
}

function lastObservedAtFact(): NonNullable<
  BatchProducerObservationFacts["lastObservedAt"]
> {
  return {
    factSource: "producer_x4_observation_clock_v1",
    observedAt,
  };
}

function acceptedRows(
  sourceRows: readonly number[],
): BatchProducerObservationFacts["acceptedRows"] {
  return sourceRows.map((sourceRow) => ({
    factSource: "producer_x4_accepted_rows_v1",
    sourceRow,
  }));
}

function terminal(
  sourceRow: number,
  terminalClass: "MATERIALIZED",
  leadRunId?: string,
): BatchTerminalOutcomeFact;
function terminal(
  sourceRow: number,
  terminalClass: "BLOCKED" | "FAILED",
): BatchTerminalOutcomeFact;
function terminal(
  sourceRow: number,
  terminalClass: BatchTerminalOutcomeFact["terminalClass"],
  leadRunId = `lead-run-${sourceRow}`,
): BatchTerminalOutcomeFact {
  if (terminalClass === "MATERIALIZED") {
    return {
      factSource: "producer_x4_terminal_outcomes_v1",
      sourceRow,
      terminalClass,
      leadRunId,
    };
  }

  return {
    factSource: "producer_x4_terminal_outcomes_v1",
    sourceRow,
    terminalClass,
  };
}

function close(): NonNullable<BatchProducerObservationFacts["close"]> {
  return {
    factSource: "producer_x4_batch_close_v1",
    closedAt,
  };
}

function unavailableObservations(): BatchProducerObservationFacts {
  return observations({
    availability: "UNAVAILABLE",
    unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
  });
}

function observationsByBatchId(
  producerFacts: BatchProducerObservationFacts,
  batchId = importBatchId,
): ReadonlyMap<string, BatchProducerObservationFacts> {
  return new Map([[batchId, producerFacts]]);
}

function listResult(
  overrides: Partial<ListImportSubmissionsResult> = {},
): ListImportSubmissionsResult {
  return {
    submissions: overrides.submissions ?? [submission()],
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 20,
    total: overrides.total ?? 1,
  };
}

function notFoundResult(): Extract<
  GetImportSubmissionDetailResult,
  { readonly kind: "not_found" }
> {
  return {
    kind: "not_found",
    error: {
      code: "IMPORT_SUBMISSION_NOT_FOUND",
      httpStatus: 404,
      message: "Import submission was not found.",
    },
  };
}

function source(): string {
  return readFileSync(
    resolve(process.cwd(), "src/server/imports/batch-read-service.ts"),
    "utf8",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerEnv.mockReturnValue({
    FEATURE_BATCH_OBSERVATION_ENABLED: true,
  });
  mocks.listImportSubmissions.mockResolvedValue(listResult());
  mocks.getImportSubmissionDetail.mockResolvedValue({
    kind: "found",
    submission: submission(),
  });
  mocks.readProducerBatchObservations.mockResolvedValue(observations());
  mocks.readProducerBatchObservationsByBatchIds.mockResolvedValue(
    observationsByBatchId(observations()),
  );
});

describe("listImportBatches", () => {
  it.each([
    ["missing input", null],
    ["blank organization", { organizationId: "" }],
    ["trimmed organization", { organizationId: " org-synthetic-a" }],
    ["zero page", { organizationId, page: 0 }],
    ["oversized page", { organizationId, page: 10_001 }],
    ["fractional page size", { organizationId, pageSize: 1.5 }],
    ["zero page size", { organizationId, pageSize: 0 }],
  ] as const)(
    "rejects invalid list input before repository work: %s",
    async (_label, input) => {
      await expect(
        listImportBatches(input as unknown as ListImportBatchesInput),
      ).rejects.toBeInstanceOf(BatchReadServiceInputError);

      expect(mocks.listImportSubmissions).not.toHaveBeenCalled();
      expect(
        mocks.readProducerBatchObservationsByBatchIds,
      ).not.toHaveBeenCalled();
    },
  );

  it("returns an empty paginated batch list without producer reads", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [], total: 0 }),
    );

    const result = await listImportBatches({ organizationId });

    expect(result).toEqual({
      batches: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(mocks.listImportSubmissions).toHaveBeenCalledWith({
      organizationId,
      page: undefined,
      pageSize: undefined,
    });
    expect(
      mocks.readProducerBatchObservationsByBatchIds,
    ).not.toHaveBeenCalled();
  });

  it("preserves repository pagination and batch order", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({
        submissions: [
          submission({ submissionId }),
          submission({ submissionId: secondSubmissionId }),
        ],
        page: 2,
        pageSize: 100,
        total: 250,
      }),
    );

    const result = await listImportBatches({
      organizationId,
      page: 2,
      pageSize: 500,
    });

    expect(result).toMatchObject({
      page: 2,
      pageSize: 100,
      total: 250,
    });
    expect(result.batches.map((batch) => batch.submissionId)).toEqual([
      submissionId,
      secondSubmissionId,
    ]);
    expect(mocks.listImportSubmissions).toHaveBeenCalledWith({
      organizationId,
      page: 2,
      pageSize: 500,
    });
  });

  it("maps a submission without acknowledgement as submitted", async () => {
    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      submissionId,
      import_batch_id: null,
      status: "SUBMITTED",
      acceptedAt: null,
      rowCountAccepted: null,
      terminalCount: null,
      statusBasis: "SUBMISSION_RECORDED",
      observationStatus: "AVAILABLE",
      observationBasis: null,
    });
    expect(
      mocks.readProducerBatchObservationsByBatchIds,
    ).not.toHaveBeenCalled();
  });

  it("keeps workflow acknowledgement separate from durable acceptance", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acknowledgedSubmission()] }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(
        observations({
          acceptedRows: acceptedRows([1, 2, 3]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
            terminal(3, "FAILED"),
          ],
          close: close(),
          lastObservedAt: lastObservedAtFact(),
        }),
      ),
    );

    const result = await listImportBatches({ organizationId });

    expect(
      mocks.readProducerBatchObservationsByBatchIds,
    ).toHaveBeenCalledWith({
      import_batch_ids: [importBatchId],
    });
    expect(result.batches[0]).toMatchObject({
      import_batch_id: importBatchId,
      status: "SUBMITTED",
      acceptedAt: null,
      rowCountAccepted: null,
      terminalCount: null,
      statusBasis: "SUBMISSION_RECORDED",
    });
  });

  it("maps durable acceptance with available producer activity", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acceptedSubmission()] }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(
        observations({
          acceptedRows: acceptedRows([1, 2]),
          lastObservedAt: lastObservedAtFact(),
        }),
      ),
    );

    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      status: "PROCESSING",
      acceptedAt: "2026-07-07T12:02:00.000Z",
      rowCountAccepted: 3,
      terminalCount: 0,
      statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
      observationStatus: "AVAILABLE",
    });
  });

  it("preserves durable acceptance when the producer source is unavailable", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acceptedSubmission()] }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(unavailableObservations()),
    );

    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      status: "ACCEPTED",
      rowCountAccepted: 3,
      terminalCount: null,
      blockedCount: null,
      failedCount: null,
      leadCount: null,
      statusBasis: "ACCEPTANCE_CONFIRMED",
      observationStatus: "UNAVAILABLE",
      observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
    });
  });

  it("keeps observation facts unavailable without producer reads when the feature is disabled", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acceptedSubmission()] }),
    );

    const result = await listImportBatches(
      { organizationId },
      { batchObservationEnabled: false },
    );

    expect(
      mocks.readProducerBatchObservationsByBatchIds,
    ).not.toHaveBeenCalled();
    expect(result.batches[0]).toMatchObject({
      status: "ACCEPTED",
      rowCountAccepted: 3,
      lastObservedAt: null,
      terminalCount: null,
      blockedCount: null,
      failedCount: null,
      leadCount: null,
      statusBasis: "ACCEPTANCE_CONFIRMED",
      observationStatus: "UNAVAILABLE",
      observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
    });
  });

  it("fails closed when producer evidence is inconsistent", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({
        submissions: [
          acceptedSubmission({
            durableAcceptance: {
              acceptedAt,
              rowCountAccepted: 1,
            },
          }),
        ],
      }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(
        observations({
          acceptedRows: acceptedRows([1]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "FAILED"),
          ],
          lastObservedAt: lastObservedAtFact(),
        }),
      ),
    );

    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      status: "ACCEPTED",
      terminalCount: null,
      statusBasis: "ACCEPTANCE_CONFIRMED",
      observationStatus: "INCONSISTENT",
      observationBasis: "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE",
    });
  });

  it("does not complete a batch when close is absent", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({
        submissions: [
          acceptedSubmission({
            durableAcceptance: {
              acceptedAt,
              rowCountAccepted: 2,
            },
          }),
        ],
      }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(
        observations({
          acceptedRows: acceptedRows([1, 2]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
          ],
          lastObservedAt: lastObservedAtFact(),
        }),
      ),
    );

    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      status: "PROCESSING",
      terminalCount: 2,
      statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
    });
  });

  it("maps explicit close with all terminal rows as completed", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acceptedSubmission()] }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(
        observations({
          acceptedRows: acceptedRows([1, 2, 3]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
            terminal(3, "FAILED"),
          ],
          close: close(),
          lastObservedAt: lastObservedAtFact(),
        }),
      ),
    );

    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      status: "COMPLETED",
      terminalCount: 3,
      blockedCount: 1,
      failedCount: 1,
      leadCount: 1,
      statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
    });
  });

  it("maps explicit close with missing terminal rows as incomplete", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acceptedSubmission()] }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(
        observations({
          acceptedRows: acceptedRows([1, 2, 3]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
          ],
          close: close(),
          lastObservedAt: lastObservedAtFact(),
        }),
      ),
    );

    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      status: "INCOMPLETE",
      terminalCount: 2,
      statusBasis: "PRODUCER_CLOSED_ROWS_MISSING",
    });
  });

  it("keeps retained legacy observations from proving completion", async () => {
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acceptedSubmission()] }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(
        observations({
          retainedLegacyObservations: [
            {
              factSource: "producer_retained_legacy_observations_v1",
              sourceRow: 7,
              leadRunId: "legacy-run-7",
              observedAt,
            },
          ],
          lastObservedAt: lastObservedAtFact(),
        }),
      ),
    );

    const result = await listImportBatches({ organizationId });

    expect(result.batches[0]).toMatchObject({
      status: "ACCEPTED",
      terminalCount: 0,
      statusBasis: "ACCEPTANCE_CONFIRMED",
      observationStatus: "AVAILABLE",
    });
    expect(result.batches[0]?.status).not.toBe("COMPLETED");
  });

  it("passes named app and producer facts into the mapper", async () => {
    const producerFacts = observations({
      acceptedRows: acceptedRows([1]),
      lastObservedAt: lastObservedAtFact(),
    });
    const mapped: BatchSummary = {
      submissionId,
      import_batch_id: importBatchId,
      status: "PROCESSING",
      submittedAt: "2026-07-07T12:00:00.000Z",
      acceptedAt: "2026-07-07T12:02:00.000Z",
      lastObservedAt: "2026-07-07T12:03:00.000Z",
      rowCountAccepted: 3,
      terminalCount: 0,
      blockedCount: 0,
      failedCount: 0,
      leadCount: 0,
      statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
      observationStatus: "AVAILABLE",
      observationBasis: null,
    };
    const mapBatchStatus = vi.fn(() => mapped);

    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions: [acceptedSubmission()] }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      observationsByBatchId(producerFacts),
    );

    const result = await listImportBatches(
      { organizationId },
      { operations: { mapBatchStatus } },
    );

    expect(result.batches).toEqual([mapped]);
    expect(mapBatchStatus).toHaveBeenCalledWith({
      submission: {
        submissionId,
        submittedAt,
        factSource: "app_submission",
      },
      acknowledgement: {
        import_batch_id: importBatchId,
        acknowledgedAt,
        factSource: "workflow_acknowledgement",
      },
      acceptance: {
        import_batch_id: importBatchId,
        acceptedAt,
        rowCountAccepted: 3,
        factSource: "durable_acceptance",
      },
      producerObservations: producerFacts,
      freshness: null,
    });
  });

  it("reads 100 correlated batches through one producer query", async () => {
    const submissions = Array.from({ length: 100 }, (_, index) => {
      const batchId = `batch-synthetic-${String(index).padStart(3, "0")}`;

      return acceptedSubmission({
        submissionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        workflowAcknowledgement: {
          import_batch_id: batchId,
          row_count: 3,
          acknowledgedAt,
        },
      });
    });
    const batchIds = submissions.map(
      (item) => item.workflowAcknowledgement!.import_batch_id,
    );
    mocks.listImportSubmissions.mockResolvedValueOnce(
      listResult({ submissions, pageSize: 100, total: 100 }),
    );
    mocks.readProducerBatchObservationsByBatchIds.mockResolvedValueOnce(
      new Map(batchIds.map((batchId) => [batchId, observations()])),
    );

    const result = await listImportBatches({
      organizationId,
      pageSize: 100,
    });

    expect(result.batches).toHaveLength(100);
    expect(
      mocks.readProducerBatchObservationsByBatchIds,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.readProducerBatchObservationsByBatchIds,
    ).toHaveBeenCalledWith({
      import_batch_ids: batchIds,
    });
    expect(mocks.readProducerBatchObservations).not.toHaveBeenCalled();
  });
});

describe("getImportBatchDetail", () => {
  it.each([
    ["blank organization", { organizationId: "", submissionId }],
    ["invalid submission id", { organizationId, submissionId: "not-a-uuid" }],
  ] as const)(
    "rejects invalid detail input before repository work: %s",
    async (_label, input) => {
      await expect(
        getImportBatchDetail(input as GetImportBatchDetailInput),
      ).rejects.toBeInstanceOf(BatchReadServiceInputError);

      expect(mocks.getImportSubmissionDetail).not.toHaveBeenCalled();
      expect(mocks.readProducerBatchObservations).not.toHaveBeenCalled();
    },
  );

  it("returns not_found fail-closed without producer reads", async () => {
    mocks.getImportSubmissionDetail.mockResolvedValueOnce(notFoundResult());

    const result = await getImportBatchDetail({
      organizationId,
      submissionId,
    });

    expect(result).toEqual(notFoundResult());
    expect(mocks.getImportSubmissionDetail).toHaveBeenCalledWith({
      organizationId,
      submissionId,
    });
    expect(mocks.readProducerBatchObservations).not.toHaveBeenCalled();
  });

  it("composes a found detail batch through the same evidence mapper", async () => {
    mocks.getImportSubmissionDetail.mockResolvedValueOnce({
      kind: "found",
      submission: acceptedSubmission(),
    });
    mocks.readProducerBatchObservations.mockResolvedValueOnce(
      observations({
        acceptedRows: acceptedRows([1, 2, 3]),
        terminalOutcomes: [
          terminal(1, "MATERIALIZED"),
          terminal(2, "BLOCKED"),
          terminal(3, "FAILED"),
        ],
        close: close(),
        lastObservedAt: lastObservedAtFact(),
      }),
    );

    const result = await getImportBatchDetail({
      organizationId,
      submissionId,
    });

    expect(result).toMatchObject({
      kind: "found",
      batch: {
        submissionId,
        status: "COMPLETED",
        statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
      },
    });
  });

  it("keeps detail observation facts unavailable without producer reads when the feature is disabled", async () => {
    mocks.getImportSubmissionDetail.mockResolvedValueOnce({
      kind: "found",
      submission: acceptedSubmission(),
    });

    const result = await getImportBatchDetail(
      { organizationId, submissionId },
      { batchObservationEnabled: false },
    );

    expect(mocks.readProducerBatchObservations).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "found",
      batch: {
        status: "ACCEPTED",
        rowCountAccepted: 3,
        lastObservedAt: null,
        terminalCount: null,
        blockedCount: null,
        failedCount: null,
        leadCount: null,
        statusBasis: "ACCEPTANCE_CONFIRMED",
        observationStatus: "UNAVAILABLE",
        observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
      },
    });
  });
});

describe("batch read service source boundaries", () => {
  it("does not call n8n, fetch, routes, or browser/UI APIs", () => {
    expect(source()).not.toMatch(
      /n8n|N8N|webhook|fetch\s*\(|NextResponse|NextRequest|React|\.tsx|window\.|document\.|localStorage|navigator\./,
    );
  });

  it("does not access app or producer databases directly", () => {
    expect(source()).not.toMatch(
      /app-client|producer-client|APP_DATABASE_URL|PRODUCER_DATABASE_URL|prospecting_app|public\.prospecta|\b(SELECT|INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i,
    );
  });

  it("uses the T021/T022 repositories and T020 mapper", () => {
    const serviceSource = source();

    expect(serviceSource).toContain("listImportSubmissions");
    expect(serviceSource).toContain("getImportSubmissionDetail");
    expect(serviceSource).toContain("readProducerBatchObservations");
    expect(serviceSource).toContain("mapBatchStatus");
  });
});
