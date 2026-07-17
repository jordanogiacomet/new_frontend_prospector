import { type NextRequest, NextResponse } from "next/server";

import { updateLeadWorkspaceRequestSchema } from "../../../../lib/validators/commercial";
import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  successResponse,
} from "../../../../server/api/errors";
import {
  requirePermission,
  requireSameOrigin,
} from "../../../../server/auth/require-api-session";
import { createCommercialAuditActorContext } from "../../../../server/commercial/audit-context";
import {
  LeadWorkspaceRepositoryInputError,
  getLeadWorkspace,
  updateLeadWorkspace,
  type GetLeadWorkspaceResult,
  type UpdateLeadWorkspaceResult,
} from "../../../../server/commercial/workspace-repository";
import { getServerEnv } from "../../../../server/env";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

type WorkspaceDetailRouteStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 500
  | 503;

interface WorkspaceDetailRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

interface WorkspaceDetailRouteErrorResponse {
  readonly status: WorkspaceDetailRouteStatus;
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

type WorkspaceDetailResultError =
  | Extract<GetLeadWorkspaceResult, { readonly kind: "not_found" }>
  | Exclude<UpdateLeadWorkspaceResult, { readonly kind: "updated" }>;

export async function GET(
  _request: NextRequest,
  context: WorkspaceDetailRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:read");
    requireCommercialFeatureEnabled();

    const { id } = parseWorkspaceDetailParams(await context.params);
    const result = await getLeadWorkspace({
      actor: {
        organizationId: authorization.actor.organizationId,
      },
      workspaceId: id,
    });

    if (result.kind === "not_found") {
      return workspaceResultErrorResponse(result);
    }

    return NextResponse.json(successResponse(result.workspace), {
      headers: privateNoStoreHeaders,
    });
  } catch (error) {
    return workspaceDetailRouteErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: WorkspaceDetailRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:write");
    requireSameOrigin(request);
    requireCommercialFeatureEnabled();

    const { id } = parseWorkspaceDetailParams(await context.params);
    const body = await readJsonBody(request);
    const workspaceRequest = updateLeadWorkspaceRequestSchema.parse(body);
    const result = await updateLeadWorkspace({
      actor: {
        ...createCommercialAuditActorContext(authorization.actor),
        permissions: authorization.actor.permissions,
      },
      workspaceId: id,
      request: workspaceRequest,
    });

    if (result.kind !== "updated") {
      return workspaceResultErrorResponse(result);
    }

    return NextResponse.json(
      successResponse(result.workspace, { result: "updated" }),
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    return workspaceDetailRouteErrorResponse(error);
  }
}

function requireCommercialFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_COMMERCIAL_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function parseWorkspaceDetailParams(params: {
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

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw validationError("request");
  }
}

function workspaceResultErrorResponse(
  result: WorkspaceDetailResultError,
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

function workspaceDetailRouteErrorResponse(
  error: unknown,
): NextResponse {
  const { body, status } = mapWorkspaceDetailRouteError(error);

  return NextResponse.json(body, {
    status,
    headers: privateNoStoreHeaders,
  });
}

function mapWorkspaceDetailRouteError(
  error: unknown,
): WorkspaceDetailRouteErrorResponse {
  if (error instanceof LeadWorkspaceRepositoryInputError) {
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
