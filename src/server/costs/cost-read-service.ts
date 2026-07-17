import "server-only";

import type { CostCoverage, CostOverview } from "../../types/costs";
import {
  listCorrelatedImportBatchIds,
} from "../repositories/imports/import-submissions-repository";
import {
  listProducerRunCosts,
  type ProducerRunCostPage,
} from "../repositories/costs/cost-read-repository";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;
const MAX_ORGANIZATION_ID_LENGTH = 128;

export interface ListCostOverviewInput {
  readonly organizationId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface CostReadServiceOperations {
  readonly listCorrelatedImportBatchIds: typeof listCorrelatedImportBatchIds;
  readonly listProducerRunCosts: typeof listProducerRunCosts;
}

export interface CostReadServiceDependencies {
  readonly operations?: Partial<CostReadServiceOperations>;
}

export class CostReadServiceInputError extends Error {
  readonly code = "INVALID_COST_READ_INPUT";

  constructor() {
    super("Invalid cost read input.");
    this.name = "CostReadServiceInputError";
  }
}

const defaultOperations: CostReadServiceOperations = {
  listCorrelatedImportBatchIds,
  listProducerRunCosts,
};

export async function listCostOverview(
  input: ListCostOverviewInput,
  dependencies: CostReadServiceDependencies = {},
): Promise<CostOverview> {
  const pagination = validateInput(input);
  const operations = resolveOperations(dependencies);
  const importBatchIds = await operations.listCorrelatedImportBatchIds({
    organizationId: input.organizationId,
  });

  if (importBatchIds.length === 0) {
    return {
      runs: [],
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: 0,
      subtotalEstimatedUsd: null,
      coverage: "EMPTY",
    };
  }

  const costs = await operations.listProducerRunCosts({
    importBatchIds,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });

  return {
    runs: costs.runs,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: costs.total,
    subtotalEstimatedUsd: costs.subtotalEstimatedUsd,
    coverage: coverageFor(costs),
  };
}

function resolveOperations(
  dependencies: CostReadServiceDependencies,
): CostReadServiceOperations {
  return {
    ...defaultOperations,
    ...(dependencies.operations ?? {}),
  };
}

function validateInput(input: ListCostOverviewInput): {
  readonly page: number;
  readonly pageSize: number;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.organizationId !== "string" ||
    input.organizationId.trim() !== input.organizationId ||
    input.organizationId.length === 0 ||
    input.organizationId.length > MAX_ORGANIZATION_ID_LENGTH
  ) {
    throw new CostReadServiceInputError();
  }

  const page = input.page ?? DEFAULT_PAGE;
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new CostReadServiceInputError();
  }

  return { page, pageSize };
}

function coverageFor(costs: ProducerRunCostPage): CostCoverage {
  if (costs.total === 0) {
    return "EMPTY";
  }

  if (costs.availableCount === costs.total) {
    return "COMPLETE";
  }

  return costs.availableCount > 0 ? "PARTIAL" : "UNKNOWN";
}
