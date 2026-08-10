import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  SafeApiError,
  mapApiError,
  successResponse,
} from "../../../../../../../server/api/errors";
import {
  requirePermission,
  requireSameOrigin,
} from "../../../../../../../server/auth/require-api-session";
import { readBoundedJson } from "../../../../../../../server/contact-enrichment-v2/bounded-json";
import { contactSuppressionRequestSchema } from "../../../../../../../server/contact-enrichment-v2/contact-enrichment-v2-contract";
import { applyContactSuppression } from "../../../../../../../server/contact-enrichment-v2/contact-enrichment-v2-service";
import { hasVerifiedHttpsTransport } from "../../../../../../../server/contact-enrichment-v2/contact-transport";
import { getServerEnv } from "../../../../../../../server/env";

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" } as const;

export async function POST(
  request: NextRequest,
  context: { readonly params: Promise<{ readonly contactId: string }> },
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("contacts:govern");
    requireSameOrigin(request);
    const environment = getServerEnv();
    if (!environment.FEATURE_CONTACT_DATA_ENABLED) {
      throw new SafeApiError("ACCESS_DENIED");
    }
    if (!hasVerifiedHttpsTransport(request)) {
      return NextResponse.json(
        { error: { code: "CONTACT_DATA_HTTPS_REQUIRED", message: "Governança de contatos requer conexão segura." } },
        { status: 503, headers: privateNoStoreHeaders },
      );
    }

    const contactId = z.uuid().parse((await context.params).contactId);
    const { body } = await readBoundedJson(request, 2 * 1024);
    const parsed = contactSuppressionRequestSchema.safeParse(body);
    if (!parsed.success) throw parsed.error;
    const result = await applyContactSuppression({
      actor: authorization.actor,
      contactId,
      scope: parsed.data.scope,
      reason: parsed.data.reason,
    });
    if (result === "not_found") {
      return NextResponse.json(
        { error: { code: "CONTACT_NOT_FOUND", message: "Contato não encontrado." } },
        { status: 404, headers: privateNoStoreHeaders },
      );
    }

    return NextResponse.json(
      successResponse({ suppressed: true, contactId }),
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    const { body, status } = mapApiError(error);
    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}
