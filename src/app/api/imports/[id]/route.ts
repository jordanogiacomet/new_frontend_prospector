import { type NextRequest, NextResponse } from "next/server";

import {
  ApiValidationError,
  mapApiError,
  SafeApiError,
  successResponse,
} from "../../../../server/api/errors";
import { requirePermission } from "../../../../server/auth/require-api-session";
import { isDemoDataEnabled } from "../../../../server/demo/mode";
import { getDemoImportBatchDetail } from "../../../../server/demo/prospecta-demo-data";
import { getServerEnv } from "../../../../server/env";
import {
  getImportBatchDetail,
  type GetImportBatchDetailResult,
} from "../../../../server/imports/batch-read-service";
import { resolveLeadReadVisibility } from "../../../../server/leads/lead-read-visibility";
import { listImportReceivedCompanies } from "../../../../server/repositories/imports/import-received-companies-repository";
import { listProcessedImportCompanies } from "../../../../server/repositories/imports/processed-import-companies-repository";

const maximumPage = 10_000;
const defaultCompaniesPageSize = 100;
const maximumPageSize = 100;

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface ImportDetailRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

interface ImportCompaniesQuery {
  readonly kind: "received" | "processed";
  readonly page: number;
  readonly pageSize: number;
}

export async function GET(
  request: NextRequest,
  context: ImportDetailRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("imports:read");
    const environment = requireImportsFeatureEnabled();

    const { id } = parseImportDetailParams(await context.params);
    const companiesQuery = parseImportCompaniesQuery(
      request.nextUrl.searchParams,
    );
    const result =
      environment.DEMO3_LOCAL_RUNTIME_ENABLED && isDemoDataEnabled()
      ? await getImportBatchDetail(
          {
            organizationId: authorization.actor.organizationId,
            submissionId: id,
          },
          { batchObservationEnabled: false },
        )
      : isDemoDataEnabled()
      ? getDemoImportBatchDetail(id)
      : await getImportBatchDetail({
          organizationId: authorization.actor.organizationId,
          submissionId: id,
        });

    if (result.kind === "not_found") {
      return importBatchNotFoundResponse(result);
    }

    if (companiesQuery?.kind === "processed") {
      const { page, pageSize } = companiesQuery;
      const importBatchId = result.batch.import_batch_id;
      const processedCompanies =
        !environment.FEATURE_BATCH_OBSERVATION_ENABLED ||
        importBatchId === null ||
        isDemoDataEnabled()
          ? {
              available: false,
              data: [],
              page,
              pageSize,
              total: null,
              factSource: "producer_current_company_results_v1",
            }
          : await readProcessedCompanies(
              { importBatchId, page, pageSize },
              await resolveLeadReadVisibility(authorization.actor),
            );

      return NextResponse.json(
        successResponse(result.batch, { processedCompanies }),
        { headers: privateNoStoreHeaders },
      );
    }

    if (companiesQuery?.kind === "received") {
      const receivedCompanies = isDemoDataEnabled()
        ? {
            available: false,
            data: [],
            page: companiesQuery.page,
            pageSize: companiesQuery.pageSize,
            total: null,
          }
        : await readReceivedCompanies({
            organizationId: authorization.actor.organizationId,
            submissionId: id,
            page: companiesQuery.page,
            pageSize: companiesQuery.pageSize,
          });

      return NextResponse.json(
        successResponse(result.batch, { receivedCompanies }),
        { headers: privateNoStoreHeaders },
      );
    }

    return NextResponse.json(successResponse(result.batch), {
      headers: privateNoStoreHeaders,
    });
  } catch (error) {
    const { body, status } = mapApiError(error);

    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}

async function readProcessedCompanies(
  input: Parameters<typeof listProcessedImportCompanies>[0],
  options: Parameters<typeof listProcessedImportCompanies>[1],
) {
  const result = await listProcessedImportCompanies(input, options);

  return {
    available: true,
    data: result.companies.map((company) => ({
      source_row: company.source_row,
      processedAt: company.processedAt,
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    factSource: "producer_current_company_results_v1",
  };
}

async function readReceivedCompanies(input: {
  readonly organizationId: string;
  readonly submissionId: string;
  readonly page: number;
  readonly pageSize: number;
}) {
  const result = await listImportReceivedCompanies(input);

  return {
    available: true,
    data: result.companies.map((company) => ({
      source_row: company.source_row,
      receivedAt: company.receivedAt,
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };
}

function parseImportCompaniesQuery(
  searchParams: URLSearchParams,
): ImportCompaniesQuery | null {
  const receivedRequested = searchParams.has("receivedCompaniesPage");
  const processedRequested = searchParams.has("processedCompaniesPage");

  if (receivedRequested && processedRequested) {
    throw validationError("processedCompaniesPage");
  }

  if (!receivedRequested && !processedRequested) {
    return null;
  }

  const field = processedRequested
    ? "processedCompaniesPage"
    : "receivedCompaniesPage";

  for (const key of searchParams.keys()) {
    if (key !== field && key !== "pageSize") {
      throw validationError(key);
    }

    if (searchParams.getAll(key).length > 1) {
      throw validationError(key);
    }
  }

  return {
    kind: processedRequested ? "processed" : "received",
    page: parsePositiveIntegerQuery(
      searchParams.get(field),
      field,
      1,
      maximumPage,
    ),
    pageSize: parsePositiveIntegerQuery(
      searchParams.get("pageSize"),
      "pageSize",
      defaultCompaniesPageSize,
      maximumPageSize,
    ),
  };
}

function parsePositiveIntegerQuery(
  value: string | null,
  field: string,
  fallback: number,
  maximum: number,
): number {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw validationError(field);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw validationError(field);
  }

  return parsed;
}

function requireImportsFeatureEnabled(): ReturnType<typeof getServerEnv> {
  const environment = getServerEnv();

  if (!environment.FEATURE_IMPORTS_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }

  return environment;
}

function parseImportDetailParams(params: {
  readonly id?: unknown;
}): { readonly id: string } {
  if (!isUuid(params.id)) {
    throw validationError("id");
  }

  return { id: params.id };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function importBatchNotFoundResponse(
  result: Extract<
    GetImportBatchDetailResult,
    { readonly kind: "not_found" }
  >,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: result.error.code,
        message: "Importação não encontrada.",
      },
    },
    {
      status: result.error.httpStatus,
      headers: privateNoStoreHeaders,
    },
  );
}

function validationError(field: string): ApiValidationError {
  return new ApiValidationError([{ path: [field] }]);
}
