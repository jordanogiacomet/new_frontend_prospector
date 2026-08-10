import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  SafeApiError,
  mapApiError,
  successResponse,
} from "../../../../../../server/api/errors";
import { requirePermission } from "../../../../../../server/auth/require-api-session";
import { getContactCompanySearch } from "../../../../../../server/contact-enrichment-v2/contact-company-search-service";
import { hasVerifiedHttpsTransport } from "../../../../../../server/contact-enrichment-v2/contact-transport";
import { getServerEnv } from "../../../../../../server/env";

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" } as const;

export async function GET(
  request: NextRequest,
  context: {
    readonly params: Promise<{ readonly searchRequestId: string }>;
  },
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("contacts:read");
    const environment = getServerEnv();
    if (!environment.FEATURE_CONTACT_DATA_ENABLED) {
      throw new SafeApiError("ACCESS_DENIED");
    }
    if (!hasVerifiedHttpsTransport(request)) {
      return errorResponse(
        503,
        "CONTACT_DATA_HTTPS_REQUIRED",
        "Visualização da empresa requer conexão segura.",
      );
    }

    const searchRequestId = z.uuid().parse(
      (await context.params).searchRequestId,
    );
    const result = await getContactCompanySearch(
      { actor: authorization.actor, searchRequestId },
      environment,
    );
    if (result === null) {
      return errorResponse(
        404,
        "CONTACT_COMPANY_SEARCH_NOT_FOUND",
        "Busca de empresa não encontrada.",
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
