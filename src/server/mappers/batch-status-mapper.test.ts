import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { mapBatchStatus } from "./batch-status-mapper";
import type {
  BatchAcceptanceFact,
  BatchAcknowledgementFact,
  BatchFreshnessPolicy,
  BatchProducerObservationFacts,
  BatchStatusMapperInput,
  BatchSubmissionFact,
  BatchTerminalOutcomeFact,
} from "../../types/imports";

const submission: BatchSubmissionFact = {
  submissionId: "00000000-0000-4000-8000-000000000020",
  submittedAt: "2026-07-07T12:00:00.000Z",
  factSource: "app_submission",
};

const acknowledgement: BatchAcknowledgementFact = {
  import_batch_id: "empresaqui_2026-07-07T12:00:00.000Z",
  acknowledgedAt: "2026-07-07T12:01:00.000Z",
  factSource: "workflow_acknowledgement",
};

const acceptance: BatchAcceptanceFact = {
  import_batch_id: "empresaqui_2026-07-07T12:00:00.000Z",
  acceptedAt: "2026-07-07T12:02:00.000Z",
  rowCountAccepted: 3,
  factSource: "producer_batch_acceptance",
};

function input(
  overrides: Partial<BatchStatusMapperInput> = {},
): BatchStatusMapperInput {
  return {
    submission,
    acknowledgement: null,
    acceptance: null,
    producerObservations: null,
    freshness: null,
    ...overrides,
  };
}

function observations(
  overrides: Partial<BatchProducerObservationFacts> = {},
): BatchProducerObservationFacts {
  return {
    availability: "AVAILABLE",
    factSource: "producer_batch_observations",
    lastObservedAt: null,
    acceptedRows: [],
    terminalOutcomes: [],
    close: null,
    ...overrides,
  };
}

function observedAt(
  observedAtValue = "2026-07-07T12:10:00.000Z",
): NonNullable<BatchProducerObservationFacts["lastObservedAt"]> {
  return {
    observedAt: observedAtValue,
    factSource: "producer_observation_clock",
  };
}

function acceptedRows(
  sourceRows: readonly number[],
): BatchProducerObservationFacts["acceptedRows"] {
  return sourceRows.map((sourceRow) => ({
    sourceRow,
    factSource: "producer_accepted_rows",
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
      sourceRow,
      terminalClass,
      leadRunId,
      factSource: "producer_terminal_outcomes",
    };
  }

  return {
    sourceRow,
    terminalClass,
    factSource: "producer_terminal_outcomes",
  };
}

function close(): NonNullable<BatchProducerObservationFacts["close"]> {
  return {
    closedAt: "2026-07-07T12:20:00.000Z",
    factSource: "producer_batch_close",
  };
}

function freshness(
  overrides: Partial<BatchFreshnessPolicy> = {},
): BatchFreshnessPolicy {
  return {
    referenceTime: "2026-07-07T13:00:00.000Z",
    freshnessWindowMs: 30 * 60 * 1000,
    factSource: "approved_freshness_policy",
    ...overrides,
  };
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/mappers/batch-status-mapper.ts",
    ),
    "utf8",
  );
}

describe("mapBatchStatus", () => {
  it("maps a durable app submission without producer acceptance as submitted", () => {
    expect(mapBatchStatus(input())).toEqual({
      submissionId: submission.submissionId,
      import_batch_id: null,
      status: "SUBMITTED",
      submittedAt: "2026-07-07T12:00:00.000Z",
      acceptedAt: null,
      lastObservedAt: null,
      rowCountAccepted: null,
      terminalCount: null,
      blockedCount: null,
      failedCount: null,
      leadCount: null,
      statusBasis: "SUBMISSION_RECORDED",
      observationStatus: "AVAILABLE",
      observationBasis: null,
    });
  });

  it("retains acknowledgement correlation without treating it as durable acceptance", () => {
    const summary = mapBatchStatus(input({ acknowledgement }));

    expect(summary).toMatchObject({
      import_batch_id: acknowledgement.import_batch_id,
      status: "SUBMITTED",
      acceptedAt: null,
      rowCountAccepted: null,
      statusBasis: "SUBMISSION_RECORDED",
    });
  });

  it("keeps submitted status when the producer source is unavailable", () => {
    const summary = mapBatchStatus(
      input({
        producerObservations: observations({
          availability: "UNAVAILABLE",
          unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "SUBMITTED",
      terminalCount: null,
      observationStatus: "UNAVAILABLE",
      observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
    });
  });

  it("maps durable acceptance with its row count and accepted timestamp", () => {
    const summary = mapBatchStatus(input({ acceptance }));

    expect(summary).toMatchObject({
      import_batch_id: acceptance.import_batch_id,
      status: "ACCEPTED",
      acceptedAt: "2026-07-07T12:02:00.000Z",
      rowCountAccepted: 3,
      terminalCount: null,
      statusBasis: "ACCEPTANCE_CONFIRMED",
    });
  });

  it("preserves a confirmed zero accepted row count", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 0 },
      }),
    );

    expect(summary.rowCountAccepted).toBe(0);
  });

  it("keeps producer counts null when no approved observation source is present", () => {
    const summary = mapBatchStatus(input({ acceptance }));

    expect(summary).toMatchObject({
      terminalCount: null,
      blockedCount: null,
      failedCount: null,
      leadCount: null,
    });
  });

  it("reports confirmed zero producer counts only from an explicit available source", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        producerObservations: observations(),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      terminalCount: 0,
      blockedCount: 0,
      failedCount: 0,
      leadCount: 0,
    });
  });

  it("maps accepted row activity without close as processing", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2]),
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "PROCESSING",
      statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
      lastObservedAt: "2026-07-07T12:10:00.000Z",
    });
  });

  it("deduplicates accepted row observations before comparing with acceptance", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 2 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 1, 2]),
          terminalOutcomes: [terminal(1, "MATERIALIZED")],
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "PROCESSING",
      terminalCount: 1,
      observationStatus: "AVAILABLE",
      observationBasis: null,
    });
  });

  it("deduplicates repeated terminal events for the same row and class", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 2 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED", "lead-run-1"),
            terminal(1, "MATERIALIZED", "lead-run-1"),
            terminal(2, "FAILED"),
          ],
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "PROCESSING",
      terminalCount: 2,
      failedCount: 1,
      leadCount: 1,
    });
  });

  it("does not complete a batch without an explicit close fact", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 2 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
          ],
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "PROCESSING",
      statusBasis: "PRODUCER_ACTIVITY_OBSERVED",
    });
  });

  it("completes only with close and exactly one terminal for every accepted row", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 3 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2, 3]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
            terminal(3, "FAILED"),
          ],
          close: close(),
          lastObservedAt: observedAt("2026-07-07T12:20:00.000Z"),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "COMPLETED",
      terminalCount: 3,
      blockedCount: 1,
      failedCount: 1,
      leadCount: 1,
      statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
    });
  });

  it("maps explicit close with missing terminal outcomes as incomplete", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 3 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2, 3]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
          ],
          close: close(),
          lastObservedAt: observedAt("2026-07-07T12:20:00.000Z"),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "INCOMPLETE",
      terminalCount: 2,
      statusBasis: "PRODUCER_CLOSED_ROWS_MISSING",
    });
  });

  it("maps close with missing accepted row identities as incomplete", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 3 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "BLOCKED"),
          ],
          close: close(),
          lastObservedAt: observedAt("2026-07-07T12:20:00.000Z"),
        }),
      }),
    );

    expect(summary.status).toBe("INCOMPLETE");
  });

  it("fails closed when accepted row evidence exceeds acceptance", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 2 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2, 3]),
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      terminalCount: null,
      observationStatus: "INCONSISTENT",
      observationBasis: "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE",
      statusBasis: "ACCEPTANCE_CONFIRMED",
    });
  });

  it("fails closed when terminal evidence exceeds acceptance", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 1 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(2, "FAILED"),
          ],
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      failedCount: null,
      observationStatus: "INCONSISTENT",
      observationBasis: "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE",
    });
  });

  it("fails closed on conflicting terminal outcomes for the same row", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 2 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(1, "FAILED"),
          ],
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      terminalCount: null,
      observationStatus: "INCONSISTENT",
      observationBasis: "PRODUCER_EVIDENCE_CONFLICT",
    });
  });

  it("fails closed when terminal identities do not match a complete accepted-row set", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 2 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2]),
          terminalOutcomes: [
            terminal(1, "MATERIALIZED"),
            terminal(3, "FAILED"),
          ],
          lastObservedAt: observedAt(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      observationStatus: "INCONSISTENT",
      observationBasis: "PRODUCER_EVIDENCE_CONFLICT",
    });
  });

  it("retains acceptance when observations are unavailable", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        producerObservations: observations({
          availability: "UNAVAILABLE",
          unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      rowCountAccepted: 3,
      terminalCount: null,
      observationStatus: "UNAVAILABLE",
      observationBasis: "PRODUCER_SOURCE_UNAVAILABLE",
    });
  });

  it("maps stale accepted batches with no newer observation as no update", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        freshness: freshness(),
      }),
    );

    expect(summary).toMatchObject({
      status: "NO_UPDATE",
      statusBasis: "FRESHNESS_WINDOW_EXCEEDED",
      lastObservedAt: null,
    });
  });

  it("keeps acceptance fresh at the exact freshness boundary", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        freshness: freshness({
          referenceTime: "2026-07-07T12:32:00.000Z",
        }),
      }),
    );

    expect(summary.status).toBe("ACCEPTED");
  });

  it("maps stale processing observations as no update without marking failure", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        producerObservations: observations({
          acceptedRows: acceptedRows([1]),
          lastObservedAt: observedAt("2026-07-07T12:10:00.000Z"),
        }),
        freshness: freshness({
          referenceTime: "2026-07-07T12:45:00.001Z",
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "NO_UPDATE",
      statusBasis: "FRESHNESS_WINDOW_EXCEEDED",
      observationStatus: "AVAILABLE",
    });
  });

  it("keeps fresh producer activity as processing", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        producerObservations: observations({
          acceptedRows: acceptedRows([1]),
          lastObservedAt: observedAt("2026-07-07T12:40:00.000Z"),
        }),
        freshness: freshness(),
      }),
    );

    expect(summary.status).toBe("PROCESSING");
  });

  it("does not use retained legacy observations as acceptance or completion proof", () => {
    const summary = mapBatchStatus(
      input({
        acknowledgement,
        producerObservations: observations({
          retainedLegacyObservations: [
            {
              sourceRow: 1,
              leadRunId: "legacy-lead-run-1",
              observedAt: "2026-07-07T12:15:00.000Z",
              factSource: "legacy_company_validation_runs",
            },
          ],
          lastObservedAt: observedAt("2026-07-07T12:15:00.000Z"),
          close: close(),
        }),
      }),
    );

    expect(summary).toMatchObject({
      import_batch_id: acknowledgement.import_batch_id,
      status: "SUBMITTED",
      acceptedAt: null,
      rowCountAccepted: null,
      terminalCount: null,
      statusBasis: "SUBMISSION_RECORDED",
    });
  });

  it("does not use retained legacy observations as producer activity", () => {
    const summary = mapBatchStatus(
      input({
        acceptance,
        producerObservations: observations({
          retainedLegacyObservations: [
            {
              sourceRow: 1,
              leadRunId: "legacy-lead-run-1",
              observedAt: "2026-07-07T12:15:00.000Z",
              factSource: "legacy_company_validation_runs",
            },
          ],
          lastObservedAt: observedAt("2026-07-07T12:15:00.000Z"),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      terminalCount: 0,
      statusBasis: "ACCEPTANCE_CONFIRMED",
    });
  });

  it("completes an explicitly closed zero-row acceptance", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 0 },
        producerObservations: observations({
          close: close(),
          lastObservedAt: observedAt("2026-07-07T12:20:00.000Z"),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "COMPLETED",
      rowCountAccepted: 0,
      terminalCount: 0,
      statusBasis: "PRODUCER_CLOSED_ALL_ROWS_TERMINAL",
    });
  });

  it("fails closed when a zero-row acceptance has terminal evidence", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 0 },
        producerObservations: observations({
          terminalOutcomes: [terminal(1, "FAILED")],
          close: close(),
          lastObservedAt: observedAt("2026-07-07T12:20:00.000Z"),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "ACCEPTED",
      terminalCount: null,
      observationStatus: "INCONSISTENT",
      observationBasis: "PRODUCER_EVIDENCE_EXCEEDS_ACCEPTANCE",
    });
  });

  it("preserves provenance basis for incomplete status and available observations", () => {
    const summary = mapBatchStatus(
      input({
        acceptance: { ...acceptance, rowCountAccepted: 2 },
        producerObservations: observations({
          acceptedRows: acceptedRows([1, 2]),
          terminalOutcomes: [terminal(1, "BLOCKED")],
          close: close(),
          lastObservedAt: observedAt("2026-07-07T12:20:00.000Z"),
        }),
      }),
    );

    expect(summary).toMatchObject({
      status: "INCOMPLETE",
      statusBasis: "PRODUCER_CLOSED_ROWS_MISSING",
      observationStatus: "AVAILABLE",
      observationBasis: null,
    });
  });

  it("is deterministic and does not mutate input arrays", () => {
    const producerObservations = observations({
      acceptedRows: acceptedRows([1, 2]),
      terminalOutcomes: [terminal(1, "MATERIALIZED")],
      lastObservedAt: observedAt(),
    });
    const before = producerObservations.acceptedRows.map(
      (row) => row.sourceRow,
    );

    const first = mapBatchStatus(
      input({ acceptance, producerObservations }),
    );
    const second = mapBatchStatus(
      input({ acceptance, producerObservations }),
    );

    expect(second).toEqual(first);
    expect(
      producerObservations.acceptedRows.map((row) => row.sourceRow),
    ).toEqual(before);
  });

  it("rejects unnamed facts instead of deriving unproven provenance", () => {
    expect(() =>
      mapBatchStatus(
        input({
          acceptance: { ...acceptance, factSource: "" },
        }),
      ),
    ).toThrowError("Metadados de status de lote inválidos.");
  });

  it("rejects invalid counts instead of clamping them to zero", () => {
    expect(() =>
      mapBatchStatus(
        input({
          acceptance: { ...acceptance, rowCountAccepted: -1 },
        }),
      ),
    ).toThrowError("Metadados de status de lote inválidos.");
  });

  it("contains no external IO, database language, producer mutation, or hidden timers", () => {
    const mapperSource = source();

    expect(mapperSource).not.toMatch(/fetch\s*\(/);
    expect(mapperSource).not.toMatch(/n8n/i);
    expect(mapperSource).not.toMatch(
      /\b(select|insert|update|delete|upsert|merge)\b/i,
    );
    expect(mapperSource).not.toMatch(/Date\.now|setTimeout|setInterval/);
    expect(mapperSource).not.toMatch(
      /PRODUCER_DATABASE_URL|APP_DATABASE_URL|recordProducer/i,
    );
  });
});
