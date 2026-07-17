import { type NextRequest, NextResponse } from "next/server";

import { createLeadActivityRequestSchema } from "../../../../../lib/validators/commercial";
import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  paginatedSuccessResponse,
  successResponse,
} from "../../../../../server/api/errors";
import {
  requirePermission,
  requireSameOrigin,
} from "../../../../../server/auth/require-api-session";
import { createCommercialAuditActorContext } from "../../../../../server/commercial/audit-context";
import {
  LeadActivityRepositoryInputError,
  appendLeadActivity,
  listLeadActivities,
  type AppendLeadActivityResult,
  type ListLeadActivitiesResult,
} from "../../../../../server/commercial/activity-repository";
import { getServerEnv } from "../../../../../server/env";

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

const allowedQueryKeys = ["page", "pageSize"] as const;

type ActivityRouteStatus = 400 | 401 | 403 | 404 | 500 | 503;

interface ActivityRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

interface ActivityRouteErrorResponse {
  readonly status: ActivityRouteStatus;
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

interface ActivityQuery {
  readonly page: number;
  readonly pageSize: number;
}

type ActivityRouteResultError =
  | Extract<ListLeadActivitiesResult, { readonly kind: "not_found" }>
  | Extract<AppendLeadActivityResult, { readonly kind: "not_found" }>;

export async function GET(
  request: NextRequest,
  context: ActivityRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:read");
    requireCommercialFeatureEnabled();

    const { id } = parseActivityParams(await context.params);
    const query = parseActivityQuery(request.nextUrl.searchParams);
    const result = await listLeadActivities({
      actor: {
        organizationId: authorization.actor.organizationId,
      },
      workspaceId: id,
      page: query.page,
      pageSize: query.pageSize,
    });

    if (result.kind === "not_found") {
      return activityResultErrorResponse(result);
    }

    return NextResponse.json(
      paginatedSuccessResponse(result.activities, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    return activityRouteErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: ActivityRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:write");
    requireSameOrigin(request);
    requireCommercialFeatureEnabled();

    const { id } = parseActivityParams(await context.params);
    const body = await readJsonBody(request);
    const activityRequest = createLeadActivityRequestSchema.parse(body);
    const result = await appendLeadActivity({
      actor: createCommercialAuditActorContext(authorization.actor),
      workspaceId: id,
      request: activityRequest,
    });

    if (result.kind === "not_found") {
      return activityResultErrorResponse(result);
    }

    return NextResponse.json(
      successResponse(result.activity, { result: "appended" }),
      { status: 201, headers: privateNoStoreHeaders },
    );
  } catch (error) {
    return activityRouteErrorResponse(error);
  }
}

function requireCommercialFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_COMMERCIAL_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function parseActivityParams(params: {
  readonly id?: unknown;
}): { readonly id: string } {
  if (!isUuid(params.id)) {
    throw validationError("id");
  }

  return { id: params.id };
}

function parseActivityQuery(searchParams: URLSearchParams): ActivityQuery {
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

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw validationError("request");
  }
}

function activityResultErrorResponse(
  result: ActivityRouteResultError,
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

function activityRouteErrorResponse(error: unknown): NextResponse {
  const { body, status } = mapActivityRouteError(error);

  return NextResponse.json(body, {
    status,
    headers: privateNoStoreHeaders,
  });
}

function mapActivityRouteError(
  error: unknown,
): ActivityRouteErrorResponse {
  if (error instanceof LeadActivityRepositoryInputError) {
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
