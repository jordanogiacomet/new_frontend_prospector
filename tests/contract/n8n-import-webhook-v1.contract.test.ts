import { resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  exactSizeCsv,
  hashFile,
  isSafeClientFailure,
  MAX_UPLOAD_BYTES,
  newUploadIdentity,
  parseAcceptance,
  ReadOnlyProducerEvidence,
  readInspectionEvidence,
  responseSummary,
  sendGet,
  sendVersionedUpload,
  sha256,
  syntheticCsv,
  VERSIONED_PATHS,
  type ContractResponse,
  type UploadIdentity,
  type VersionedAcceptance,
} from "./n8n-versioned-contract-helpers";

const targetValue = process.env.N8N_VERSIONED_CONTRACT_URL;
const remoteRequired =
  process.env.N8N_VERSIONED_CONTRACT_REQUIRED === "true";
const target = targetValue ? new URL(targetValue) : null;
const describeRemote =
  target || remoteRequired ? describe.sequential : describe.skip;
const workflowPath = resolve(
  process.cwd(),
  "integrations/n8n/prospecting-import-v1/workflow.json",
);

type AcceptanceEvidenceRow = {
  readonly accepted_at: Date | string;
  readonly accepted_row_count: number;
  readonly import_batch_id: string;
  readonly submission_id: string;
  readonly uploaded_file_sha256: string;
};

type ObservationEvidenceRow = {
  readonly closed_at: Date | string | null;
  readonly fact_type: string;
  readonly lead_run_id: string | null;
  readonly producer_result: string | null;
  readonly source_row: number | null;
};

let producer: ReadOnlyProducerEvidence | null = null;
let validCall:
  | Promise<{
      acceptance: VersionedAcceptance;
      bytes: Uint8Array;
      identity: UploadIdentity;
      response: ContractResponse;
    }>
  | undefined;

function requireTarget(): URL {
  expect(
    target,
    "Set N8N_VERSIONED_CONTRACT_URL to the authorized versioned non-production endpoint",
  ).not.toBeNull();
  return target as URL;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  expect(value, `Missing required remote contract setting: ${name}`).toBeTruthy();
  return value as string;
}

function producerEvidence(): ReadOnlyProducerEvidence {
  if (producer === null) {
    producer = new ReadOnlyProducerEvidence(
      requireEnvironment("N8N_VERSIONED_CONTRACT_PRODUCER_DATABASE_URL"),
    );
  }

  return producer;
}

async function validAcceptance(): Promise<{
  acceptance: VersionedAcceptance;
  bytes: Uint8Array;
  identity: UploadIdentity;
  response: ContractResponse;
}> {
  if (!validCall) {
    const bytes = syntheticCsv(2);
    const identity = newUploadIdentity(bytes);
    validCall = (async () => {
      const response = await sendVersionedUpload(requireTarget(), {
        bytes,
        identity,
      });

      expect(response.status, responseSummary(response)).toBe(202);
      return {
        acceptance: parseAcceptance(response),
        bytes,
        identity,
        response,
      };
    })();
  }

  return validCall;
}

async function readAcceptance(
  submissionId: string,
): Promise<readonly AcceptanceEvidenceRow[]> {
  return producerEvidence().query<AcceptanceEvidenceRow>(
    `
      SELECT
        submission_id,
        import_batch_id,
        uploaded_file_sha256,
        accepted_row_count,
        accepted_at
      FROM public.prospecta_import_acceptances_v1
      WHERE submission_id = $1
    `,
    [submissionId],
  );
}

async function readObservations(
  importBatchId: string,
): Promise<readonly ObservationEvidenceRow[]> {
  return producerEvidence().query<ObservationEvidenceRow>(
    `
      SELECT
        fact_type,
        source_row,
        lead_run_id,
        producer_result,
        closed_at
      FROM public.prospecta_import_batch_observations_v1
      WHERE import_batch_id = $1
      ORDER BY fact_type, source_row NULLS LAST
    `,
    [importBatchId],
  );
}

async function waitForClosedObservations(
  importBatchId: string,
  expectedRows: number,
): Promise<readonly ObservationEvidenceRow[]> {
  const deadline = Date.now() + 30_000;
  let observations: readonly ObservationEvidenceRow[] = [];

  do {
    observations = await readObservations(importBatchId);
    const acceptedRows = observations.filter(
      (row) => row.fact_type === "ACCEPTED_ROW",
    );
    const terminals = observations.filter(
      (row) => row.fact_type === "TERMINAL_OUTCOME",
    );
    const closed = observations.some((row) => row.fact_type === "BATCH_CLOSED");

    if (
      acceptedRows.length === expectedRows &&
      terminals.length === expectedRows &&
      closed
    ) {
      return observations;
    }

    await new Promise<void>((resolveWait) => {
      setTimeout(resolveWait, 500);
    });
  } while (Date.now() < deadline);

  return observations;
}

afterAll(async () => {
  if (producer !== null) {
    await producer.close();
  }
});

describeRemote("versioned Prospecta n8n ingress remote contract", () => {
  it("requires the separate HTTPS v1 endpoint and no URL credentials", () => {
    const url = requireTarget();

    expect(url.protocol).toBe("https:");
    expect(VERSIONED_PATHS).toContain(url.pathname);
    expect(!url.username && !url.password && !url.search && !url.hash).toBe(
      true,
    );
  });

  it("binds authorized remote inspection to the exact local artifact", () => {
    const evidence = readInspectionEvidence(
      requireEnvironment("N8N_VERSIONED_CONTRACT_INSPECTION_FILE"),
    );
    const inspectedAt = new Date(evidence.inspected_at);

    expect(evidence.target_url).toBe(requireTarget().href);
    expect(evidence.webhook_path).toBe(
      requireTarget().pathname.replace(/^\/(?:webhook|webhook-test)\//, ""),
    );
    expect(evidence.active).toBe(true);
    expect(evidence.workflow_id).toMatch(/^[A-Za-z0-9_-]{3,128}$/);
    expect(evidence.version_id).toMatch(/^[A-Za-z0-9_-]{3,128}$/);
    expect(evidence.artifact_sha256).toBe(hashFile(workflowPath));
    expect(Number.isNaN(inspectedAt.getTime())).toBe(false);
  });

  it("uses a producer evidence connection without mutation privileges", async () => {
    const rows = await producerEvidence().query<{
      readonly can_delete: boolean;
      readonly can_insert: boolean;
      readonly can_update: boolean;
    }>(
      `
        SELECT
          has_table_privilege(
            current_user,
            'public.prospecta_import_acceptances',
            'INSERT'
          ) AS can_insert,
          has_table_privilege(
            current_user,
            'public.prospecta_import_acceptances',
            'UPDATE'
          ) AS can_update,
          has_table_privilege(
            current_user,
            'public.prospecta_import_acceptances',
            'DELETE'
          ) AS can_delete
      `,
      [],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      can_delete: false,
      can_insert: false,
      can_update: false,
    });
  });

  it("rejects GET safely on the POST-only endpoint", async () => {
    const response = await sendGet(requireTarget());

    expect(
      response.status === 404 ||
        response.status === 405 ||
        isSafeClientFailure(response),
      responseSummary(response),
    ).toBe(true);
  });

  it.each([
    ["submission_id"],
    ["idempotency_key"],
    ["file_sha256"],
    ["contract_version"],
  ] as const)("rejects a request missing %s safely", async (field) => {
    const response = await sendVersionedUpload(requireTarget(), {
      bytes: syntheticCsv(),
      omitFields: new Set([field]),
    });

    expect(isSafeClientFailure(response), responseSummary(response)).toBe(true);
  });

  it("rejects the wrong binary field safely", async () => {
    const response = await sendVersionedUpload(requireTarget(), {
      bytes: syntheticCsv(),
      fieldName: "arquivo",
    });

    expect(isSafeClientFailure(response), responseSummary(response)).toBe(true);
  });

  it("rejects a declared hash different from the exact bytes", async () => {
    const response = await sendVersionedUpload(requireTarget(), {
      bytes: syntheticCsv(),
      declaredSha256: "0".repeat(64),
    });

    expect(isSafeClientFailure(response), responseSummary(response)).toBe(true);
  });

  it("rejects an unsupported contract version safely", async () => {
    const response = await sendVersionedUpload(requireTarget(), {
      bytes: syntheticCsv(),
      contractVersion: "prospecta-import-v2",
    });

    expect(isSafeClientFailure(response), responseSummary(response)).toBe(true);
  });

  it.each([
    ["empty", new Uint8Array()],
    ["header-only", new TextEncoder().encode("CNPJ;Razão\n")],
    [
      "invalid UTF-8",
      new Uint8Array([
        0x43, 0x4e, 0x50, 0x4a, 0x3b, 0x52, 0x61, 0x7a, 0x61, 0x6f, 0x0a,
        0xff, 0xfe, 0x0a,
      ]),
    ],
  ] as const)("rejects a %s file safely", async (_caseName, bytes) => {
    const response = await sendVersionedUpload(requireTarget(), { bytes });

    expect(isSafeClientFailure(response), responseSummary(response)).toBe(true);
  });

  it(
    "accepts an exact 10 MiB synthetic CSV with a stable durable result",
    { timeout: 90_000 },
    async () => {
      const bytes = exactSizeCsv(MAX_UPLOAD_BYTES);
      const response = await sendVersionedUpload(requireTarget(), {
        bytes,
        timeoutMs: 80_000,
      });

      expect(response.status, responseSummary(response)).toBe(202);
      expect(parseAcceptance(response).row_count).toBe(1);
    },
  );

  it(
    "rejects a synthetic CSV one byte above 10 MiB safely",
    { timeout: 90_000 },
    async () => {
      const response = await sendVersionedUpload(requireTarget(), {
        bytes: exactSizeCsv(MAX_UPLOAD_BYTES + 1),
        timeoutMs: 80_000,
      });

      expect(
        isSafeClientFailure(response),
        responseSummary(response),
      ).toBe(true);
    },
  );

  it("returns the exact canonical durable-acceptance response", async () => {
    const { acceptance, response } = await validAcceptance();

    expect(response.contentType).toMatch(/^application\/json\b/i);
    expect(acceptance).toEqual({
      accepted: true,
      import_batch_id: expect.stringMatching(/^ib_[0-9a-f]{64}$/),
      message: "Lote aceito para processamento.",
      row_count: 2,
      source: "EmpresaAqui",
    });
  });

  it("proves the 202 follows matching durable producer acceptance", async () => {
    const { acceptance, identity, response } = await validAcceptance();
    const rows = await readAcceptance(identity.submissionId);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.submission_id).toBe(identity.submissionId);
    expect(rows[0]?.import_batch_id).toBe(acceptance.import_batch_id);
    expect(rows[0]?.uploaded_file_sha256).toBe(identity.fileSha256);
    expect(rows[0]?.accepted_row_count).toBe(acceptance.row_count);
    expect(new Date(rows[0]?.accepted_at ?? "").getTime()).toBeLessThanOrEqual(
      response.receivedAt.getTime(),
    );
  });

  it("replays the same submission without creating a different batch", async () => {
    const { acceptance, bytes, identity } = await validAcceptance();
    const replay = await sendVersionedUpload(requireTarget(), {
      bytes,
      identity,
    });

    expect(replay.status, responseSummary(replay)).toBe(202);
    expect(parseAcceptance(replay)).toEqual(acceptance);
    expect(await readAcceptance(identity.submissionId)).toHaveLength(1);
  });

  it("rejects a conflicting hash for the same submission with 409", async () => {
    const { identity } = await validAcceptance();
    const conflictBytes = syntheticCsv(1);
    const response = await sendVersionedUpload(requireTarget(), {
      bytes: conflictBytes,
      identity: {
        ...identity,
        fileSha256: sha256(conflictBytes),
      },
    });

    expect(response.status, responseSummary(response)).toBe(409);
    expect(isSafeClientFailure(response), responseSummary(response)).toBe(true);
    expect(await readAcceptance(identity.submissionId)).toHaveLength(1);
  });

  it(
    "proves accepted rows, one terminal per row, and explicit close through X4",
    { timeout: 45_000 },
    async () => {
      const { acceptance } = await validAcceptance();
      const observations = await waitForClosedObservations(
        acceptance.import_batch_id,
        acceptance.row_count,
      );
      const acceptedRows = observations.filter(
        (row) => row.fact_type === "ACCEPTED_ROW",
      );
      const terminals = observations.filter(
        (row) => row.fact_type === "TERMINAL_OUTCOME",
      );
      const closeRows = observations.filter(
        (row) => row.fact_type === "BATCH_CLOSED",
      );
      const sourceRows = terminals.map((row) => row.source_row);

      expect(acceptedRows).toHaveLength(acceptance.row_count);
      expect(terminals).toHaveLength(acceptance.row_count);
      expect(new Set(sourceRows).size).toBe(acceptance.row_count);
      expect(
        terminals.every((row) =>
          [
            "CRM_REJECTED",
            "LEAD_DECISION_SAVED",
            "PRE_VALIDATION_BLOCKED",
            "PROCESSING_FAILED",
          ].includes(row.producer_result ?? ""),
        ),
      ).toBe(true);
      expect(closeRows).toHaveLength(1);
      expect(closeRows[0]?.closed_at).not.toBeNull();
    },
  );

  it("keeps a timed-out upload reconcilable without a second upload", async () => {
    const bytes = syntheticCsv(1);
    const identity = newUploadIdentity(bytes);
    let response: ContractResponse | null = null;

    try {
      response = await sendVersionedUpload(requireTarget(), {
        bytes,
        identity,
        timeoutMs: 1,
      });
    } catch {
      response = null;
    }

    if (response !== null) {
      expect(response.status, responseSummary(response)).toBe(202);
    }

    const deadline = Date.now() + 10_000;
    let evidence = await readAcceptance(identity.submissionId);
    while (evidence.length === 0 && Date.now() < deadline) {
      await new Promise<void>((resolveWait) => {
        setTimeout(resolveWait, 250);
      });
      evidence = await readAcceptance(identity.submissionId);
    }

    expect(evidence.length === 0 || evidence.length === 1).toBe(true);
    if (evidence.length === 1) {
      expect(evidence[0]?.uploaded_file_sha256).toBe(identity.fileSha256);
      expect(evidence[0]?.submission_id).toBe(identity.submissionId);
    }
  });
});
