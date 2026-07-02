import { type NextRequest, NextResponse } from "next/server";

import {
  leadDetailParamsSchema,
  leadDetailQuerySchema,
} from "../../../../lib/validators/lead-query";
import {
  mapApiError,
  SafeApiError,
  successResponse,
} from "../../../../server/api/errors";
import { requireApiSession } from "../../../../server/auth/require-api-session";
import { getLeadDetail } from "../../../../server/repositories/lead-detail-repository";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface LeadDetailRouteContext {
  params: Promise<{ cnpj: string }>;
}

export async function GET(
  request: NextRequest,
  context: LeadDetailRouteContext,
): Promise<NextResponse> {
  try {
    await requireApiSession();

    const { cnpj } = leadDetailParamsSchema.parse(
      await context.params,
    );
    const { leadRunId } = leadDetailQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    const detail = await getLeadDetail(cnpj, leadRunId);

    if (detail === null) {
      throw new SafeApiError("LEAD_NOT_FOUND");
    }

    return NextResponse.json(successResponse(detail), {
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
