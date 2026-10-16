import { type NextRequest, NextResponse } from "next/server";

import {
  leadDetailParamsSchema,
  outsideAnalysisDetailQuerySchema,
} from "../../../../../lib/validators/lead-query";
import {
  mapApiError,
  SafeApiError,
  successResponse,
} from "../../../../../server/api/errors";
import { requirePermission } from "../../../../../server/auth/require-api-session";
import { resolveLeadReadVisibility } from "../../../../../server/leads/lead-read-visibility";
import { getOutsideAnalysisCompany } from "../../../../../server/repositories/outside-analysis-repository";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface OutsideAnalysisDetailRouteContext {
  params: Promise<{ cnpj: string }>;
}

export async function GET(
  request: NextRequest,
  context: OutsideAnalysisDetailRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("leads:read");
    const { cnpj } = leadDetailParamsSchema.parse(await context.params);

    outsideAnalysisDetailQuerySchema.parse(request.nextUrl.searchParams);

    const company = await getOutsideAnalysisCompany(
      cnpj,
      await resolveLeadReadVisibility(authorization.actor),
    );

    if (company === null) {
      throw new SafeApiError("LEAD_NOT_FOUND");
    }

    return NextResponse.json(successResponse(company), {
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
