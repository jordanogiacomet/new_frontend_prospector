import { UNAVAILABLE_LABEL, formatBrazilianDate } from "../../lib/formatters";
import type { LeadAudit } from "../../types/leads";

interface LeadAuditDetailsProps {
  audit: LeadAudit;
}

interface AuditFieldProps {
  label: string;
  testId: string;
  value: string;
}

function formatCacheUsage(value: boolean | null): string {
  if (value === null) {
    return UNAVAILABLE_LABEL;
  }

  return value ? "Sim" : "Não";
}

function AuditField({ label, testId, value }: AuditFieldProps) {
  return (
    <div className="min-w-0 border-t border-[oklch(88%_0.02_82)] pt-4">
      <dt className="text-xs font-bold tracking-[0.09em] text-[oklch(48%_0.025_252)] uppercase">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="mt-2 whitespace-pre-wrap text-sm leading-6 font-semibold [overflow-wrap:anywhere]"
      >
        {value}
      </dd>
    </div>
  );
}

export function LeadAuditDetails({ audit }: LeadAuditDetailsProps) {
  return (
    <section
      aria-label="Auditoria avançada"
      className="border-y border-[oklch(82%_0.025_82)]"
    >
      <details
        data-testid="lead-audit-details"
        className="group py-7"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 font-serif text-2xl tracking-[-0.025em] transition-colors marker:hidden hover:text-[oklch(37%_0.095_174)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none">
          Auditoria avançada
          <span
            aria-hidden="true"
            className="font-sans text-xl transition-transform group-open:rotate-45 motion-reduce:transition-none"
          >
            +
          </span>
        </summary>

        <div
          data-testid="lead-audit-content"
          className="mt-6 border-t border-[oklch(72%_0.035_82)] pt-6"
        >
          <p className="max-w-3xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
            Referências técnicas da análise armazenada, disponíveis para
            conferência e rastreabilidade.
          </p>

          <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
            <AuditField
              label="Identificador da decisão"
              testId="audit-decision-id"
              value={audit.decision_id}
            />
            <AuditField
              label="Lote de importação"
              testId="audit-import-batch-id"
              value={audit.import_batch_id ?? UNAVAILABLE_LABEL}
            />
            <AuditField
              label="Execução da análise"
              testId="audit-lead-run-id"
              value={audit.lead_run_id}
            />
            <AuditField
              label="Linha de origem"
              testId="audit-source-row"
              value={
                audit.source_row === null
                  ? UNAVAILABLE_LABEL
                  : String(audit.source_row)
              }
            />
            <AuditField
              label="Hash da origem"
              testId="audit-source-hash"
              value={audit.source_hash ?? UNAVAILABLE_LABEL}
            />
            <AuditField
              label="Versão do agente"
              testId="audit-agent-version"
              value={audit.agent_version ?? UNAVAILABLE_LABEL}
            />
            <AuditField
              label="Chave de idempotência"
              testId="audit-idempotency-key"
              value={audit.idempotency_key ?? UNAVAILABLE_LABEL}
            />
            <AuditField
              label="Cache utilizado"
              testId="audit-used-cache"
              value={formatCacheUsage(audit.used_cache)}
            />
            <AuditField
              label="Data de validação"
              testId="audit-validated-at"
              value={formatBrazilianDate(audit.validated_at)}
            />
            <AuditField
              label="Data de criação"
              testId="audit-created-at"
              value={formatBrazilianDate(audit.created_at)}
            />
            <AuditField
              label="Última atualização"
              testId="audit-updated-at"
              value={formatBrazilianDate(audit.updated_at)}
            />
            <AuditField
              label="Data de expiração"
              testId="audit-expires-at"
              value={formatBrazilianDate(audit.expires_at)}
            />
          </dl>
        </div>
      </details>
    </section>
  );
}
