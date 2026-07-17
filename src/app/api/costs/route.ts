import { type NextRequest, NextResponse } from "next/server";

import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  paginatedSuccessResponse,
} from "../../../server/api/errors";
import { requirePermission } from "../../../server/auth/require-api-session";
import { listCostOverview } from "../../../server/costs/cost-read-service";
import { getServerEnv } from "../../../server/env";

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface CostListQuery {
  readonly page: number;
  readonly pageSize: number;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("costs:read");
    requireCostsFeatureEnabled();

    const query = parseCostListQuery(request.nextUrl.searchParams);
    const result = await listCostOverview({
      organizationId: authorization.actor.organizationId,
      page: query.page,
      pageSize: query.pageSize,
    });

    return NextResponse.json(
      paginatedSuccessResponse(result.runs, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        currency: "USD",
        coverage: result.coverage,
        subtotalEstimatedUsd: result.subtotalEstimatedUsd,
      }),
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    const { body, status } = mapApiError(error);

    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}

function requireCostsFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_COSTS_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function parseCostListQuery(searchParams: URLSearchParams): CostListQuery {
  for (const key of searchParams.keys()) {
    if (key !== "page" && key !== "pageSize") {
      throw validationError(key);
    }
  }

  if (searchParams.getAll("page").length > 1) {
    throw validationError("page");
  }

  if (searchParams.getAll("pageSize").length > 1) {
    throw validationError("pageSize");
  }

  return {
    page: parsePositiveIntegerQuery(
      searchParams.get("page"),
      "page",
      defaultPage,
      maximumPage,
    ),
    pageSize: parsePositiveIntegerQuery(
      searchParams.get("pageSize"),
      "pageSize",
      defaultPageSize,
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

function validationError(field: string): ApiValidationError {
  return new ApiValidationError([{ path: [field] }]);
}
