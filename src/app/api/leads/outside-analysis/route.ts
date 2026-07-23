import { type NextRequest, NextResponse } from "next/server";

import { outsideAnalysisQuerySchema } from "../../../../lib/validators/lead-query";
import {
  mapApiError,
  paginatedSuccessResponse,
} from "../../../../server/api/errors";
import { requirePermission } from "../../../../server/auth/require-api-session";
import { resolveLeadReadVisibility } from "../../../../server/leads/lead-read-visibility";
import { listOutsideAnalysisCompanies } from "../../../../server/repositories/outside-analysis-repository";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("leads:read");
    const query = outsideAnalysisQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    const { companies, total } = await listOutsideAnalysisCompanies(
      query,
      await resolveLeadReadVisibility(authorization.actor),
    );
    const totalPages =
      total === 0 ? 0 : Math.ceil(total / query.pageSize);

    return NextResponse.json(
      paginatedSuccessResponse(companies, {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
      }),
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
