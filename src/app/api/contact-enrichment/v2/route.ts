import { type NextRequest, NextResponse } from "next/server";

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
import { readBoundedJson } from "../../../../server/contact-enrichment-v2/bounded-json";
import { contactPreviewRequestSchema } from "../../../../server/contact-enrichment-v2/contact-enrichment-v2-contract";
import { submitContactPreview } from "../../../../server/contact-enrichment-v2/contact-enrichment-v2-service";
import { hasVerifiedHttpsTransport } from "../../../../server/contact-enrichment-v2/contact-transport";
import { getServerEnv } from "../../../../server/env";

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("contacts:enrich");
    requireSameOrigin(request);
    const environment = getServerEnv();
    if (!environment.FEATURE_CONTACT_DATA_ENABLED) {
      throw new SafeApiError("ACCESS_DENIED");
    }
    if (!hasVerifiedHttpsTransport(request)) {
      return errorResponse(503, "CONTACT_DATA_HTTPS_REQUIRED", "Recuperação de contatos requer conexão segura.");
    }

    const idempotencyKey = readIdempotencyKey(request);
    const { body } = await readBoundedJson(request, 4 * 1024);
    const parsed = contactPreviewRequestSchema.safeParse(body);
    if (!parsed.success) throw parsed.error;

    const result = await submitContactPreview(
      {
        actor: authorization.actor,
        idempotencyKey,
        request: parsed.data,
      },
      environment,
    );
    if (result.kind === "conflict") {
      return errorResponse(
        409,
        "CONTACT_PREVIEW_IDEMPOTENCY_CONFLICT",
        "Esta solicitação conflita com uma busca já registrada.",
      );
    }
    if (result.kind === "unavailable") {
      return errorResponse(
        409,
        "CONTACT_COMPANY_MATCH_UNAVAILABLE",
        "A empresa selecionada não está mais disponível. Faça uma nova busca.",
      );
    }

    return NextResponse.json(
      successResponse({
        requestId: result.request.requestId,
        status: result.request.status,
        requestedAt: result.request.requestedAt.toISOString(),
        updatedAt: result.request.updatedAt.toISOString(),
      }),
      {
        status: result.kind === "duplicate" ? 200 : 202,
        headers: privateNoStoreHeaders,
      },
    );
  } catch (error) {
    const { body, status } = mapApiError(error);
    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}

function readIdempotencyKey(request: NextRequest): string {
  const value = request.headers.get("Idempotency-Key");
  if (
    value === null ||
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value
  ) {
    throw new ApiValidationError([{ path: ["idempotencyKey"] }]);
  }
  return value;
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
