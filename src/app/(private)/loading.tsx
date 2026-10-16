export default function Loading() {
  return (
    <section
      role="status"
      aria-label="Carregando página"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto max-w-4xl border-y border-[var(--prospecta-border)] py-10"
    >
      <h2 className="text-xl font-bold">Carregando página</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--prospecta-ink-muted)]">
        Aguarde um instante para continuar sua consulta.
      </p>
    </section>
  );
}
