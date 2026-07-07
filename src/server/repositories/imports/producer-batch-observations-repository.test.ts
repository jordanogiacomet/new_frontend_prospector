import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class DatabaseUnavailableError extends Error {
    readonly code = "DATABASE_UNAVAILABLE";

    constructor() {
      super("Database temporarily unavailable.");
      this.name = "DatabaseUnavailableError";
    }
  }

  return {
    query: vi.fn(),
    DatabaseUnavailableError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../../db/producer-client", () => ({
  query: mocks.query,
  DatabaseUnavailableError: mocks.DatabaseUnavailableError,
}));

import { DatabaseUnavailableError } from "../../db/producer-client";
import type { SqlStatement } from "../../db/producer-client";
import {
  ProducerBatchObservationRepositoryInputError,
  readProducerBatchObservations,
} from "./producer-batch-observations-repository";

const importBatchId = "empresaqui_2026-07-07T12:00:00.000Z";
const observedAt = new Date("2026-07-07T12:02:00.000Z");
const laterObservedAt = new Date("2026-07-07T12:03:00.000Z");
const closedAt = new Date("2026-07-07T12:04:00.000Z");

interface ObservationRow {
  readonly import_batch_id: string;
  readonly fact_type: string;
  readonly source_row: number | string | null;
  readonly lead_run_id: string | null;
  readonly producer_result: string | null;
  readonly observed_at: Date | string | null;
  readonly closed_at: Date | string | null;
}

function observationRow(
  overrides: Partial<ObservationRow> = {},
): ObservationRow {
  return {
    import_batch_id: overrides.import_batch_id ?? importBatchId,
    fact_type: overrides.fact_type ?? "ACCEPTED_ROW",
    source_row: overrides.source_row ?? 1,
    lead_run_id: overrides.lead_run_id ?? null,
    producer_result: overrides.producer_result ?? null,
    observed_at: overrides.observed_at ?? observedAt,
    closed_at: overrides.closed_at ?? null,
  };
}

function statement(): SqlStatement {
  return mocks.query.mock.calls[0]?.[0] as SqlStatement;
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/repositories/imports/producer-batch-observations-repository.ts",
    ),
    "utf8",
  );
}

beforeEach(() => {
  mocks.query.mockReset();
});

describe("readProducerBatchObservations", () => {
  it.each([
    ["blank", ""],
    ["trimmed", ` ${importBatchId}`],
    ["oversized", "x".repeat(129)],
  ] as const)("rejects invalid import_batch_id before database work: %s", async (_label, value) => {
    await expect(
      readProducerBatchObservations({ import_batch_id: value }),
    ).rejects.toBeInstanceOf(ProducerBatchObservationRepositoryInputError);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns an available empty observation set for a valid batch without rows", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result).toEqual({
      factSource: "producer_x4_batch_observations_v1",
      availability: "AVAILABLE",
      lastObservedAt: null,
      acceptedRows: [],
      terminalOutcomes: [],
      close: null,
      retainedLegacyObservations: [],
    });
  });

  it("returns unavailable when the approved producer source cannot be read", async () => {
    mocks.query.mockRejectedValueOnce(new DatabaseUnavailableError());

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result).toEqual({
      factSource: "producer_x4_batch_observations_v1",
      availability: "UNAVAILABLE",
      unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
      lastObservedAt: null,
      acceptedRows: [],
      terminalOutcomes: [],
      close: null,
      retainedLegacyObservations: [],
    });
  });

  it("keeps absent accepted-row facts as an empty set instead of confirmed zero", async () => {
    mocks.query.mockResolvedValueOnce([
      observationRow({
        fact_type: "RETAINED_LEGACY_OBSERVATION",
        source_row: 7,
        lead_run_id: "legacy-run-7",
      }),
    ]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.acceptedRows).toEqual([]);
    expect(result.terminalOutcomes).toEqual([]);
    expect(result.close).toBeNull();
  });

  it("deduplicates accepted rows by source_row", async () => {
    mocks.query.mockResolvedValueOnce([
      observationRow({ source_row: 2 }),
      observationRow({ source_row: 1 }),
      observationRow({ source_row: 2, observed_at: laterObservedAt }),
    ]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.acceptedRows).toEqual([
      { factSource: "producer_x4_accepted_rows_v1", sourceRow: 1 },
      { factSource: "producer_x4_accepted_rows_v1", sourceRow: 2 },
    ]);
    expect(result.lastObservedAt).toEqual({
      factSource: "producer_x4_observation_clock_v1",
      observedAt: laterObservedAt,
    });
  });

  it("deduplicates terminal outcomes by source row and terminal class", async () => {
    mocks.query.mockResolvedValueOnce([
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 1,
        producer_result: "LEAD_DECISION_SAVED",
        lead_run_id: "lead-run-1",
      }),
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 1,
        producer_result: "LEAD_DECISION_SAVED",
        lead_run_id: "lead-run-1",
      }),
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 2,
        producer_result: "PROCESSING_FAILED",
      }),
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 2,
        producer_result: "PROCESSING_FAILED",
      }),
    ]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.terminalOutcomes).toEqual([
      {
        factSource: "producer_x4_terminal_outcomes_v1",
        sourceRow: 1,
        terminalClass: "MATERIALIZED",
        leadRunId: "lead-run-1",
      },
      {
        factSource: "producer_x4_terminal_outcomes_v1",
        sourceRow: 2,
        terminalClass: "FAILED",
      },
    ]);
  });

  it("maps only the approved X4 producer results to terminal classes", async () => {
    mocks.query.mockResolvedValueOnce([
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 1,
        producer_result: "LEAD_DECISION_SAVED",
        lead_run_id: "lead-run-1",
      }),
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 2,
        producer_result: "PRE_VALIDATION_BLOCKED",
      }),
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 3,
        producer_result: "CRM_REJECTED",
      }),
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 4,
        producer_result: "PROCESSING_FAILED",
      }),
    ]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.terminalOutcomes.map((fact) => fact.terminalClass)).toEqual([
      "MATERIALIZED",
      "BLOCKED",
      "BLOCKED",
      "FAILED",
    ]);
  });

  it("keeps unknown producer results non-terminal", async () => {
    mocks.query.mockResolvedValueOnce([
      observationRow({
        fact_type: "TERMINAL_OUTCOME",
        source_row: 1,
        producer_result: "UNKNOWN_RESULT",
      }),
    ]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.terminalOutcomes).toEqual([]);
  });

  it("maps an explicit approved close fact", async () => {
    mocks.query.mockResolvedValueOnce([
      observationRow({
        fact_type: "BATCH_CLOSED",
        source_row: null,
        observed_at: laterObservedAt,
        closed_at: closedAt,
      }),
    ]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.close).toEqual({
      factSource: "producer_x4_batch_close_v1",
      closedAt,
    });
    expect(result.lastObservedAt?.observedAt).toEqual(closedAt);
  });

  it("keeps close null when no explicit close fact exists", async () => {
    mocks.query.mockResolvedValueOnce([observationRow()]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.close).toBeNull();
  });

  it("retains legacy observations without proving acceptance or completion", async () => {
    mocks.query.mockResolvedValueOnce([
      observationRow({
        fact_type: "RETAINED_LEGACY_OBSERVATION",
        source_row: 5,
        lead_run_id: "legacy-run-5",
      }),
    ]);

    const result = await readProducerBatchObservations({
      import_batch_id: importBatchId,
    });

    expect(result.retainedLegacyObservations).toEqual([
      {
        factSource: "producer_retained_legacy_observations_v1",
        sourceRow: 5,
        leadRunId: "legacy-run-5",
        observedAt,
      },
    ]);
    expect(result.acceptedRows).toEqual([]);
    expect(result.terminalOutcomes).toEqual([]);
    expect(result.close).toBeNull();
  });

  it("parameterizes reads by import_batch_id", async () => {
    mocks.query.mockResolvedValueOnce([]);

    await readProducerBatchObservations({ import_batch_id: importBatchId });

    expect(statement()).toEqual({
      text: expect.stringMatching(/WHERE import_batch_id = \$1/i),
      values: [importBatchId],
    });
    expect(statement().text).not.toContain(importBatchId);
  });
});

describe("producer batch observation repository source boundaries", () => {
  it("uses only the producer database client", () => {
    expect(source()).toContain("../../db/producer-client");
    expect(source()).not.toMatch(/app-client|APP_DATABASE_URL|prospecting_app/i);
  });

  it("does not call n8n, fetch, or browser APIs", () => {
    expect(source()).not.toMatch(
      /n8n|N8N|webhook|fetch\s*\(|XMLHttpRequest|window\.|document\.|localStorage|navigator\./,
    );
  });

  it("performs no producer mutation", () => {
    expect(source()).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b/i,
    );
  });

  it("reads only the X4-approved producer observation view", () => {
    expect(source()).toMatch(
      /FROM public\.prospecta_import_batch_observations_v1/i,
    );
    expect(source()).not.toMatch(
      /company_validation_runs|lead_import_batches|lead_input_rows|lead_processing_state|lead_processing_events|lead_decisions/i,
    );
  });
});
