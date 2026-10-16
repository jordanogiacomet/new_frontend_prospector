import { type NextRequest, NextResponse } from "next/server";

import { subjectSchema } from "../../../lib/validators/commercial";
import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  paginatedSuccessResponse,
} from "../../../server/api/errors";
import { requirePermission } from "../../../server/auth/require-api-session";
import { isDemoDataEnabled } from "../../../server/demo/mode";
import { listDemoCommercialWorkQueue } from "../../../server/demo/prospecta-demo-data";
import { resolveLeadReadVisibility } from "../../../server/leads/lead-read-visibility";
import {
  listCommercialWorkQueue,
  type CommercialWorkQueueFilters,
} from "../../../server/commercial/work-queue-repository";
import { getServerEnv } from "../../../server/env";
import {
  commercialStages,
  commercialWorkQueueSorts,
  type CommercialWorkQueueSort,
} from "../../../types/commercial";

const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

const allowedQueryKeys = [
  "page",
  "pageSize",
  "cnpj_normalizado",
  "uf",
  "priority",
  "commercial_stage",
  "responsible_subject",
  "sort",
] as const;

const brazilianUfs = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const approvedProducerPriorities = ["B", "C", "D", "E", "R"] as const;

interface WorkQueueQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly filters: CommercialWorkQueueFilters;
  readonly sort: CommercialWorkQueueSort;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requirePermission("commercial:read");
    const environment = getServerEnv();
    requireCommercialFeatureEnabled(environment.FEATURE_COMMERCIAL_ENABLED);

    const query = parseWorkQueueQuery(request.nextUrl.searchParams);
    const demoDataEnabled = isDemoDataEnabled();
    const canReadApproachDrafts =
      authorization.actor.permissions.includes("leads:read") &&
      authorization.actor.permissions.includes("sensitive:read");
    const approachPreparationEnabled =
      !demoDataEnabled &&
      canReadApproachDrafts &&
      environment.FEATURE_AI_APPROACH_ENABLED &&
      environment.OPENAI_API_KEY !== undefined &&
      environment.OPENAI_APPROACH_MODEL !== undefined;
    const approachAutoGenerationEnabled =
      approachPreparationEnabled && environment.FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED;
    const result = demoDataEnabled
      ? listDemoCommercialWorkQueue({
          page: query.page,
          pageSize: query.pageSize,
          filters: query.filters,
          sort: query.sort,
        })
      : canReadApproachDrafts
        ? await listCommercialWorkQueue(
            {
              actor: { organizationId: authorization.actor.organizationId },
              page: query.page,
              pageSize: query.pageSize,
              filters: query.filters,
              sort: query.sort,
            },
            await resolveLeadReadVisibility(authorization.actor),
            { includeApproachDrafts: true, now: new Date() },
          )
        : await listCommercialWorkQueue(
            {
              actor: { organizationId: authorization.actor.organizationId },
              page: query.page,
              pageSize: query.pageSize,
              filters: query.filters,
              sort: query.sort,
            },
            await resolveLeadReadVisibility(authorization.actor),
          );

    return NextResponse.json(
      paginatedSuccessResponse(result.items, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        provenance: result.provenance,
        approachAutoGenerationEnabled,
        approachPreparationEnabled,
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

function requireCommercialFeatureEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function parseWorkQueueQuery(searchParams: URLSearchParams): WorkQueueQuery {
  const allowedKeys = new Set<string>(allowedQueryKeys);

  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key)) {
      throw validationError(key);
    }
  }

  for (const key of allowedQueryKeys) {
    if (searchParams.getAll(key).length > 1) {
      throw validationError(key);
    }
  }

  const cnpjNormalizado = parseCnpjNormalizado(
    searchParams.get("cnpj_normalizado"),
  );
  const uf = parseOptionalOneOf(
    searchParams.get("uf"),
    "uf",
    brazilianUfs,
  );
  const priority = parseOptionalOneOf(
    searchParams.get("priority"),
    "priority",
    approvedProducerPriorities,
  );
  const commercialStage = parseOptionalOneOf(
    searchParams.get("commercial_stage"),
    "commercial_stage",
    commercialStages,
  );
  const responsibleSubject = parseResponsibleSubject(
    searchParams.get("responsible_subject"),
  );
  const filters: CommercialWorkQueueFilters = {
    ...(cnpjNormalizado !== undefined
      ? { cnpj_normalizado: cnpjNormalizado }
      : {}),
    ...(uf !== undefined ? { uf } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(commercialStage !== undefined
      ? { commercial_stage: commercialStage }
      : {}),
    ...(responsibleSubject !== undefined
      ? { responsible_subject: responsibleSubject }
      : {}),
  };

  return {
    page: parsePositiveIntegerQuery(
      searchParams.get("page"),
      "page",
      defaultPage,
      maximumPage,
    ),
    pageSize: parsePositiveIntegerQuery(
      searchParams.get("pageSize"),
      "pageSize",
      defaultPageSize,
      maximumPageSize,
    ),
    filters,
    sort: parseSort(searchParams.get("sort")),
  };
}

function parsePositiveIntegerQuery(
  value: string | null,
  field: string,
  fallback: number,
  maximum: number,
): number {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw validationError(field);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw validationError(field);
  }

  return parsed;
}

function parseCnpjNormalizado(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  if (!/^\d{14}$/.test(value)) {
    throw validationError("cnpj_normalizado");
  }

  return value;
}

function parseResponsibleSubject(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const result = subjectSchema.safeParse(value);

  if (!result.success) {
    throw validationError("responsible_subject");
  }

  return result.data;
}

function parseSort(value: string | null): CommercialWorkQueueSort {
  if (value === null) {
    return "last_analysis_desc";
  }

  if (!isOneOf(commercialWorkQueueSorts, value)) {
    throw validationError("sort");
  }

  return value;
}

function parseOptionalOneOf<Values extends readonly string[]>(
  value: string | null,
  field: string,
  allowedValues: Values,
): Values[number] | undefined {
  if (value === null) {
    return undefined;
  }

  if (!isOneOf(allowedValues, value)) {
    throw validationError(field);
  }

  return value;
}

function isOneOf<Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return (
    typeof value === "string" &&
    (values as readonly string[]).includes(value)
  );
}

function validationError(field: string): ApiValidationError {
  return new ApiValidationError([{ path: [field] }]);
}
