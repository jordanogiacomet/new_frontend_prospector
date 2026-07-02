import { type NextRequest, NextResponse } from "next/server";

import { leadListQuerySchema } from "../../../lib/validators/lead-query";
import {
  mapApiError,
  paginatedSuccessResponse,
} from "../../../server/api/errors";
import { requireApiSession } from "../../../server/auth/require-api-session";
import { listLeads } from "../../../server/repositories/lead-list-repository";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireApiSession();

    const query = leadListQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    const { leads, total } = await listLeads(query);
    const totalPages =
      total === 0 ? 0 : Math.ceil(total / query.pageSize);

    return NextResponse.json(
      paginatedSuccessResponse(leads, {
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
