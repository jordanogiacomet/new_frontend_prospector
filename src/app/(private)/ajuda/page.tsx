import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuthorization } from "../../../server/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajuda | Prospecta",
  description: "Orientações para importar listas e revisar empresas no Prospecta.",
};

export default async function HelpPage() {
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
  const canFindContacts = permissions.includes("leads:read") &&
    permissions.includes("contacts:enrich") && permissions.includes("contacts:read");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.14em] text-[var(--prospecta-accent)] uppercase">Como usar o Prospecta</p>
        <h1 className="operational-title mt-4">Ajuda para importar e analisar</h1>
        <p className="mt-5 text-base leading-7 text-[var(--prospecta-ink-muted)]">
          Envie uma lista, acompanhe a importação e confira as análises antes de
          escolher quais empresas merecem sua atenção.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/inicio" className="ui-action ui-action--quiet">Voltar ao início</Link>
          {permissions.includes("imports:create") ? <Link href="/imports" className="ui-action ui-action--secondary">Importar CSV</Link> : null}
          {permissions.includes("imports:read") ? <Link href="/imports/batches" className="ui-action ui-action--secondary">Consultar importações</Link> : null}
          {permissions.includes("leads:read") ? <Link href="/leads" className="ui-action ui-action--secondary">Analisar empresas</Link> : null}
        </div>
      </header>

      {permissions.some((permission) => ["imports:create", "imports:read", "leads:read"].includes(permission)) ? (
        <section aria-labelledby="primeiros-passos" className="mt-9 border-y border-[var(--prospecta-border)] py-6">
          <h2 id="primeiros-passos" className="text-lg font-bold">Por onde começar</h2>
          <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm leading-6 text-[var(--prospecta-ink-muted)]">
            {permissions.includes("imports:create") ? <li><strong className="text-[var(--prospecta-ink)]">Importe sua lista.</strong> Escolha um CSV EmpresaAqui e envie uma única vez. Aguarde o retorno na mesma tela.</li> : null}
            {permissions.includes("imports:read") ? <li><strong className="text-[var(--prospecta-ink)]">Acompanhe o envio.</strong> Consulte suas importações para conferir a situação e os resultados confirmados.</li> : null}
            {permissions.includes("leads:read") ? <li><strong className="text-[var(--prospecta-ink)]">Revise as empresas.</strong> Comece pelas prioridades B e C. Abra cada empresa para entender a recomendação antes de decidir.</li> : null}
          </ol>
        </section>
      ) : null}

      <div className="mt-9 border-t border-[var(--prospecta-border)]">
        <HelpTopic title="Qual arquivo posso enviar?">
          Um CSV EmpresaAqui por envio, no formato .csv, em texto UTF-8 e com
          cabeçalho. Consulte o limite indicado na tela de importação. Escolha o
          arquivo e clique em Enviar CSV uma única vez. Um novo arquivo exige a
          ação Importar outro arquivo após a confirmação do recebimento.
        </HelpTopic>
        <HelpTopic title="Envio recebido significa análise concluída?">
          Não. A confirmação registra o recebimento e não confirma que todas as
          análises terminaram. Acompanhe a situação nas importações registradas.
          Um aviso de processamento encerrado também não confirma, por si só,
          o resultado de cada empresa.
        </HelpTopic>
        <HelpTopic title="O que fazer se o resultado do envio ficar desconhecido?">
          Mantenha a tela de importação aberta para conservar o arquivo selecionado.
          Consulte as importações registradas antes de qualquer novo envio.
          Recarregar ou sair da tela remove essa seleção; isso não comprova que
          o envio falhou. As ações de atualizar situação e importações apenas
          consultam os registros, sem reenviar o CSV.
        </HelpTopic>
        <HelpTopic title="Como escolher empresas para revisar?">
          Comece pelas prioridades B e C ou abra a lista geral. A prioridade é
          uma orientação da análise existente e não garante uma oportunidade.
          Abra a empresa e confira a recomendação, a confiança, os riscos,
          os sinais e o relatório disponível antes de decidir.
        </HelpTopic>
        <HelpTopic title="O que significa informação não disponível?">
          Uma informação não disponível não significa zero. Ela pode ainda
          não ter sido observada ou estar indisponível para consulta. Algumas
          informações dependem de autorização. Se faltar contexto, mantenha a
          decisão em revisão e consulte novamente mais tarde.
        </HelpTopic>
        {canFindContacts ? (
          <HelpTopic title="Como encontrar contatos de uma empresa?">
            Abra a empresa em Leads e vá à seção Contatos. Confira a empresa
            identificada antes de buscar profissionais. Se necessário, informe
            o domínio ou procure pelo nome da empresa e confirme o resultado.
            Revise os profissionais encontrados e escolha os canais que deseja
            revelar, conforme seu acesso. Buscar ou revelar contatos não envia mensagens.
          </HelpTopic>
        ) : null}
        <HelpTopic title="Como obter acesso ou ajuda?">
          Peça ao responsável pelo ambiente a verificação do seu acesso.
          Para relatar um problema, informe qual tela estava usando e em que
          etapa ocorreu. Evite enviar arquivos de empresas, informações de
          contato ou credenciais junto com o relato.
        </HelpTopic>
      </div>
    </div>
  );
}

function HelpTopic({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <details className="border-b border-[var(--prospecta-border)] py-5">
      <summary className="min-h-11 cursor-pointer py-2 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--prospecta-accent)]">
        {title}
      </summary>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--prospecta-ink-muted)]">{children}</p>
    </details>
  );
}
