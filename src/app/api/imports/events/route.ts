import "server-only";

import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "../../../../server/env";
import {
  recordLegacyWorkflowClose,
  type RecordLegacyWorkflowCloseResult,
} from "../../../../server/repositories/imports/legacy-workflow-close-repository";

const machineSecretHeader = "X-Prospecta-N8N-Secret";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

const presentText = (maximumLength: number) =>
  z
    .string()
    .min(1)
    .max(maximumLength)
    .refine((value) => value.trim() === value);

const closeEventSchema = z.strictObject({
  import_batch_id: presentText(128),
  event_type: z.literal("BATCH_CLOSED"),
  occurred_at: z.iso.datetime({ offset: true }),
  payload: z.strictObject({
    closed: z.literal(true),
    status: z.literal("COMPLETED"),
    row_count_expected: z.number().int().positive().safe(),
    source: z.literal("EmpresaAqui"),
    pipeline_version: presentText(128).nullable(),
  }),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment = getServerEnv();

  if (
    !environment.FEATURE_IMPORTS_ENABLED ||
    environment.N8N_IMPORT_EVENT_SECRET === undefined
  ) {
    return errorResponse(
      503,
      "IMPORT_EVENT_RECEIVER_DISABLED",
      "Recebimento de eventos de importação indisponível.",
    );
  }

  if (
    !hasValidMachineSecret(
      request.headers.get(machineSecretHeader),
      environment.N8N_IMPORT_EVENT_SECRET,
    )
  ) {
    return errorResponse(
      401,
      "IMPORT_EVENT_UNAUTHORIZED",
      "Evento de importação não autorizado.",
    );
  }

  if (!isJsonRequest(request)) {
    return invalidEventResponse();
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return invalidEventResponse();
  }

  const parsed = closeEventSchema.safeParse(input);

  if (!parsed.success) {
    return invalidEventResponse();
  }

  try {
    const result = await recordLegacyWorkflowClose({
      organizationId: environment.AUTH_ALLOWED_ORG_ID,
      importBatchId: parsed.data.import_batch_id,
      occurredAt: new Date(parsed.data.occurred_at),
      rowCountExpected: parsed.data.payload.row_count_expected,
    });

    return closeResultResponse(result);
  } catch {
    return errorResponse(
      503,
      "IMPORT_EVENT_UNAVAILABLE",
      "Não foi possível registrar o encerramento agora.",
    );
  }
}

function hasValidMachineSecret(
  received: string | null,
  expected: string,
): boolean {
  if (received === null) {
    return false;
  }

  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function isJsonRequest(request: NextRequest): boolean {
  return request.headers
    .get("Content-Type")
    ?.toLowerCase()
    .startsWith("application/json") === true;
}

function closeResultResponse(
  result: RecordLegacyWorkflowCloseResult,
): NextResponse {
  if (result.kind === "recorded") {
    return NextResponse.json(
      { data: { recorded: true, replayed: false } },
      { headers: privateNoStoreHeaders },
    );
  }

  if (result.kind === "replayed") {
    return NextResponse.json(
      { data: { recorded: false, replayed: true } },
      { headers: privateNoStoreHeaders },
    );
  }

  return errorResponse(
    result.error.httpStatus,
    result.error.code,
    result.error.message,
  );
}

function invalidEventResponse(): NextResponse {
  return errorResponse(
    400,
    "INVALID_IMPORT_EVENT",
    "Evento de importação inválido.",
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
