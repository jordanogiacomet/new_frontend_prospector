import { type NextRequest, NextResponse } from "next/server";

import { SafeApiError, mapApiError, successResponse } from "../../../../../server/api/errors";
import { requirePermission, requireSameOrigin } from "../../../../../server/auth/require-api-session";
import { applyContactRetention } from "../../../../../server/contact-enrichment-v2/contact-enrichment-v2-service";
import { hasVerifiedHttpsTransport } from "../../../../../server/contact-enrichment-v2/contact-transport";
import { getServerEnv } from "../../../../../server/env";

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("contacts:govern");
    requireSameOrigin(request);
    if (!getServerEnv().FEATURE_CONTACT_DATA_ENABLED) {
      throw new SafeApiError("ACCESS_DENIED");
    }
    if (!hasVerifiedHttpsTransport(request)) {
      return NextResponse.json(
        { error: { code: "CONTACT_DATA_HTTPS_REQUIRED", message: "Retenção de contatos requer conexão segura." } },
        { status: 503, headers: privateNoStoreHeaders },
      );
    }
    const result = await applyContactRetention(authorization.actor);
    return NextResponse.json(successResponse(result), { headers: privateNoStoreHeaders });
  } catch (error) {
    const { body, status } = mapApiError(error);
    return NextResponse.json(body, { status, headers: privateNoStoreHeaders });
  }
}
