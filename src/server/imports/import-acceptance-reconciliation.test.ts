import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCandidate: vi.fn(),
  readProducerAcceptance: vi.fn(),
  promoteAcceptance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "../repositories/imports/import-acceptance-reconciliation-repository",
  () => ({
    getImportAcceptanceCandidate: mocks.getCandidate,
    promoteDurableImportAcceptance: mocks.promoteAcceptance,
  }),
);
vi.mock(
  "../repositories/imports/producer-import-acceptances-repository",
  () => ({
    readProducerImportAcceptance: mocks.readProducerAcceptance,
  }),
);

import {
  ImportAcceptanceReconciliationInputError,
  reconcileImportAcceptance,
} from "./import-acceptance-reconciliation";

const organizationId = "org-synthetic-a";
const actorSubject = "oidc|synthetic-manager";
const submissionId = "00000000-0000-4000-8000-000000000015";
const fileSha256 = "a".repeat(64);
const importBatchId = `ib_${"b".repeat(64)}`;
const submittedAt = new Date("2026-07-20T12:00:00.000Z");
const acknowledgedAt = new Date("2026-07-20T12:00:01.000Z");
const acceptedAt = new Date("2026-07-20T12:00:00.500Z");

function input() {
  return { organizationId, actorSubject, submissionId };
}

function candidate(
  overrides: Partial<{
    appContractVersion: string;
    workflowAcknowledgement: {
      import_batch_id: string;
      row_count: number;
      acknowledgedAt: Date;
    } | null;
    durableAcceptance: {
      acceptedAt: Date;
      rowCountAccepted: number;
    } | null;
    status:
      | "SUBMISSION_RECORDED"
      | "PRODUCER_ACKNOWLEDGED"
      | "ACCEPTANCE_UNKNOWN"
      | "DURABLE_ACCEPTED"
      | "REJECTED";
  }> = {},
) {
  return {
    submissionId,
    organizationId,
    fileSha256,
    appContractVersion:
      overrides.appContractVersion ?? "prospecta-import-v1",
    submittedAt,
    status: overrides.status ?? "PRODUCER_ACKNOWLEDGED",
    workflowAcknowledgement:
      "workflowAcknowledgement" in overrides
        ? (overrides.workflowAcknowledgement ?? null)
        : {
            import_batch_id: importBatchId,
            row_count: 2,
            acknowledgedAt,
          },
    durableAcceptance:
      "durableAcceptance" in overrides
        ? (overrides.durableAcceptance ?? null)
        : null,
  };
}

function producerAcceptance(
  overrides: Partial<{
    submissionId: string;
    import_batch_id: string;
    uploadedFileSha256: string;
    acceptedRowCount: number;
    acceptedAt: Date;
  }> = {},
) {
  return {
    submissionId: overrides.submissionId ?? submissionId,
    import_batch_id: overrides.import_batch_id ?? importBatchId,
    uploadedFileSha256:
      overrides.uploadedFileSha256 ?? fileSha256,
    acceptedRowCount: overrides.acceptedRowCount ?? 2,
    acceptedAt: overrides.acceptedAt ?? acceptedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCandidate.mockResolvedValue({
    kind: "found",
    candidate: candidate(),
  });
  mocks.readProducerAcceptance.mockResolvedValue({
    availability: "AVAILABLE",
    factSource: "producer_import_acceptances_v1",
    acceptance: producerAcceptance(),
  });
  mocks.promoteAcceptance.mockResolvedValue({
    kind: "confirmed",
    changed: true,
  });
});

describe("reconcileImportAcceptance", () => {
  it("verifies app organization scope before producer access", async () => {
    await reconcileImportAcceptance(input());

    expect(
      mocks.getCandidate.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.readProducerAcceptance.mock.invocationCallOrder[0],
    );
    expect(mocks.getCandidate).toHaveBeenCalledWith({
      organizationId,
      submissionId,
    });
  });

  it("does not query producer facts when the scoped submission is absent", async () => {
    mocks.getCandidate.mockResolvedValueOnce({
      kind: "not_found",
      error: {
        code: "IMPORT_SUBMISSION_NOT_FOUND",
        httpStatus: 404,
        message: "Import submission was not found.",
      },
    });

    await expect(
      reconcileImportAcceptance(input()),
    ).resolves.toEqual({ kind: "not_found" });
    expect(mocks.readProducerAcceptance).not.toHaveBeenCalled();
  });

  it("does not reconcile an unknown outcome without an approved late runner", async () => {
    mocks.getCandidate.mockResolvedValueOnce({
      kind: "found",
      candidate: candidate({
        status: "ACCEPTANCE_UNKNOWN",
        workflowAcknowledgement: null,
      }),
    });

    await expect(
      reconcileImportAcceptance(input()),
    ).resolves.toEqual({ kind: "not_ready" });
    expect(mocks.readProducerAcceptance).not.toHaveBeenCalled();
    expect(mocks.promoteAcceptance).not.toHaveBeenCalled();
  });

  it("preserves the acknowledgement when producer acceptance is unavailable", async () => {
    mocks.readProducerAcceptance.mockResolvedValueOnce({
      availability: "UNAVAILABLE",
      factSource: "producer_import_acceptances_v1",
      acceptance: null,
    });

    await expect(
      reconcileImportAcceptance(input()),
    ).resolves.toEqual({ kind: "unavailable" });
    expect(mocks.promoteAcceptance).not.toHaveBeenCalled();
  });

  it("keeps acknowledgement unpromoted while the durable fact is not observed", async () => {
    mocks.readProducerAcceptance.mockResolvedValueOnce({
      availability: "AVAILABLE",
      factSource: "producer_import_acceptances_v1",
      acceptance: null,
    });

    await expect(
      reconcileImportAcceptance(input()),
    ).resolves.toEqual({ kind: "not_observed" });
    expect(mocks.promoteAcceptance).not.toHaveBeenCalled();
  });

  it.each([
    [
      "hash",
      producerAcceptance({ uploadedFileSha256: "c".repeat(64) }),
    ],
    [
      "batch",
      producerAcceptance({ import_batch_id: `ib_${"d".repeat(64)}` }),
    ],
    ["count", producerAcceptance({ acceptedRowCount: 3 })],
    [
      "timestamp before submission",
      producerAcceptance({
        acceptedAt: new Date("2026-07-20T11:59:00.000Z"),
      }),
    ],
    [
      "timestamp after acknowledgement",
      producerAcceptance({
        acceptedAt: new Date("2026-07-20T12:00:02.000Z"),
      }),
    ],
  ] as const)("fails closed on %s mismatch", async (_label, acceptance) => {
    mocks.readProducerAcceptance.mockResolvedValueOnce({
      availability: "AVAILABLE",
      factSource: "producer_import_acceptances_v1",
      acceptance,
    });

    await expect(
      reconcileImportAcceptance(input()),
    ).resolves.toEqual({ kind: "conflict" });
    expect(mocks.promoteAcceptance).not.toHaveBeenCalled();
  });

  it("promotes exact durable facts through the app-owned transaction", async () => {
    await expect(
      reconcileImportAcceptance(input()),
    ).resolves.toEqual({ kind: "confirmed", changed: true });

    expect(mocks.promoteAcceptance).toHaveBeenCalledWith({
      organizationId,
      actorSubject,
      submissionId,
      fileSha256,
      appContractVersion: "prospecta-import-v1",
      acceptance: {
        import_batch_id: importBatchId,
        acceptedRowCount: 2,
        acceptedAt,
      },
    });
  });

  it("returns an already confirmed app fact without another producer read", async () => {
    mocks.getCandidate.mockResolvedValueOnce({
      kind: "found",
      candidate: candidate({
        status: "DURABLE_ACCEPTED",
        durableAcceptance: {
          acceptedAt,
          rowCountAccepted: 2,
        },
      }),
    });

    await expect(
      reconcileImportAcceptance(input()),
    ).resolves.toEqual({ kind: "confirmed", changed: false });
    expect(mocks.readProducerAcceptance).not.toHaveBeenCalled();
  });

  it.each([
    { organizationId: "", actorSubject, submissionId },
    { organizationId, actorSubject: "", submissionId },
    { organizationId, actorSubject, submissionId: "not-a-uuid" },
  ])("rejects invalid input before any repository access", async (invalid) => {
    await expect(
      reconcileImportAcceptance(invalid),
    ).rejects.toBeInstanceOf(
      ImportAcceptanceReconciliationInputError,
    );
    expect(mocks.getCandidate).not.toHaveBeenCalled();
    expect(mocks.readProducerAcceptance).not.toHaveBeenCalled();
  });
});
