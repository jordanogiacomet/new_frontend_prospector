import { type NextRequest, NextResponse } from "next/server";

import { leadListQuerySchema } from "../../../lib/validators/lead-query";
import {
  mapApiError,
  paginatedSuccessResponse,
} from "../../../server/api/errors";
import { requirePermission } from "../../../server/auth/require-api-session";
import {
  isDemoDataEnabled,
} from "../../../server/demo/mode";
import { listDemoLeads } from "../../../server/demo/prospecta-demo-data";
import { resolveLeadReadVisibility } from "../../../server/leads/lead-read-visibility";
import { applyLeadSummaryAuditAccess } from "../../../server/mappers/lead-audit-access";
import { listLeads } from "../../../server/repositories/lead-list-repository";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("leads:read");

    const query = leadListQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    const { leads, total } = isDemoDataEnabled()
      ? listDemoLeads(query)
      : await listLeads(
          query,
          await resolveLeadReadVisibility(authorization.actor),
        );
    const canReadAudit = authorization.actor.permissions.includes("audit:read");
    const visibleLeads = leads.map((lead) =>
      applyLeadSummaryAuditAccess(lead, canReadAudit),
    );
    const totalPages =
      total === 0 ? 0 : Math.ceil(total / query.pageSize);

    return NextResponse.json(
      paginatedSuccessResponse(visibleLeads, {
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
