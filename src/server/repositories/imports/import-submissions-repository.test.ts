import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: {
    query: vi.fn(),
  },
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../db/app-client", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

import type {
  AppDatabaseTransaction,
  SqlStatement,
} from "../../db/app-client";
import {
  ImportSubmissionRepositoryInputError,
  getImportSubmissionDetail,
  listImportSubmissions,
  recordImportSubmissionIntent,
  recordProducerAcknowledgement,
  recordProducerOutcomeUnknown,
  type ImportSubmissionReadModel,
  type ImportSubmissionRecord,
  type RecordImportSubmissionIntentInput,
  type ValidatedProducerAcknowledgement,
} from "./import-submissions-repository";

const submittedAt = new Date("2026-07-07T12:00:00.000Z");
const acknowledgedAt = new Date("2026-07-07T12:01:00.000Z");
const organizationId = "org-synthetic-a";
const actorSubject = "oidc|synthetic-manager";
const idempotencyKey = "idem-synthetic-014";
const fileSha256 = "a".repeat(64);
const differentFileSha256 = "b".repeat(64);
const submissionId = "00000000-0000-4000-8000-000000000014";
const importBatchId = "empresaqui_2026-07-07T12:00:00.000Z";
const invalidAcknowledgementScopeInputs: ReadonlyArray<
  readonly [
    string,
    {
      readonly organizationId?: string;
      readonly actorSubject?: string;
      readonly submissionId?: string;
    },
  ]
> = [
  ["blank organization", { organizationId: "" }],
  ["blank actor", { actorSubject: "" }],
  ["blank submission", { submissionId: "" }],
];

function installTransactionMock(): void {
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
}

function baseInput(
  overrides: Partial<RecordImportSubmissionIntentInput> = {},
): RecordImportSubmissionIntentInput {
  return {
    organizationId: overrides.organizationId ?? organizationId,
    actorSubject: overrides.actorSubject ?? actorSubject,
    idempotencyKey: overrides.idempotencyKey ?? idempotencyKey,
    file: overrides.file ?? {
      filename: "empresaqui-sintetica.csv",
      sha256: fileSha256,
      sizeBytes: 128,
      mediaType: "text/csv",
    },
  };
}

function acknowledgement(
  overrides: Partial<ValidatedProducerAcknowledgement> = {},
): ValidatedProducerAcknowledgement {
  return {
    accepted: true,
    message:
      overrides.message ?? "Arquivo recebido para processamento.",
    import_batch_id: overrides.import_batch_id ?? importBatchId,
    row_count: overrides.row_count ?? 2,
    source: overrides.source ?? "EmpresaAqui",
  };
}

function submissionRow(
  overrides: Partial<{
    submission_id: string;
    organization_id: string;
    original_filename: string;
    file_sha256: string;
    file_size_bytes: number | string;
    content_type: string;
    idempotency_key: string;
    app_contract_version: string;
    submitted_at: Date;
    producer_acknowledged_at: Date | null;
    producer_import_batch_id: string | null;
    acknowledged_row_count: number | null;
    status: ImportSubmissionRecord["status"];
    status_fact_source: string;
  }> = {},
) {
  return {
    submission_id: overrides.submission_id ?? submissionId,
    organization_id: overrides.organization_id ?? organizationId,
    original_filename:
      overrides.original_filename ?? "empresaqui-sintetica.csv",
    file_sha256: overrides.file_sha256 ?? fileSha256,
    file_size_bytes: overrides.file_size_bytes ?? 128,
    content_type: overrides.content_type ?? "text/csv",
    idempotency_key: overrides.idempotency_key ?? idempotencyKey,
    app_contract_version:
      overrides.app_contract_version ?? "prospecta-import-v1",
    submitted_at: overrides.submitted_at ?? submittedAt,
    producer_acknowledged_at:
      overrides.producer_acknowledged_at ?? null,
    producer_import_batch_id:
      overrides.producer_import_batch_id ?? null,
    acknowledged_row_count: overrides.acknowledged_row_count ?? null,
    status: overrides.status ?? "SUBMISSION_RECORDED",
    status_fact_source: overrides.status_fact_source ?? "app_submission",
  };
}

function submissionReadRow(
  overrides: Partial<{
    submission_id: string;
    original_filename: string;
    file_size_bytes: number | string;
    content_type: string;
    app_contract_version: string;
    submitted_at: Date;
    producer_acknowledged_at: Date | null;
    producer_import_batch_id: string | null;
    acknowledged_row_count: number | null;
    durable_accepted_at: Date | null;
    durable_accepted_row_count: number | null;
    status: ImportSubmissionReadModel["appStatus"];
    status_fact_source: string;
    last_observed_at: Date | null;
  }> = {},
) {
  return {
    submission_id: overrides.submission_id ?? submissionId,
    original_filename:
      overrides.original_filename ?? "empresaqui-sintetica.csv",
    file_size_bytes: overrides.file_size_bytes ?? 128,
    content_type: overrides.content_type ?? "text/csv",
    app_contract_version:
      overrides.app_contract_version ?? "prospecta-import-v1",
    submitted_at: overrides.submitted_at ?? submittedAt,
    producer_acknowledged_at:
      overrides.producer_acknowledged_at ?? null,
    producer_import_batch_id:
      overrides.producer_import_batch_id ?? null,
    acknowledged_row_count: overrides.acknowledged_row_count ?? null,
    durable_accepted_at: overrides.durable_accepted_at ?? null,
    durable_accepted_row_count:
      overrides.durable_accepted_row_count ?? null,
    status: overrides.status ?? "SUBMISSION_RECORDED",
    status_fact_source: overrides.status_fact_source ?? "app_submission",
    last_observed_at: overrides.last_observed_at ?? null,
  };
}

function statements(): SqlStatement[] {
  return mocks.client.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function readStatements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/repositories/imports/import-submissions-repository.ts",
    ),
    "utf8",
  );
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.query.mockReset();
  mocks.transaction.mockReset();
  installTransactionMock();
});

describe("recordImportSubmissionIntent", () => {
  it("creates a durable app submission intent and append-only event", async () => {
    mocks.client.query
      .mockResolvedValueOnce([submissionRow()])
      .mockResolvedValueOnce([]);

    const result = await recordImportSubmissionIntent(baseInput());

    expect(result).toMatchObject({
      kind: "created",
      submission: {
        submissionId,
        organizationId,
        idempotencyKey,
        fileSha256,
        originalFilename: "empresaqui-sintetica.csv",
        sizeBytes: 128,
        mediaType: "text/csv",
        status: "SUBMISSION_RECORDED",
        statusFactSource: "app_submission",
        producerAcknowledgement: null,
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
    expect(statements()[0]?.text).toMatch(
      /INSERT INTO prospecting_app\.import_submissions/i,
    );
    expect(statements()[1]?.text).toMatch(
      /INSERT INTO prospecting_app\.import_submission_events/i,
    );
  });

  it("uses verified organization and actor arguments in the stored intent", async () => {
    mocks.client.query
      .mockResolvedValueOnce([submissionRow()])
      .mockResolvedValueOnce([]);

    await recordImportSubmissionIntent(baseInput());

    const [insertSubmission, insertEvent] = statements();
    expect(insertSubmission?.values).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      organizationId,
      actorSubject,
      "empresaqui-sintetica.csv",
      fileSha256,
      128,
      "text/csv",
      idempotencyKey,
      "prospecta-import-v1",
    ]);
    expect(insertEvent?.values).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      organizationId,
      submissionId,
      actorSubject,
      "SUBMISSION_RECORDED",
      {
        source: "app",
        status: "SUBMISSION_RECORDED",
      },
    ]);
  });

  it("returns the original record for same organization, idempotency key, and file hash", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([submissionRow()]);

    const result = await recordImportSubmissionIntent(baseInput());

    expect(result).toMatchObject({
      kind: "duplicate",
      submission: {
        submissionId,
        fileSha256,
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
    expect(statements()[1]?.text).toMatch(
      /WHERE organization_id = \$1\s+AND idempotency_key = \$2/i,
    );
    expect(statements()[1]?.values).toEqual([
      organizationId,
      idempotencyKey,
    ]);
  });

  it("returns a safe 409-mappable conflict for same organization and key with a different hash", async () => {
    mocks.client.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        submissionRow({ file_sha256: differentFileSha256 }),
      ]);

    const result = await recordImportSubmissionIntent(baseInput());

    expect(result).toEqual({
      kind: "conflict",
      error: {
        code: "IMPORT_IDEMPOTENCY_CONFLICT",
        httpStatus: 409,
        message: "Submission conflicts with an earlier file.",
      },
    });
    expect(JSON.stringify(result)).not.toContain(fileSha256);
    expect(JSON.stringify(result)).not.toContain(differentFileSha256);
    expect(JSON.stringify(result)).not.toMatch(/SELECT|INSERT|\$1/i);
  });

  it("does not conflict when the same idempotency key is used by another organization", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({ organization_id: "org-synthetic-b" }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordImportSubmissionIntent(
      baseInput({ organizationId: "org-synthetic-b" }),
    );

    expect(result).toMatchObject({
      kind: "created",
      submission: {
        organizationId: "org-synthetic-b",
        idempotencyKey,
      },
    });
    expect(statements()[0]?.values).toContain("org-synthetic-b");
  });

  it("preserves validated file metadata without accepting raw CSV bytes", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          original_filename: "EMPRESAS-SINTETICAS.CSV",
          file_size_bytes: "256",
          content_type: "application/vnd.ms-excel",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordImportSubmissionIntent(
      baseInput({
        file: {
          filename: "EMPRESAS-SINTETICAS.CSV",
          sha256: fileSha256,
          sizeBytes: 256,
          mediaType: "application/vnd.ms-excel",
        },
      }),
    );

    expect(result).toMatchObject({
      kind: "created",
      submission: {
        originalFilename: "EMPRESAS-SINTETICAS.CSV",
        fileSha256,
        sizeBytes: 256,
        mediaType: "application/vnd.ms-excel",
      },
    });
    expect(statements()[0]?.values).not.toContain(
      "CNPJ;Razao\n00000000000000;Empresa Sintetica",
    );
  });

  it.each([
    ["empty organization", { organizationId: "" }],
    ["blank actor", { actorSubject: " " }],
    ["blank idempotency key", { idempotencyKey: "" }],
  ] as const)("rejects %s before database work", async (_label, overrides) => {
    await expect(
      recordImportSubmissionIntent(baseInput(overrides)),
    ).rejects.toBeInstanceOf(ImportSubmissionRepositoryInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      "invalid hash",
      {
        sha256: "not-a-hash",
        filename: "empresaqui-sintetica.csv",
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    ],
    [
      "unsafe filename",
      {
        sha256: fileSha256,
        filename: "../empresaqui.csv",
        sizeBytes: 128,
        mediaType: "text/csv",
      },
    ],
    [
      "unsupported media type",
      {
        sha256: fileSha256,
        filename: "empresaqui.csv",
        sizeBytes: 128,
        mediaType: "application/json",
      },
    ],
    [
      "invalid size",
      {
        sha256: fileSha256,
        filename: "empresaqui.csv",
        sizeBytes: 0,
        mediaType: "text/csv",
      },
    ],
  ] as const)("rejects %s before database work", async (_label, file) => {
    await expect(
      recordImportSubmissionIntent(baseInput({ file })),
    ).rejects.toBeInstanceOf(ImportSubmissionRepositoryInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("recordProducerAcknowledgement", () => {
  it("persists the validated producer acknowledgement with import_batch_id", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          producer_acknowledged_at: acknowledgedAt,
          producer_import_batch_id: importBatchId,
          acknowledged_row_count: 2,
          status: "PRODUCER_ACKNOWLEDGED",
          status_fact_source: "workflow_acknowledgement",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordProducerAcknowledgement({
      organizationId,
      actorSubject,
      submissionId,
      acknowledgement: acknowledgement(),
    });

    expect(result).toMatchObject({
      kind: "recorded",
      submission: {
        status: "PRODUCER_ACKNOWLEDGED",
        statusFactSource: "workflow_acknowledgement",
        producerAcknowledgement: {
          import_batch_id: importBatchId,
          row_count: 2,
          producerAcknowledgedAt: acknowledgedAt,
        },
      },
    });
    expect(statements()[0]?.text).toMatch(
      /producer_import_batch_id = \$3/i,
    );
    expect(statements()[0]?.values).toEqual([
      organizationId,
      submissionId,
      importBatchId,
      2,
    ]);
  });

  it("keeps the original import_batch_id field name in public and event facts", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          producer_acknowledged_at: acknowledgedAt,
          producer_import_batch_id: importBatchId,
          acknowledged_row_count: 2,
          status: "PRODUCER_ACKNOWLEDGED",
          status_fact_source: "workflow_acknowledgement",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordProducerAcknowledgement({
      organizationId,
      actorSubject,
      submissionId,
      acknowledgement: acknowledgement(),
    });

    const eventMetadata = statements()[1]?.values[5];
    expect(result).toMatchObject({
      kind: "recorded",
      submission: {
        producerAcknowledgement: {
          import_batch_id: importBatchId,
        },
      },
    });
    expect(eventMetadata).toMatchObject({
      import_batch_id: importBatchId,
    });
    expect(JSON.stringify(result)).not.toMatch(/producerBatchId/i);
    expect(JSON.stringify(eventMetadata)).not.toMatch(/producerBatchId/i);
  });

  it("stores row_count as an observed acknowledgement fact without accepted-row relabeling", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          producer_acknowledged_at: acknowledgedAt,
          producer_import_batch_id: importBatchId,
          acknowledged_row_count: 7,
          status: "PRODUCER_ACKNOWLEDGED",
          status_fact_source: "workflow_acknowledgement",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordProducerAcknowledgement({
      organizationId,
      actorSubject,
      submissionId,
      acknowledgement: acknowledgement({ row_count: 7 }),
    });

    expect(result).toMatchObject({
      kind: "recorded",
      submission: {
        producerAcknowledgement: {
          row_count: 7,
        },
      },
    });
    expect(statements()[1]?.values[5]).toMatchObject({
      row_count: 7,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /rowCountAccepted|acceptedAt|ACCEPTED/,
    );
  });

  it("does not create a final producer state from acknowledgement alone", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          producer_acknowledged_at: acknowledgedAt,
          producer_import_batch_id: importBatchId,
          acknowledged_row_count: 2,
          status: "PRODUCER_ACKNOWLEDGED",
          status_fact_source: "workflow_acknowledgement",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordProducerAcknowledgement({
      organizationId,
      actorSubject,
      submissionId,
      acknowledgement: acknowledgement(),
    });

    expect(result).toMatchObject({
      kind: "recorded",
      submission: {
        status: "PRODUCER_ACKNOWLEDGED",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /DURABLE_ACCEPTED|COMPLETED|PROCESSING|acceptedAt|durableAcceptance/i,
    );
  });

  it("returns a safe not-found result for a cross-organization or missing submission", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    const result = await recordProducerAcknowledgement({
      organizationId: "org-synthetic-b",
      actorSubject,
      submissionId,
      acknowledgement: acknowledgement(),
    });

    expect(result).toEqual({
      kind: "not_found",
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        httpStatus: 404,
        message: "Import submission was not found.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("does not expose the raw producer body or acknowledgement message in the public result", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          producer_acknowledged_at: acknowledgedAt,
          producer_import_batch_id: importBatchId,
          acknowledged_row_count: 2,
          status: "PRODUCER_ACKNOWLEDGED",
          status_fact_source: "workflow_acknowledgement",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordProducerAcknowledgement({
      organizationId,
      actorSubject,
      submissionId,
      acknowledgement: acknowledgement({
        message: "private producer body must not be retained",
      }),
    });

    expect(JSON.stringify(result)).not.toContain(
      "private producer body must not be retained",
    );
    expect(statements()[1]?.values[5]).not.toMatchObject({
      message: expect.any(String),
    });
  });

  it.each(invalidAcknowledgementScopeInputs)(
    "rejects %s before database work",
    async (_label, overrides) => {
      await expect(
        recordProducerAcknowledgement({
          organizationId: overrides.organizationId ?? organizationId,
          actorSubject: overrides.actorSubject ?? actorSubject,
          submissionId: overrides.submissionId ?? submissionId,
          acknowledgement: acknowledgement(),
        }),
      ).rejects.toBeInstanceOf(ImportSubmissionRepositoryInputError);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid acknowledgement values before database work", async () => {
    await expect(
      recordProducerAcknowledgement({
        organizationId,
        actorSubject,
        submissionId,
        acknowledgement: {
          ...acknowledgement(),
          row_count: -1,
        },
      }),
    ).rejects.toBeInstanceOf(ImportSubmissionRepositoryInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("recordProducerOutcomeUnknown", () => {
  it("persists an honest acceptance-unknown outcome with an append-only event", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          status: "ACCEPTANCE_UNKNOWN",
          status_fact_source: "ingress_unknown",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordProducerOutcomeUnknown({
      organizationId,
      actorSubject,
      submissionId,
    });

    expect(result).toMatchObject({
      kind: "recorded",
      submission: {
        status: "ACCEPTANCE_UNKNOWN",
        statusFactSource: "ingress_unknown",
        producerAcknowledgement: null,
      },
    });
    expect(statements()[0]?.text).toMatch(
      /status = 'ACCEPTANCE_UNKNOWN'/i,
    );
    expect(statements()[0]?.text).toMatch(
      /producer_acknowledged_at IS NULL/i,
    );
    expect(statements()[0]?.values).toEqual([
      organizationId,
      submissionId,
    ]);
    expect(statements()[1]?.values).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      organizationId,
      submissionId,
      actorSubject,
      "ACCEPTANCE_UNKNOWN",
      {
        source: "app",
        reason_code: "INGRESS_UNKNOWN",
        status: "ACCEPTANCE_UNKNOWN",
      },
    ]);
  });

  it("does not invent acknowledgement or durable acceptance fields for unknown outcomes", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        submissionRow({
          status: "ACCEPTANCE_UNKNOWN",
          status_fact_source: "ingress_unknown",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await recordProducerOutcomeUnknown({
      organizationId,
      actorSubject,
      submissionId,
    });

    expect(result).toMatchObject({
      kind: "recorded",
      submission: {
        producerAcknowledgement: null,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /import_batch_id|row_count|ACCEPTED|DURABLE_ACCEPTED|COMPLETED|PROCESSING/i,
    );
  });

  it("returns a safe not-found result for missing, cross-organization, or already acknowledged submissions", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    const result = await recordProducerOutcomeUnknown({
      organizationId: "org-synthetic-b",
      actorSubject,
      submissionId,
    });

    expect(result).toEqual({
      kind: "not_found",
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        httpStatus: 404,
        message: "Import submission was not found.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it.each(invalidAcknowledgementScopeInputs)(
    "rejects %s before database work",
    async (_label, overrides) => {
      await expect(
        recordProducerOutcomeUnknown({
          organizationId: overrides.organizationId ?? organizationId,
          actorSubject: overrides.actorSubject ?? actorSubject,
          submissionId: overrides.submissionId ?? submissionId,
        }),
      ).rejects.toBeInstanceOf(ImportSubmissionRepositoryInputError);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
});

describe("listImportSubmissions", () => {
  it("returns an empty paginated list with an exact app-owned total", async () => {
    mocks.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    const result = await listImportSubmissions({ organizationId });

    expect(result).toEqual({
      submissions: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(readStatements()[0]?.text).toMatch(
      /FROM prospecting_app\.import_submissions/i,
    );
    expect(readStatements()[0]?.values).toEqual([organizationId]);
  });

  it("bounds page size and applies server-side offset", async () => {
    mocks.query.mockResolvedValueOnce([{ total: 150 }]).mockResolvedValueOnce([]);

    const result = await listImportSubmissions({
      organizationId,
      page: 2,
      pageSize: 500,
    });

    expect(result).toMatchObject({
      page: 2,
      pageSize: 100,
      total: 150,
    });
    expect(readStatements()[1]?.values).toEqual([
      organizationId,
      100,
      100,
    ]);
  });

  it("uses stable newest-first ordering with submission id tie-breaker", async () => {
    mocks.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await listImportSubmissions({ organizationId });

    expect(readStatements()[1]?.text).toMatch(
      /ORDER BY submitted_at DESC, submission_id DESC/i,
    );
    expect(readStatements()[1]?.text).toMatch(/LIMIT \$2/i);
    expect(readStatements()[1]?.text).toMatch(/OFFSET \$3/i);
  });

  it("maps acknowledgement and nullable durable acceptance without public replay fields", async () => {
    mocks.query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([
      submissionReadRow({
        producer_acknowledged_at: acknowledgedAt,
        producer_import_batch_id: importBatchId,
        acknowledged_row_count: 3,
        status: "PRODUCER_ACKNOWLEDGED",
        status_fact_source: "workflow_acknowledgement",
        last_observed_at: acknowledgedAt,
      }),
    ]);

    const result = await listImportSubmissions({ organizationId });

    expect(result.submissions).toEqual([
      {
        submissionId,
        originalFilename: "empresaqui-sintetica.csv",
        sizeBytes: 128,
        mediaType: "text/csv",
        appContractVersion: "prospecta-import-v1",
        appStatus: "PRODUCER_ACKNOWLEDGED",
        statusFactSource: "workflow_acknowledgement",
        submittedAt,
        lastObservedAt: acknowledgedAt,
        workflowAcknowledgement: {
          import_batch_id: importBatchId,
          row_count: 3,
          acknowledgedAt,
        },
        durableAcceptance: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(idempotencyKey);
    expect(JSON.stringify(result)).not.toContain(fileSha256);
  });

  it("keeps acknowledgement separate from durable acceptance when both facts exist", async () => {
    const durableAcceptedAt = new Date("2026-07-07T12:02:00.000Z");
    mocks.query.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([
      submissionReadRow({
        producer_acknowledged_at: acknowledgedAt,
        producer_import_batch_id: importBatchId,
        acknowledged_row_count: 5,
        durable_accepted_at: durableAcceptedAt,
        durable_accepted_row_count: 4,
        status: "DURABLE_ACCEPTED",
        status_fact_source: "durable_acceptance",
      }),
    ]);

    const result = await listImportSubmissions({ organizationId });

    expect(result.submissions[0]).toMatchObject({
      workflowAcknowledgement: {
        import_batch_id: importBatchId,
        row_count: 5,
      },
      durableAcceptance: {
        acceptedAt: durableAcceptedAt,
        rowCountAccepted: 4,
      },
    });
    expect(result.submissions[0]?.workflowAcknowledgement?.row_count).not.toBe(
      result.submissions[0]?.durableAcceptance?.rowCountAccepted,
    );
  });

  it("scopes list reads by organization only from repository input", async () => {
    mocks.query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await listImportSubmissions({ organizationId: "org-synthetic-b" });

    expect(readStatements()[0]?.text).toMatch(
      /WHERE organization_id = \$1/i,
    );
    expect(readStatements()[1]?.text).toMatch(
      /WHERE organization_id = \$1/i,
    );
    expect(readStatements()[0]?.values).toEqual(["org-synthetic-b"]);
    expect(readStatements()[1]?.values).toEqual([
      "org-synthetic-b",
      20,
      0,
    ]);
  });

  it.each([
    ["blank organization", { organizationId: "" }],
    ["zero page", { organizationId, page: 0 }],
    ["oversized page", { organizationId, page: 10_001 }],
    ["fractional page size", { organizationId, pageSize: 1.5 }],
    ["zero page size", { organizationId, pageSize: 0 }],
  ] as const)("rejects invalid list input: %s", async (_label, input) => {
    await expect(listImportSubmissions(input)).rejects.toBeInstanceOf(
      ImportSubmissionRepositoryInputError,
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("getImportSubmissionDetail", () => {
  it("returns a detail record for the scoped organization and submission id", async () => {
    mocks.query.mockResolvedValueOnce([submissionReadRow()]);

    const result = await getImportSubmissionDetail({
      organizationId,
      submissionId,
    });

    expect(result).toEqual({
      kind: "found",
      submission: {
        submissionId,
        originalFilename: "empresaqui-sintetica.csv",
        sizeBytes: 128,
        mediaType: "text/csv",
        appContractVersion: "prospecta-import-v1",
        appStatus: "SUBMISSION_RECORDED",
        statusFactSource: "app_submission",
        submittedAt,
        lastObservedAt: null,
        workflowAcknowledgement: null,
        durableAcceptance: null,
      },
    });
    expect(readStatements()[0]?.values).toEqual([
      organizationId,
      submissionId,
    ]);
  });

  it("returns safe not_found for a missing submission", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await getImportSubmissionDetail({
      organizationId,
      submissionId,
    });

    expect(result).toEqual({
      kind: "not_found",
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        httpStatus: 404,
        message: "Import submission was not found.",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/SELECT|prospecting_app|\$1/i);
  });

  it("fails closed for cross-organization detail lookups", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await getImportSubmissionDetail({
      organizationId: "org-synthetic-b",
      submissionId,
    });

    expect(result).toMatchObject({
      kind: "not_found",
    });
    expect(readStatements()[0]?.text).toMatch(
      /WHERE organization_id = \$1\s+AND submission_id = \$2/i,
    );
    expect(readStatements()[0]?.values).toEqual([
      "org-synthetic-b",
      submissionId,
    ]);
  });

  it("keeps an observed acknowledgement nullable and non-acceptance", async () => {
    mocks.query.mockResolvedValueOnce([
      submissionReadRow({
        producer_acknowledged_at: acknowledgedAt,
        producer_import_batch_id: importBatchId,
        acknowledged_row_count: 2,
        status: "PRODUCER_ACKNOWLEDGED",
        status_fact_source: "workflow_acknowledgement",
      }),
    ]);

    const result = await getImportSubmissionDetail({
      organizationId,
      submissionId,
    });

    expect(result).toMatchObject({
      kind: "found",
      submission: {
        workflowAcknowledgement: {
          import_batch_id: importBatchId,
          row_count: 2,
          acknowledgedAt,
        },
        durableAcceptance: null,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /rowCountAccepted|acceptedAt|COMPLETED|PROCESSING/i,
    );
  });

  it("does not select or expose file hash and idempotency key in public read queries", async () => {
    mocks.query.mockResolvedValueOnce([submissionReadRow()]);

    const result = await getImportSubmissionDetail({
      organizationId,
      submissionId,
    });
    const statement = readStatements()[0];

    expect(JSON.stringify(result)).not.toContain(fileSha256);
    expect(JSON.stringify(result)).not.toContain(idempotencyKey);
    expect(statement?.text).not.toMatch(/file_sha256|idempotency_key/i);
  });

  it.each([
    ["blank organization", { organizationId: "", submissionId }],
    ["invalid submission id", { organizationId, submissionId: "not-a-uuid" }],
  ] as const)("rejects invalid detail input: %s", async (_label, input) => {
    await expect(getImportSubmissionDetail(input)).rejects.toBeInstanceOf(
      ImportSubmissionRepositoryInputError,
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("import submission repository source boundaries", () => {
  it("uses only the app-owned database client and never the producer connection", () => {
    expect(source()).toContain("../../db/app-client");
    expect(source()).not.toMatch(
      /producer-client|PRODUCER_DATABASE_URL|prospecta-producer-read/i,
    );
  });

  it("uses parameterized queries without embedding caller-controlled values", async () => {
    mocks.client.query
      .mockResolvedValueOnce([submissionRow()])
      .mockResolvedValueOnce([]);

    await recordImportSubmissionIntent(baseInput());

    for (const statement of statements()) {
      expect(statement).toEqual({
        text: expect.any(String),
        values: expect.any(Array),
      });
      expect(statement.text).not.toContain(organizationId);
      expect(statement.text).not.toContain(actorSubject);
      expect(statement.text).not.toContain(idempotencyKey);
      expect(statement.text).not.toContain(fileSha256);
    }
  });

  it("keeps import events append-only by inserting events only", () => {
    const repositorySource = source();
    const eventReferences = repositorySource.match(
      /prospecting_app\.import_submission_events/g,
    );

    expect(eventReferences?.length).toBeGreaterThan(0);
    expect(repositorySource).not.toMatch(
      /(UPDATE|DELETE)\s+prospecting_app\.import_submission_events/i,
    );
  });

  it("contains no raw CSV, logging, retry, reprocess, fetch, or n8n call path", () => {
    expect(source()).not.toMatch(
      /csv_bytes|raw_csv|rawProducer|console\.|retry|reprocess|fetch\(|N8N|webhook/i,
    );
  });
});
