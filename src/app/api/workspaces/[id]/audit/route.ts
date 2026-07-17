import { type NextRequest, NextResponse } from "next/server";

import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  paginatedSuccessResponse,
} from "../../../../../server/api/errors";
import { requirePermission } from "../../../../../server/auth/require-api-session";
import {
  CommercialAuditRepositoryInputError,
  listCommercialAuditEvents,
  type ListCommercialAuditEventsResult,
} from "../../../../../server/commercial/audit-repository";
import { getServerEnv } from "../../../../../server/env";

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

const allowedQueryKeys = ["page", "pageSize"] as const;

type AuditRouteStatus = 400 | 401 | 403 | 404 | 500 | 503;

interface AuditRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

interface AuditRouteErrorResponse {
  readonly status: AuditRouteStatus;
  readonly body: {
    readonly error: {
      readonly code: string;
      readonly message: string;
      readonly details?: readonly {
        readonly field: string;
        readonly message: "Valor inválido.";
      }[];
    };
  };
}

interface AuditQuery {
  readonly page: number;
  readonly pageSize: number;
}

type AuditRouteResultError = Extract<
  ListCommercialAuditEventsResult,
  { readonly kind: "not_found" }
>;

export async function GET(
  request: NextRequest,
  context: AuditRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("audit:read");
    requireCommercialFeatureEnabled();

    const { id } = parseAuditParams(await context.params);
    const query = parseAuditQuery(request.nextUrl.searchParams);
    const result = await listCommercialAuditEvents({
      actor: {
        organizationId: authorization.actor.organizationId,
      },
      workspaceId: id,
      page: query.page,
      pageSize: query.pageSize,
    });

    if (result.kind === "not_found") {
      return auditResultErrorResponse(result);
    }

    return NextResponse.json(
      paginatedSuccessResponse(result.auditEvents, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    return auditRouteErrorResponse(error);
  }
}

function requireCommercialFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_COMMERCIAL_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function parseAuditParams(params: {
  readonly id?: unknown;
}): { readonly id: string } {
  if (!isUuid(params.id)) {
    throw validationError("id");
  }

  return { id: params.id };
}

function parseAuditQuery(searchParams: URLSearchParams): AuditQuery {
  const allowedKeys = new Set<string>(allowedQueryKeys);

  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key)) {
      throw validationError(key);
    }
  }

  for (const key of allowedQueryKeys) {
    if (searchParams.getAll(key).length > 1) {
      throw validationError(key);
    }
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

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw validationError(field);
  }

  return parsed;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function auditResultErrorResponse(
  result: AuditRouteResultError,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: result.error.code,
        message: result.error.message,
      },
    },
    {
      status: result.error.httpStatus,
      headers: privateNoStoreHeaders,
    },
  );
}

function auditRouteErrorResponse(error: unknown): NextResponse {
  const { body, status } = mapAuditRouteError(error);

  return NextResponse.json(body, {
    status,
    headers: privateNoStoreHeaders,
  });
}

function mapAuditRouteError(error: unknown): AuditRouteErrorResponse {
  if (error instanceof CommercialAuditRepositoryInputError) {
    const mapped = mapApiError(validationError("request"));

    return {
      status: mapped.status,
      body: mapped.body,
    };
  }

  const mapped = mapApiError(error);

  return {
    status: mapped.status,
    body: mapped.body,
  };
}

function validationError(field: string): ApiValidationError {
  return new ApiValidationError([{ path: [field] }]);
}
