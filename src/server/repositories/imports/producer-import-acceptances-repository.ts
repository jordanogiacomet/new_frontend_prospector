import "server-only";

import {
  DatabaseUnavailableError,
  query as queryProducerDatabase,
  type SqlStatement,
} from "../../db/producer-client";

const FACT_SOURCE = "producer_import_acceptances_v1";

export interface ProducerImportAcceptance {
  readonly submissionId: string;
  readonly import_batch_id: string;
  readonly uploadedFileSha256: string;
  readonly acceptedRowCount: number;
  readonly acceptedAt: Date;
}

export type ProducerImportAcceptanceReadResult =
  | {
      readonly availability: "AVAILABLE";
      readonly factSource: typeof FACT_SOURCE;
      readonly acceptance: ProducerImportAcceptance | null;
    }
  | {
      readonly availability: "UNAVAILABLE" | "INCONSISTENT";
      readonly factSource: typeof FACT_SOURCE;
      readonly acceptance: null;
    };

export interface ReadProducerImportAcceptanceInput {
  readonly submissionId: string;
}

export class ProducerImportAcceptanceRepositoryInputError extends Error {
  readonly code = "INVALID_PRODUCER_IMPORT_ACCEPTANCE_INPUT";

  constructor() {
    super("Invalid producer import acceptance input.");
    this.name = "ProducerImportAcceptanceRepositoryInputError";
  }
}

interface ProducerImportAcceptanceRow {
  readonly submission_id: string;
  readonly import_batch_id: string;
  readonly uploaded_file_sha256: string;
  readonly accepted_row_count: number | string;
  readonly accepted_at: Date | string;
}

export async function readProducerImportAcceptance(
  input: ReadProducerImportAcceptanceInput,
): Promise<ProducerImportAcceptanceReadResult> {
  validateInput(input);

  try {
    const [row] = await queryProducerDatabase<ProducerImportAcceptanceRow>(
      buildSelectStatement(input.submissionId),
    );

    if (row === undefined) {
      return {
        availability: "AVAILABLE",
        factSource: FACT_SOURCE,
        acceptance: null,
      };
    }

    const acceptance = mapAcceptanceRow(row, input.submissionId);

    return acceptance === null
      ? {
          availability: "INCONSISTENT",
          factSource: FACT_SOURCE,
          acceptance: null,
        }
      : {
          availability: "AVAILABLE",
          factSource: FACT_SOURCE,
          acceptance,
        };
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return {
        availability: "UNAVAILABLE",
        factSource: FACT_SOURCE,
        acceptance: null,
      };
    }

    throw error;
  }
}

function buildSelectStatement(submissionId: string): SqlStatement {
  return {
    text: `
      SELECT
        submission_id,
        import_batch_id,
        uploaded_file_sha256,
        accepted_row_count,
        accepted_at
      FROM public.prospecta_import_acceptances_v1
      WHERE submission_id = $1
      LIMIT 1`,
    values: [submissionId],
  };
}

function mapAcceptanceRow(
  row: ProducerImportAcceptanceRow,
  expectedSubmissionId: string,
): ProducerImportAcceptance | null {
  const acceptedRowCount =
    typeof row.accepted_row_count === "number"
      ? row.accepted_row_count
      : Number(row.accepted_row_count);
  const acceptedAt =
    row.accepted_at instanceof Date
      ? new Date(row.accepted_at)
      : new Date(row.accepted_at);

  if (
    row.submission_id !== expectedSubmissionId ||
    !/^ib_[0-9a-f]{64}$/.test(row.import_batch_id) ||
    !/^[0-9a-f]{64}$/.test(row.uploaded_file_sha256) ||
    !Number.isSafeInteger(acceptedRowCount) ||
    acceptedRowCount < 1 ||
    Number.isNaN(acceptedAt.getTime())
  ) {
    return null;
  }

  return {
    submissionId: row.submission_id,
    import_batch_id: row.import_batch_id,
    uploadedFileSha256: row.uploaded_file_sha256,
    acceptedRowCount,
    acceptedAt,
  };
}

function validateInput(input: ReadProducerImportAcceptanceInput): void {
  if (
    typeof input !== "object" ||
    input === null ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.submissionId,
    )
  ) {
    throw new ProducerImportAcceptanceRepositoryInputError();
  }
}
