import { type NextRequest, NextResponse } from "next/server";

import {
  leadDetailParamsSchema,
  leadDetailQuerySchema,
  leadRunIdSchema,
} from "../../../../../lib/validators/lead-query";
import {
  mapApiError,
  SafeApiError,
  successResponse,
} from "../../../../../server/api/errors";
import {
  requirePermission,
  requireSameOrigin,
} from "../../../../../server/auth/require-api-session";
import { isDemoDataEnabled } from "../../../../../server/demo/mode";
import { getDemoLeadDetail } from "../../../../../server/demo/prospecta-demo-data";
import { getServerEnv } from "../../../../../server/env";
import { resolveLeadReadVisibility } from "../../../../../server/leads/lead-read-visibility";
import {
  generateLeadApproachMessage,
  LEAD_APPROACH_GENERATOR_VERSION,
  LeadApproachGenerationError,
} from "../../../../../server/lead-approach/generate-lead-approach";
import { listLeadApproachDraftStates } from "../../../../../server/lead-approach/lead-approach-draft-repository";
import { prepareLeadApproachMessage } from "../../../../../server/lead-approach/prepare-lead-approach";
import { getLeadDetail } from "../../../../../server/repositories/lead-detail-repository";
import { getSensitiveContentAccess } from "../../../../../server/sensitive-content/access";
import type { LeadDetail } from "../../../../../types/leads";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface LeadApproachRouteContext {
  params: Promise<{ cnpj: string }>;
}

export async function GET(
  request: NextRequest,
  context: LeadApproachRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("leads:read");
    if (!authorization.actor.permissions.includes("sensitive:read")) {
      throw new SafeApiError("ACCESS_DENIED");
    }

    const { cnpj } = leadDetailParamsSchema.parse(await context.params);
    const { leadRunId } = leadDetailQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    const selectedLeadRunId = leadRunIdSchema.parse(leadRunId);

    if (isDemoDataEnabled()) {
      return NextResponse.json(
        successResponse({ status: "missing" as const, message: null }),
        { headers: privateNoStoreHeaders },
      );
    }

    const states = await listLeadApproachDraftStates({
      organizationId: authorization.actor.organizationId,
      generatorVersion: LEAD_APPROACH_GENERATOR_VERSION,
      identities: [
        {
          cnpjNormalizado: cnpj,
          observedLeadRunId: selectedLeadRunId,
        },
      ],
      now: new Date(),
    });
    const state = states[0];

    return NextResponse.json(
      successResponse(
        state?.status === "ready"
          ? { status: "ready" as const, message: state.message }
          : {
              status: state?.status ?? ("missing" as const),
              message: null,
            },
      ),
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

export async function POST(
  request: NextRequest,
  context: LeadApproachRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("leads:read");
    if (!authorization.actor.permissions.includes("sensitive:read")) {
      throw new SafeApiError("ACCESS_DENIED");
    }
    requireSameOrigin(request);

    const environment = getServerEnv();
    if (
      !environment.FEATURE_AI_APPROACH_ENABLED ||
      environment.OPENAI_API_KEY === undefined ||
      environment.OPENAI_APPROACH_MODEL === undefined
    ) {
      throw new SafeApiError("ACCESS_DENIED");
    }

    const { cnpj } = leadDetailParamsSchema.parse(await context.params);
    const { leadRunId } = leadDetailQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    let detail: LeadDetail | null;

    if (isDemoDataEnabled()) {
      detail = getDemoLeadDetail(cnpj, leadRunId);
    } else {
      const sensitiveAccess = getSensitiveContentAccess(
        authorization.actor,
      );
      detail = await getLeadDetail(
        cnpj,
        leadRunId,
        sensitiveAccess,
        await resolveLeadReadVisibility(authorization.actor),
      );
    }

    if (detail === null) {
      throw new SafeApiError("LEAD_NOT_FOUND");
    }

    const configuration = {
      apiKey: environment.OPENAI_API_KEY,
      model: environment.OPENAI_APPROACH_MODEL,
      timeoutMilliseconds: environment.OPENAI_APPROACH_TIMEOUT_MS,
    } as const;
    const generated = isDemoDataEnabled()
      ? {
          status: "ready" as const,
          ...(await generateLeadApproachMessage(detail, configuration)),
        }
      : await prepareLeadApproachMessage(
          detail,
          {
            organizationId: authorization.actor.organizationId,
            actorSubject: authorization.actor.subject,
          },
          configuration,
        );

    if (generated.status === "preparing") {
      return NextResponse.json(
        successResponse({ status: "preparing" as const }),
        { status: 202, headers: privateNoStoreHeaders },
      );
    }

    return NextResponse.json(successResponse({ message: generated.message }), {
      headers: privateNoStoreHeaders,
    });
  } catch (error) {
    const safeError =
      error instanceof LeadApproachGenerationError
        ? new SafeApiError("DATA_SOURCE_UNAVAILABLE")
        : error;
    const { body, status } = mapApiError(safeError);

    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}
