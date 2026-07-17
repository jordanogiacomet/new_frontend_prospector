export type CostRunAvailability = "AVAILABLE" | "UNKNOWN" | "AMBIGUOUS";

export type CostCoverage = "COMPLETE" | "PARTIAL" | "UNKNOWN" | "EMPTY";

export interface CostRun {
  readonly leadRunId: string;
  readonly availability: CostRunAvailability;
  readonly estimatedCostUsd: string | null;
}

export interface CostOverview {
  readonly runs: readonly CostRun[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly subtotalEstimatedUsd: string | null;
  readonly coverage: CostCoverage;
}
