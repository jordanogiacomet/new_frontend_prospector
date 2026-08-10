import "server-only";

import { type NextRequest, NextResponse } from "next/server";

import { readBoundedJson } from "../../../../../server/contact-enrichment-v2/bounded-json";
import { safeSecretEqual } from "../../../../../server/contact-enrichment-v2/contact-data-crypto";
import { contactPreviewCallbackSchema } from "../../../../../server/contact-enrichment-v2/contact-enrichment-v2-contract";
import { processPreviewCallback } from "../../../../../server/contact-enrichment-v2/contact-enrichment-v2-service";
import { hasVerifiedHttpsTransport } from "../../../../../server/contact-enrichment-v2/contact-transport";
import { getServerEnv } from "../../../../../server/env";

const callbackSecretHeader = "X-Prospecta-Contact-Callback-Secret";
const privateNoStoreHeaders = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment = getServerEnv();
  if (
    !environment.FEATURE_CONTACT_DATA_ENABLED ||
    environment.N8N_CONTACT_CALLBACK_V2_SECRET === undefined
  ) {
    return errorResponse(503, "CONTACT_PREVIEW_CALLBACK_DISABLED", "Recebimento indisponível.");
  }
  if (!hasVerifiedHttpsTransport(request)) {
    return errorResponse(503, "CONTACT_DATA_HTTPS_REQUIRED", "Recebimento requer conexão segura.");
  }

  if (
    !safeSecretEqual(
      request.headers.get(callbackSecretHeader),
      environment.N8N_CONTACT_CALLBACK_V2_SECRET,
    )
  ) {
    return errorResponse(401, "CONTACT_PREVIEW_CALLBACK_UNAUTHORIZED", "Evento não autorizado.");
  }

  let body: unknown;
  try {
    body = (await readBoundedJson(request, 32 * 1024)).body;
  } catch {
    return errorResponse(400, "CONTACT_PREVIEW_CALLBACK_INVALID", "Evento inválido.");
  }
  const parsed = contactPreviewCallbackSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "CONTACT_PREVIEW_CALLBACK_INVALID", "Evento inválido.");
  }

  try {
    return callbackResult(
      await processPreviewCallback(parsed.data, environment),
    );
  } catch {
    return errorResponse(503, "CONTACT_PREVIEW_CALLBACK_UNAVAILABLE", "Recebimento indisponível.");
  }
}

function callbackResult(
  result: Awaited<ReturnType<typeof processPreviewCallback>>,
): NextResponse {
  switch (result.kind) {
    case "recorded":
      return NextResponse.json(
        { data: { recorded: true, replayed: false, status: result.request.status } },
        { headers: privateNoStoreHeaders },
      );
    case "replayed":
      return NextResponse.json(
        { data: { recorded: false, replayed: true, status: result.request.status } },
        { headers: privateNoStoreHeaders },
      );
    case "conflict":
      return errorResponse(409, "CONTACT_PREVIEW_CALLBACK_CONFLICT", "O evento conflita com o registro existente.");
    case "not_found":
      return errorResponse(404, "CONTACT_PREVIEW_CALLBACK_NOT_FOUND", "Solicitação não encontrada.");
  }
}

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: privateNoStoreHeaders },
  );
}
