import { type NextRequest, NextResponse } from "next/server";

import { createLeadWorkspaceRequestSchema } from "../../../lib/validators/commercial";
import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  successResponse,
} from "../../../server/api/errors";
import {
  requirePermission,
  requireSameOrigin,
} from "../../../server/auth/require-api-session";
import { createCommercialAuditActorContext } from "../../../server/commercial/audit-context";
import {
  LeadWorkspaceRepositoryInputError,
  createLeadWorkspace,
  type CreateLeadWorkspaceResult,
} from "../../../server/commercial/workspace-repository";
import { getServerEnv } from "../../../server/env";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

type WorkspaceRouteStatus = 400 | 401 | 403 | 404 | 409 | 500 | 503;

interface WorkspaceRouteErrorResponse {
  readonly status: WorkspaceRouteStatus;
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:write");
    requireSameOrigin(request);
    requireCommercialFeatureEnabled();

    const body = await readJsonBody(request);
    const workspaceRequest = createLeadWorkspaceRequestSchema.parse(body);

    if (
      workspaceRequest.responsible_subject !== undefined &&
      workspaceRequest.responsible_subject !== null &&
      !authorization.actor.permissions.includes("commercial:assign")
    ) {
      throw new SafeApiError("ACCESS_DENIED");
    }

    const result = await createLeadWorkspace({
      actor: {
        ...createCommercialAuditActorContext(authorization.actor),
        permissions: authorization.actor.permissions,
      },
      request: workspaceRequest,
    });

    return workspaceResultResponse(result);
  } catch (error) {
    const { body, status } = mapWorkspaceRouteError(error);

    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}

function requireCommercialFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_COMMERCIAL_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw validationError("request");
  }
}

function workspaceResultResponse(
  result: CreateLeadWorkspaceResult,
): NextResponse {
  if (result.kind === "conflict") {
    return NextResponse.json(
      {
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      },
      { status: 409, headers: privateNoStoreHeaders },
    );
  }

  return NextResponse.json(
    successResponse(result.workspace, { result: "created" }),
    { status: 201, headers: privateNoStoreHeaders },
  );
}

function mapWorkspaceRouteError(
  error: unknown,
): WorkspaceRouteErrorResponse {
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
