import "server-only";

import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { contactEnrichmentCallbackSchema } from "../../../../server/contact-enrichment/contact-enrichment-contract";
import { recordContactEnrichmentCallback } from "../../../../server/contact-enrichment/contact-enrichment-repository";
import { getServerEnv } from "../../../../server/env";

const machineSecretHeader = "X-Prospecta-Contact-Callback-Secret";
const maximumBodyBytes = 8 * 1024;
const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment = getServerEnv();

  if (
    !environment.FEATURE_CONTACT_ENRICHMENT_ENABLED ||
    environment.N8N_CONTACT_CALLBACK_SECRET === undefined
  ) {
    return errorResponse(
      503,
      "CONTACT_ENRICHMENT_CALLBACK_DISABLED",
      "Recebimento de enriquecimento indisponível.",
    );
  }

  if (
    !hasValidMachineSecret(
      request.headers.get(machineSecretHeader),
      environment.N8N_CONTACT_CALLBACK_SECRET,
    )
  ) {
    return errorResponse(
      401,
      "CONTACT_ENRICHMENT_CALLBACK_UNAUTHORIZED",
      "Evento de enriquecimento não autorizado.",
    );
  }

  if (!isJsonRequest(request) || !hasBoundedBody(request)) {
    return invalidCallbackResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidCallbackResponse();
  }

  const parsed = contactEnrichmentCallbackSchema.safeParse(body);
  if (!parsed.success) return invalidCallbackResponse();

  try {
    const result = await recordContactEnrichmentCallback({
      organizationId: environment.AUTH_ALLOWED_ORG_ID,
      requestId: parsed.data.request_id,
      status: parsed.data.status,
      occurredAt: new Date(parsed.data.occurred_at),
    });

    switch (result.kind) {
      case "recorded":
        return NextResponse.json(
          {
            data: {
              recorded: true,
              replayed: false,
              status: result.request.status,
            },
          },
          { headers: privateNoStoreHeaders },
        );
      case "replayed":
        return NextResponse.json(
          {
            data: {
              recorded: false,
              replayed: true,
              status: result.request.status,
            },
          },
          { headers: privateNoStoreHeaders },
        );
      case "conflict":
        return errorResponse(
          409,
          "CONTACT_ENRICHMENT_CALLBACK_CONFLICT",
          "O evento de enriquecimento conflita com o registro existente.",
        );
      case "not_found":
        return errorResponse(
          404,
          "CONTACT_ENRICHMENT_CALLBACK_NOT_FOUND",
          "Solicitação de enriquecimento não encontrada.",
        );
    }
  } catch {
    return errorResponse(
      503,
      "CONTACT_ENRICHMENT_CALLBACK_UNAVAILABLE",
      "Não foi possível registrar o evento de enriquecimento agora.",
    );
  }
}

function hasValidMachineSecret(
  received: string | null,
  expected: string,
): boolean {
  if (received === null) return false;

  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function isJsonRequest(request: NextRequest): boolean {
  return Boolean(
    request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json"),
  );
}

function hasBoundedBody(request: NextRequest): boolean {
  const value = request.headers.get("Content-Length");
  if (value === null) return true;

  const length = Number(value);
  return (
    Number.isSafeInteger(length) && length >= 0 && length <= maximumBodyBytes
  );
}

function invalidCallbackResponse(): NextResponse {
  return errorResponse(
    400,
    "CONTACT_ENRICHMENT_CALLBACK_INVALID",
    "Evento de enriquecimento inválido.",
  );
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
