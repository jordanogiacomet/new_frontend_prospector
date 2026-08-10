import { type NextRequest, NextResponse } from "next/server";

import { SafeApiError, mapApiError, successResponse } from "../../../../../server/api/errors";
import { requirePermission, requireSameOrigin } from "../../../../../server/auth/require-api-session";
import { readBoundedJson } from "../../../../../server/contact-enrichment-v2/bounded-json";
import { contactRightsRequestSchema } from "../../../../../server/contact-enrichment-v2/contact-enrichment-v2-contract";
import { createContactRightsRequest } from "../../../../../server/contact-enrichment-v2/contact-enrichment-v2-service";
import { hasVerifiedHttpsTransport } from "../../../../../server/contact-enrichment-v2/contact-transport";
import { getServerEnv } from "../../../../../server/env";

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("contacts:govern");
    requireSameOrigin(request);
    const environment = getServerEnv();
    if (!environment.FEATURE_CONTACT_DATA_ENABLED) {
      throw new SafeApiError("ACCESS_DENIED");
    }
    if (!hasVerifiedHttpsTransport(request)) {
      return NextResponse.json(
        { error: { code: "CONTACT_DATA_HTTPS_REQUIRED", message: "Direitos de contatos requerem conexão segura." } },
        { status: 503, headers: privateNoStoreHeaders },
      );
    }
    const { body } = await readBoundedJson(request, 2 * 1024);
    const parsed = contactRightsRequestSchema.safeParse(body);
    if (!parsed.success) throw parsed.error;
    const rightsRequestId = await createContactRightsRequest(
      {
        actor: authorization.actor,
        subjectKind: parsed.data.subject_kind,
        subjectValue: parsed.data.subject_value,
        requestType: parsed.data.request_type,
      },
      environment,
    );
    return NextResponse.json(
      successResponse({ rightsRequestId, status: "VERIFIED" as const }),
      { status: 201, headers: privateNoStoreHeaders },
    );
  } catch (error) {
    const { body, status } = mapApiError(error);
    return NextResponse.json(body, { status, headers: privateNoStoreHeaders });
  }
}
