import { type NextRequest, NextResponse } from "next/server";

import {
  leadDetailParamsSchema,
  leadHistoryQuerySchema,
} from "../../../../../lib/validators/lead-query";
import {
  mapApiError,
  paginatedSuccessResponse,
} from "../../../../../server/api/errors";
import { requireApiSession } from "../../../../../server/auth/require-api-session";
import { listLeadHistory } from "../../../../../server/repositories/lead-history-repository";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface LeadHistoryRouteContext {
  params: Promise<{ cnpj: string }>;
}

export async function GET(
  request: NextRequest,
  context: LeadHistoryRouteContext,
): Promise<NextResponse> {
  try {
    await requireApiSession();

    const { cnpj } = leadDetailParamsSchema.parse(
      await context.params,
    );
    const query = leadHistoryQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    const {
      history,
      total,
      completeness,
      label,
      caveat,
    } = await listLeadHistory(cnpj, query);

    return NextResponse.json(
      paginatedSuccessResponse(history, {
        page: query.page,
        pageSize: query.pageSize,
        total,
        completeness,
        label,
        caveat,
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
