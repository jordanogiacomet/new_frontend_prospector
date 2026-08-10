import { type NextRequest, NextResponse } from "next/server";

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
import {
  contactEnrichmentRequestSchema,
  contactEnrichmentResponse,
} from "../../../server/contact-enrichment/contact-enrichment-contract";
import { submitContactEnrichment } from "../../../server/contact-enrichment/submit-contact-enrichment";
import { getServerEnv } from "../../../server/env";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;
const maximumBodyBytes = 4 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("contacts:enrich");
    requireSameOrigin(request);
    const environment = getServerEnv();

    if (!environment.FEATURE_CONTACT_ENRICHMENT_ENABLED) {
      throw new SafeApiError("ACCESS_DENIED");
    }

    const idempotencyKey = readIdempotencyKey(request);
    requireJsonRequest(request);
    requireBoundedBody(request);
    const body = await readJson(request);
    const parsed = contactEnrichmentRequestSchema.safeParse(body);

    if (!parsed.success) throw parsed.error;

    const result = await submitContactEnrichment(
      {
        organizationId: authorization.actor.organizationId,
        actor: authorization.actor,
        idempotencyKey,
        request: parsed.data,
      },
      { ingressClient: { fetch: globalThis.fetch } },
    );

    if (result.kind === "conflict") {
      return NextResponse.json(
        {
          error: {
            code: "CONTACT_ENRICHMENT_IDEMPOTENCY_CONFLICT",
            message:
              "Esta solicitação conflita com um enriquecimento já registrado.",
          },
        },
        { status: 409, headers: privateNoStoreHeaders },
      );
    }

    return NextResponse.json(
      successResponse(contactEnrichmentResponse(result.request)),
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

function requireJsonRequest(request: NextRequest): void {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new ApiValidationError([{ path: ["request"] }]);
  }
}

function requireBoundedBody(request: NextRequest): void {
  const value = request.headers.get("Content-Length");
  if (value === null) return;

  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0 || length > maximumBodyBytes) {
    throw new ApiValidationError([{ path: ["request"] }]);
  }
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiValidationError([{ path: ["request"] }]);
  }
}
