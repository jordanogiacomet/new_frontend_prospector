import { UNAVAILABLE_LABEL } from "../../lib/formatters";
import {
  batchResultsHeading,
  batchResultsNarrative,
  hasConfirmedBatchCounts,
} from "../../lib/import-batch-presentation";
import type { BatchSummary } from "../../types/imports";

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function BatchResults({ batch }: { readonly batch: BatchSummary }) {
  return (
    <div className="space-y-2">
      {batch.workflowReportedRowCount === null ? null : (
        <MetricLine label="Linhas informadas" value={batch.workflowReportedRowCount} />
      )}
      {hasConfirmedBatchCounts(batch) ? (
        <BatchMetrics batch={batch} />
      ) : (
        <>
          <p className="font-semibold text-[oklch(24%_0.035_252)]">
            {batchResultsHeading(batch)}
          </p>
          <p className="max-w-sm text-[oklch(43%_0.03_252)]">
            {batchResultsNarrative(batch)}
          </p>
          <details>
            <summary className="cursor-pointer font-semibold text-[oklch(43%_0.03_252)]">
              Contagens detalhadas
            </summary>
            <div className="mt-2">
              <BatchMetrics batch={batch} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function BatchMetrics({ batch }: { readonly batch: BatchSummary }) {
  const metrics = [
    ["Linhas aceitas", batch.rowCountAccepted],
    ["Linhas com resultado", batch.terminalCount],
    ["Leads gerados", batch.leadCount],
    ["Bloqueadas", batch.blockedCount],
    ["Falhas", batch.failedCount],
  ] as const;

  return (
    <div>
      {metrics.map(([label, value]) => (
        <MetricLine key={label} label={label} value={value} />
      ))}
    </div>
  );
}

function MetricLine({ label, value }: {
  readonly label: string;
  readonly value: number | null;
}) {
  return (
    <p>
      <span className="text-[oklch(48%_0.025_252)]">{label}: </span>
      <span className="font-semibold text-[oklch(24%_0.035_252)]">
        {value === null ? UNAVAILABLE_LABEL : numberFormatter.format(value)}
      </span>
    </p>
  );
}
