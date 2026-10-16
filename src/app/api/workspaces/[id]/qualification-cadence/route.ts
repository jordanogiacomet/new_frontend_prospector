import { type NextRequest, NextResponse } from "next/server";

import { qualificationCadenceMutationRequestSchema } from "../../../../../lib/validators/commercial";
import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  successResponse,
} from "../../../../../server/api/errors";
import {
  requirePermission,
  requireSameOrigin,
} from "../../../../../server/auth/require-api-session";
import { createCommercialAuditActorContext } from "../../../../../server/commercial/audit-context";
import {
  QualificationCadenceRepositoryInputError,
  getQualificationCadence,
  recordQualificationContact,
  startQualificationCadence,
  type GetQualificationCadenceResult,
  type RecordQualificationContactResult,
  type StartQualificationCadenceResult,
} from "../../../../../server/commercial/qualification-cadence-repository";
import { getServerEnv } from "../../../../../server/env";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface QualificationCadenceRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

type QualificationCadenceRouteResultError =
  | Extract<GetQualificationCadenceResult, { readonly kind: "not_found" }>
  | Extract<StartQualificationCadenceResult, { readonly kind: "not_found" }>
  | Extract<StartQualificationCadenceResult, { readonly kind: "conflict" }>
  | Extract<RecordQualificationContactResult, { readonly kind: "not_found" }>
  | Extract<RecordQualificationContactResult, { readonly kind: "conflict" }>;

export async function GET(
  request: NextRequest,
  context: QualificationCadenceRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:read");
    requireCommercialFeatureEnabled();

    const workspaceId = parseWorkspaceId(await context.params);
    rejectQueryParameters(request.nextUrl.searchParams);
    const result = await getQualificationCadence({
      actor: { organizationId: authorization.actor.organizationId },
      workspaceId,
    });

    if (result.kind === "not_found") {
      return resultErrorResponse(result);
    }

    return NextResponse.json(successResponse(result.cadence), {
      headers: privateNoStoreHeaders,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: QualificationCadenceRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:write");
    requireSameOrigin(request);
    requireCommercialFeatureEnabled();

    const workspaceId = parseWorkspaceId(await context.params);
    const body = qualificationCadenceMutationRequestSchema.parse(
      await readJsonBody(request),
    );
    const actor = createCommercialAuditActorContext(authorization.actor);

    if (body.action === "start") {
      const result = await startQualificationCadence({
        actor,
        workspaceId,
        request: body,
      });

      if (result.kind !== "started") {
        return resultErrorResponse(result);
      }

      return NextResponse.json(
        successResponse(result.cadence, { result: "started" }),
        { status: 201, headers: privateNoStoreHeaders },
      );
    }

    const result = await recordQualificationContact({
      actor,
      workspaceId,
      request: body,
    });

    if (result.kind !== "recorded") {
      return resultErrorResponse(result);
    }

    return NextResponse.json(
      successResponse(result.cadence, {
        result: "recorded",
        pipelineAction: {
          kind: result.pipelineAction.kind,
          commercial_stage:
            result.pipelineAction.changes.commercialStage ?? null,
        },
      }),
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

function requireCommercialFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_COMMERCIAL_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function parseWorkspaceId(params: { readonly id?: unknown }): string {
  if (
    typeof params.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      params.id,
    )
  ) {
    throw validationError("id");
  }

  return params.id;
}

function rejectQueryParameters(searchParams: URLSearchParams): void {
  const [firstKey] = searchParams.keys();
  if (firstKey !== undefined) {
    throw validationError(firstKey);
  }
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw validationError("request");
  }
}

function resultErrorResponse(
  result: QualificationCadenceRouteResultError,
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

function routeErrorResponse(error: unknown): NextResponse {
  const mapped = mapApiError(
    error instanceof QualificationCadenceRepositoryInputError
      ? validationError("request")
      : error,
  );

  return NextResponse.json(mapped.body, {
    status: mapped.status,
    headers: privateNoStoreHeaders,
  });
}

function validationError(field: string): ApiValidationError {
  return new ApiValidationError([{ path: [field] }]);
}
