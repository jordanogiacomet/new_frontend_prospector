import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  SafeApiError,
  mapApiError,
  successResponse,
} from "../../../../../server/api/errors";
import { requirePermission } from "../../../../../server/auth/require-api-session";
import { getContactPreview } from "../../../../../server/contact-enrichment-v2/contact-enrichment-v2-service";
import { hasVerifiedHttpsTransport } from "../../../../../server/contact-enrichment-v2/contact-transport";
import { getServerEnv } from "../../../../../server/env";

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" } as const;

export async function GET(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly requestId: string }> },
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("contacts:read");
    const environment = getServerEnv();
    if (!environment.FEATURE_CONTACT_DATA_ENABLED) {
      throw new SafeApiError("ACCESS_DENIED");
    }
    if (!hasVerifiedHttpsTransport(request)) {
      return errorResponse(503, "CONTACT_DATA_HTTPS_REQUIRED", "Visualização de contatos requer conexão segura.");
    }

    const requestId = z.uuid().parse((await context.params).requestId);
    const result = await getContactPreview(
      { actor: authorization.actor, requestId },
      environment,
    );
    if (result === null) {
      return errorResponse(
        404,
        "CONTACT_PREVIEW_NOT_FOUND",
        "Busca de contatos não encontrada.",
      );
    }

    return NextResponse.json(successResponse(result), {
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

function errorResponse(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: privateNoStoreHeaders },
  );
}
