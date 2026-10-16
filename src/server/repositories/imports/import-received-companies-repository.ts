import "server-only";

import { SafeApiError } from "../../api/errors";
import { query } from "../../db/app-client";

export interface ListImportReceivedCompaniesInput {
  readonly organizationId: string;
  readonly submissionId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ImportReceivedCompany {
  readonly source_row: number;
  readonly receivedAt: string;
}

export interface ListImportReceivedCompaniesResult {
  readonly companies: readonly ImportReceivedCompany[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export class ImportReceivedCompaniesRepositoryInputError extends Error {
  readonly code = "INVALID_IMPORT_RECEIVED_COMPANIES_INPUT";

  constructor() {
    super("Invalid received import companies input.");
    this.name = "ImportReceivedCompaniesRepositoryInputError";
  }
}

interface CountRow {
  readonly total: string | number;
}

interface ReceivedCompanyRow {
  readonly source_row: string | number;
  readonly received_at: Date | string;
}

export async function listImportReceivedCompanies(
  input: ListImportReceivedCompaniesInput,
): Promise<ListImportReceivedCompaniesResult> {
  validateInput(input);
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const scopeValues = [input.organizationId, input.submissionId];

  const [countRow] = await query<CountRow>({
    text: `
      SELECT COUNT(*)::text AS total
      FROM prospecting_app.import_received_companies
      WHERE organization_id = $1 AND submission_id = $2`,
    values: scopeValues,
  });
  const total = parseSafeInteger(countRow?.total, 0);
  const rows = await query<ReceivedCompanyRow>({
    text: `
      SELECT source_row, received_at
      FROM prospecting_app.import_received_companies
      WHERE organization_id = $1 AND submission_id = $2
      ORDER BY source_row ASC
      LIMIT $3 OFFSET $4`,
    values: [...scopeValues, pageSize, (page - 1) * pageSize],
  });

  return {
    companies: rows.map((row) => ({
      source_row: parseSafeInteger(row.source_row, 1),
      receivedAt: parseReceivedAt(row.received_at),
    })),
    page,
    pageSize,
    total,
  };
}

function validateInput(input: ListImportReceivedCompaniesInput): void {
  if (
    typeof input !== "object" || input === null || Array.isArray(input) ||
    typeof input.organizationId !== "string" ||
    input.organizationId.trim() !== input.organizationId ||
    input.organizationId.length < 1 || input.organizationId.length > 128 ||
    typeof input.submissionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.submissionId) ||
    (input.page !== undefined &&
      (!Number.isSafeInteger(input.page) || input.page < 1 || input.page > 10_000)) ||
    (input.pageSize !== undefined &&
      (!Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100))
  ) {
    throw new ImportReceivedCompaniesRepositoryInputError();
  }
}

function parseSafeInteger(value: unknown, minimum: number): number {
  if (
    (typeof value !== "string" || !/^\d+$/.test(value)) &&
    typeof value !== "number"
  ) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  return parsed;
}

function parseReceivedAt(value: Date | string): string {
  if (!(value instanceof Date) && typeof value !== "string") {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    throw new SafeApiError("DATA_SOURCE_UNAVAILABLE");
  }

  return parsed.toISOString();
}
