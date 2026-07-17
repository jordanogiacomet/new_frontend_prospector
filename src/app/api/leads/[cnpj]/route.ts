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
import { requirePermission } from "../../../../server/auth/require-api-session";
import {
  isDemo2TestRunVisibilityEnabled,
  isDemoDataEnabled,
} from "../../../../server/demo/mode";
import { getDemoLeadDetail } from "../../../../server/demo/prospecta-demo-data";
import { applyLeadDetailAuditAccess } from "../../../../server/mappers/lead-audit-access";
import { getLeadDetail } from "../../../../server/repositories/lead-detail-repository";
import { getSensitiveContentAccess } from "../../../../server/sensitive-content/access";
import type { LeadDetail } from "../../../../types/leads";

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
    const authorization = await requirePermission("leads:read");

    const { cnpj } = leadDetailParamsSchema.parse(
      await context.params,
    );
    const { leadRunId } = leadDetailQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    let detail: LeadDetail | null;

    if (isDemoDataEnabled()) {
      detail = getDemoLeadDetail(cnpj, leadRunId);
    } else {
      const sensitiveAccess = getSensitiveContentAccess(authorization.actor);

      detail = isDemo2TestRunVisibilityEnabled()
        ? await getLeadDetail(cnpj, leadRunId, sensitiveAccess, {
            includeDemo2TestRuns: true,
          })
        : await getLeadDetail(cnpj, leadRunId, sensitiveAccess);
    }

    if (detail === null) {
      throw new SafeApiError("LEAD_NOT_FOUND");
    }

    const visibleDetail = applyLeadDetailAuditAccess(
      detail,
      authorization.actor.permissions.includes("audit:read"),
    );

    return NextResponse.json(successResponse(visibleDetail), {
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
