import { type NextRequest, NextResponse } from "next/server";

import {
  leadDetailParamsSchema,
  leadDetailQuerySchema,
} from "../../../../../lib/validators/lead-query";
import {
  mapApiError,
  SafeApiError,
  successResponse,
} from "../../../../../server/api/errors";
import { requirePermission } from "../../../../../server/auth/require-api-session";
import { isDemoDataEnabled } from "../../../../../server/demo/mode";
import { getDemoLeadDetail } from "../../../../../server/demo/prospecta-demo-data";
import { resolveLeadReadVisibility } from "../../../../../server/leads/lead-read-visibility";
import { getServerEnv } from "../../../../../server/env";
import { registeredAddressBounds } from "../../../../../server/maps/lead-location-bounds";
import { resolveLeadMunicipalityLocation } from "../../../../../server/maps/lead-location-resolver";
import { resolveLeadRegisteredLocation } from "../../../../../server/maps/lead-registered-location-service";
import { getLeadDetail } from "../../../../../server/repositories/lead-detail-repository";
import type { LeadDetail, LeadMapLocation } from "../../../../../types/leads";

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface LeadLocationMapRouteContext {
  params: Promise<{ cnpj: string }>;
}

export async function GET(
  request: NextRequest,
  context: LeadLocationMapRouteContext,
): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("leads:read");
    const { cnpj } = leadDetailParamsSchema.parse(await context.params);
    const { leadRunId } = leadDetailQuerySchema.parse(
      request.nextUrl.searchParams,
    );
    let detail: LeadDetail | null;

    if (isDemoDataEnabled()) {
      detail = getDemoLeadDetail(cnpj, leadRunId);
    } else {
      detail = await getLeadDetail(
        cnpj,
        leadRunId,
        {
          enabled: false,
          allowedUrlHosts: [],
          now: new Date(),
        },
        await resolveLeadReadVisibility(authorization.actor),
      );
    }

    if (detail === null) {
      throw new SafeApiError("LEAD_NOT_FOUND");
    }

    const environment = getServerEnv();
    const registeredCoordinates = await resolveLeadRegisteredLocation({
      organizationId: authorization.actor.organizationId,
      cnpjNormalizado: cnpj,
      configuration: {
        enabled: environment.FEATURE_REGISTERED_ADDRESS_MAP_ENABLED,
        companyRegistryApiBaseUrl:
          environment.COMPANY_REGISTRY_API_BASE_URL,
        geocodingApiUrl: environment.LEAD_GEOCODING_API_URL,
        postalCodeApiBaseUrl:
          environment.LEAD_POSTAL_CODE_API_BASE_URL,
        geocodingUserAgent: environment.LEAD_GEOCODING_USER_AGENT,
        timeoutMilliseconds: environment.LEAD_LOCATION_LOOKUP_TIMEOUT_MS,
      },
    });

    let location: LeadMapLocation = { status: "unavailable" };
    if (registeredCoordinates !== null) {
      location = {
        status: "available",
        ...registeredCoordinates,
        ...registeredAddressBounds(
          registeredCoordinates.latitude,
          registeredCoordinates.longitude,
        ),
      };
    } else if (detail.city !== null || detail.uf !== null) {
      const coordinates = resolveLeadMunicipalityLocation({
        city: detail.city,
        uf: detail.uf,
      });

      if (coordinates !== null) {
        location = { status: "available", ...coordinates };
      }
    }

    return NextResponse.json(successResponse(location), {
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
