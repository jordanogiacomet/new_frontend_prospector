import { type NextRequest, NextResponse } from "next/server";

import {
  ApiValidationError,
  mapApiError,
  SafeApiError,
  successResponse,
} from "../../../../server/api/errors";
import { requireApiSession } from "../../../../server/auth/require-api-session";
import { getServerEnv } from "../../../../server/env";
import {
  getImportBatchDetail,
  type GetImportBatchDetailResult,
} from "../../../../server/imports/batch-read-service";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface ImportDetailRouteContext {
  readonly params: Promise<{
    readonly id?: unknown;
  }>;
}

export async function GET(
  _request: NextRequest,
  context: ImportDetailRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requireApiSession();
    requireImportsFeatureEnabled();

    const { id } = parseImportDetailParams(await context.params);
    const result = await getImportBatchDetail({
      organizationId: authorization.actor.organizationId,
      submissionId: id,
    });

    if (result.kind === "not_found") {
      return importBatchNotFoundResponse(result);
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

function requireImportsFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_IMPORTS_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
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
