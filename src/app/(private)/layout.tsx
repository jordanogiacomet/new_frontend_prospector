import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuthorization, signOut } from "../../server/auth";
import { PrivateCapabilitiesProvider } from "../../components/auth/private-capabilities";
import { ImportCompanyNoticesProvider } from "../../components/imports/import-company-notices";
import { isDemoDataEnabled } from "../../server/demo/mode";
import { PrivateNavigation } from "./private-navigation";

export const dynamic = "force-dynamic";

interface PrivateLayoutProps {
  children: React.ReactNode;
}

async function endSession() {
  "use server";

  await signOut({ redirectTo: "/login" });
}

export default async function PrivateLayout({
  children,
}: PrivateLayoutProps) {
  const authorization = await getServerAuthorization();

  if (
    authorization.status === "missing" ||
    authorization.status === "expired"
  ) {
    redirect("/login");
  }

  if (authorization.status === "unauthorized") {
    return <AccessDenied />;
  }

  const permissions = authorization.actor.permissions;
  const showDemoNotice = isDemoDataEnabled();
  const showLeads = permissions.includes("leads:read");
  const showImports =
    permissions.includes("imports:read") ||
    permissions.includes("imports:create");
  const showCosts = permissions.includes("costs:read");
  const importsHref = permissions.includes("imports:create")
    ? "/imports"
    : "/imports/batches";

  return (
    <div className="min-h-svh bg-[oklch(97%_0.012_82)] text-[oklch(24%_0.035_252)] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#conteudo-principal"
        className="fixed left-4 top-4 z-50 -translate-y-24 bg-[oklch(97%_0.012_82)] px-4 py-3 text-sm font-bold text-[oklch(24%_0.035_252)] transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-[oklch(77%_0.09_174)] motion-reduce:transition-none"
      >
        Pular para o conteúdo principal
      </a>

      <header className="flex flex-wrap border-b border-[oklch(35%_0.05_246)] bg-[oklch(22%_0.052_246)] px-5 py-5 text-[oklch(94%_0.018_85)] sm:px-8 lg:sticky lg:top-0 lg:h-svh lg:flex-col lg:flex-nowrap lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
        <div className="flex w-full flex-wrap items-center gap-x-8 gap-y-4 lg:block">
          <Link
            href="/inicio"
            aria-label="Prospecta, página inicial"
            className="flex min-h-11 items-center gap-3 text-sm font-semibold tracking-[0.1em] uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(77%_0.09_174)]"
          >
            <BrandMark />
            <span>
              <span className="block text-base tracking-[0.12em]">Prospecta</span>
              <span className="mt-1 block text-[0.6rem] tracking-[0.08em] text-[oklch(84%_0.025_246)]">Inteligência comercial</span>
            </span>
          </Link>

          <PrivateNavigation
            importsHref={importsHref}
            showCosts={showCosts}
            showImports={showImports}
            showLeads={showLeads}
          />
        </div>

        <div className="mt-4 flex w-full items-center justify-between gap-4 lg:mt-auto lg:block lg:border-t lg:border-[oklch(38%_0.045_246)] lg:pt-6">
          <p className="flex items-center gap-2 text-xs font-semibold text-[oklch(84%_0.025_246)]">
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-[oklch(77%_0.09_174)]"
            />
            Sessão autorizada
          </p>

          <form action={endSession} className="lg:mt-5">
            <button
              type="submit"
              className="min-h-11 border border-[oklch(48%_0.065_246)] px-4 py-2 text-sm font-bold transition-colors hover:border-[oklch(77%_0.09_174)] hover:bg-[oklch(27%_0.06_246)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(77%_0.09_174)] active:bg-[oklch(18%_0.045_246)] motion-reduce:transition-none lg:w-full"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main
        id="conteudo-principal"
        tabIndex={-1}
        className="min-w-0 px-5 py-6 focus:outline-none sm:px-8 sm:py-8 lg:px-[clamp(1.5rem,3vw,3rem)] lg:py-9"
      >
        <PrivateCapabilitiesProvider permissions={permissions}>
          {showDemoNotice ? (
            <p
              role="status"
              aria-label="Ambiente de demonstração"
              className="mb-6 border-l-2 border-[var(--prospecta-accent)] bg-[var(--prospecta-accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--prospecta-accent-dark)]"
            >
              Demonstração com dados fictícios. Disponível somente para consulta.
            </p>
          ) : null}
          <ImportCompanyNoticesProvider>{children}</ImportCompanyNoticesProvider>
        </PrivateCapabilitiesProvider>
      </main>
    </div>
  );
}

function AccessDenied() {
  return (
    <main className="grid min-h-svh bg-[oklch(97%_0.012_82)] text-[oklch(24%_0.035_252)] lg:grid-cols-[minmax(16rem,0.38fr)_minmax(0,1fr)]">
      <div className="relative hidden overflow-hidden bg-[oklch(22%_0.052_246)] lg:block">
        <div
          aria-hidden="true"
          className="absolute -left-32 top-1/2 size-96 -translate-y-1/2 rotate-45 border border-[oklch(74%_0.09_174)] opacity-40"
        />
        <div
          aria-hidden="true"
          className="absolute -left-12 top-1/2 size-56 -translate-y-1/2 rotate-45 border border-[oklch(74%_0.09_174)] opacity-25"
        />
      </div>

      <section
        role="alert"
        className="flex min-h-svh items-center px-6 py-16 sm:px-12 lg:px-[clamp(4rem,9vw,10rem)]"
      >
        <div className="max-w-xl">
          <div className="mb-10 flex items-center gap-3 text-xs font-bold tracking-[0.12em] uppercase">
            <BrandMark />
            <span>Ambiente privado</span>
          </div>
          <p className="text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
            Acesso restrito
          </p>
          <h1 className="mt-5 max-w-[12ch] font-serif text-[clamp(2.8rem,8vw,5.4rem)] leading-[0.98] tracking-[-0.045em] text-balance">
            Acesso não autorizado
          </h1>
          <p className="mt-7 max-w-[42ch] text-base leading-7 text-[oklch(43%_0.03_252)]">
            Seu acesso não está autorizado para este ambiente. Entre com uma
            conta corporativa autorizada ou contate o suporte responsável.
          </p>
          <Link
            href="/login"
            className="mt-9 inline-flex min-h-12 items-center border-b-2 border-[oklch(45%_0.105_174)] px-1 py-3 text-sm font-bold transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
          >
            Voltar para o acesso
          </Link>
        </div>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="size-8 shrink-0"
      fill="none"
    >
      <path
        d="M16 3 29 16 16 29 3 16 16 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9 16h14M16 9v14"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
    </svg>
  );
}
