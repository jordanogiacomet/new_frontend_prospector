import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPriorityLabel } from "../../../lib/lead-labels";
import { getServerAuthorization } from "../../../server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Início | Prospecta",
  description: "Atalhos para revisar empresas, importar listas e encontrar contatos.",
};

export default async function StartPage() {
  const authorization = await getServerAuthorization();

  if (authorization.status === "missing" || authorization.status === "expired") {
    redirect("/login");
  }

  if (authorization.status === "unauthorized") {
    return (
      <section role="alert" className="border-y border-[var(--prospecta-border)] py-10">
        <h1 className="operational-title">Acesso não autorizado</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--prospecta-ink-muted)]">
          Solicite ao responsável pelo ambiente a verificação do seu acesso.
        </p>
      </section>
    );
  }

  const permissions = authorization.actor.permissions;
  const canImport = permissions.includes("imports:create");
  const canReadImports = permissions.includes("imports:read");
  const canReadLeads = permissions.includes("leads:read");
  const canFindContacts = canReadLeads &&
    permissions.includes("contacts:enrich") && permissions.includes("contacts:read");
  const canReadCosts = permissions.includes("costs:read");

  if (!canImport && !canReadImports && !canReadLeads && !canReadCosts) {
    return (
      <section role="status" className="border-y border-[var(--prospecta-border)] py-10">
        <h1 className="operational-title">Acesso ao fluxo indisponível</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--prospecta-ink-muted)]">
          Seu perfil ainda não permite importar ou consultar empresas. Solicite
          ao responsável pelo ambiente o acesso necessário para sua rotina.
        </p>
        <Link href="/ajuda" className="ui-action ui-action--quiet mt-4">Consultar ajuda</Link>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.14em] text-[var(--prospecta-accent)] uppercase">
          Seu espaço de trabalho
        </p>
        <h1 className="operational-title mt-4">
          {canReadCosts && !canReadLeads && !canImport && !canReadImports ? "Sua rotina comercial" : "Importar e analisar empresas"}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--prospecta-ink-muted)]">
          {canReadCosts && !canReadLeads && !canImport && !canReadImports
              ? "Consulte os custos estimados das análises disponíveis para seu acesso."
              : "Envie sua lista, acompanhe a análise e escolha quais empresas merecem uma revisão mais próxima."}
        </p>
      </header>

      {canFindContacts ? (
        <section aria-labelledby="rotina-contatos" className="mt-8 flex flex-wrap items-center justify-between gap-5 border border-[var(--prospecta-border)] bg-[var(--prospecta-surface)] p-5 sm:p-6">
          <div className="max-w-xl">
            <p className="text-xs font-bold tracking-[0.12em] text-[var(--prospecta-accent)] uppercase">Rotina do dia</p>
            <h2 id="rotina-contatos" className="mt-2 text-xl font-bold">Encontrar contatos de uma empresa</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--prospecta-ink-muted)]">
              Abra a empresa em Leads e consulte a seção Contatos. Confirme a empresa antes de buscar profissionais e escolha quais canais deseja revelar.
            </p>
          </div>
          <Link href="/leads" className="ui-action ui-action--primary">Escolher empresa</Link>
        </section>
      ) : null}

      {canReadCosts ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/costs" className="ui-action ui-action--quiet">Consultar custos</Link>
          <p className="text-sm text-[var(--prospecta-ink-muted)]">Valores estimados e cobertura das análises.</p>
        </div>
      ) : null}

      {canImport || canReadImports || canReadLeads ? (
      <div className="mt-9 grid gap-x-12 gap-y-9 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <ol aria-label="Roteiro de importação e análise" className="border-t border-[var(--prospecta-border)]">
          <li className="grid gap-3 border-b border-[var(--prospecta-border)] py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
            <span aria-hidden="true" className="text-sm font-bold text-[var(--prospecta-accent)]">01</span>
            <div>
              <h2 className="text-lg font-bold">Importe a lista</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--prospecta-ink-muted)]">
                Use um CSV EmpresaAqui por envio. A tela de importação orienta
                o formato e o limite do arquivo.
              </p>
              {canImport ? (
                <Link href="/imports" className="ui-action ui-action--primary mt-4">Importar CSV</Link>
              ) : (
                <p className="mt-3 text-sm text-[var(--prospecta-ink-muted)]">Seu acesso não permite enviar arquivos.</p>
              )}
            </div>
          </li>

          <li className="grid gap-3 border-b border-[var(--prospecta-border)] py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
            <span aria-hidden="true" className="text-sm font-bold text-[var(--prospecta-accent)]">02</span>
            <div>
              <h2 className="text-lg font-bold">Acompanhe o envio</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--prospecta-ink-muted)]">
                Confira a situação registrada e abra os detalhes do lote. Se o
                resultado do envio ficar desconhecido, consulte o histórico antes de reenviar.
              </p>
              {canReadImports ? (
                <Link href="/imports/batches" className="ui-action ui-action--secondary mt-4">Acompanhar importações</Link>
              ) : (
                <p className="mt-3 text-sm text-[var(--prospecta-ink-muted)]">Seu acesso não permite consultar importações.</p>
              )}
            </div>
          </li>

          <li className="grid gap-3 border-b border-[var(--prospecta-border)] py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
            <span aria-hidden="true" className="text-sm font-bold text-[var(--prospecta-accent)]">03</span>
            <div>
              <h2 className="text-lg font-bold">Revise as empresas</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--prospecta-ink-muted)]">
                Comece pelos recortes de prioridade B e C ou abra a lista geral.
                Confira a recomendação, os riscos e o relatório antes de decidir.
              </p>
              {canReadLeads ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {(["B", "C"] as const).map((priority) => (
                    <Link key={priority} href={`/leads?priority=${priority}`} className="ui-action ui-action--secondary">
                      {getPriorityLabel(priority)}
                    </Link>
                  ))}
                  <Link href="/leads" className="ui-action ui-action--quiet">Ver todas as empresas</Link>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--prospecta-ink-muted)]">Seu acesso não permite consultar análises.</p>
              )}
            </div>
          </li>
        </ol>

        <aside aria-labelledby="orientacao-revisao" className="border-t border-[var(--prospecta-border)] py-6">
          <h2 id="orientacao-revisao" className="font-serif text-2xl">O que vale revisar</h2>
          <p className="mt-4 text-sm leading-6 text-[var(--prospecta-ink-muted)]">
            Prioridade e pontuação são orientações da análise existente: não
            garantem uma oportunidade. Os atalhos B e C apenas filtram essa classificação.
          </p>
          <dl className="mt-6 space-y-5 text-sm leading-6">
            <div>
              <dt className="font-bold">Recomendação e confiança</dt>
              <dd className="mt-1 text-[var(--prospecta-ink-muted)]">Confira a ação sugerida e as ressalvas antes de avançar.</dd>
            </div>
            <div>
              <dt className="font-bold">Riscos, sinais e relatório</dt>
              <dd className="mt-1 text-[var(--prospecta-ink-muted)]">Abra a análise da empresa para entender o contexto disponível.</dd>
            </div>
            <div>
              <dt className="font-bold">Informação indisponível</dt>
              <dd className="mt-1 text-[var(--prospecta-ink-muted)]">Um dado indisponível não significa zero. Se faltar informação, mantenha a decisão em revisão.</dd>
            </div>
          </dl>
        </aside>
      </div>
      ) : null}
    </div>
  );
}
