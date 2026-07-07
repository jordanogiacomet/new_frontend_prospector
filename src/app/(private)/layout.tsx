import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerAuthorization, signOut } from "../../server/auth";
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

  return (
    <div className="min-h-svh bg-[oklch(97%_0.012_82)] text-[oklch(24%_0.035_252)] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <a
        href="#conteudo-principal"
        className="fixed left-4 top-4 z-50 -translate-y-24 bg-[oklch(97%_0.012_82)] px-4 py-3 text-sm font-bold text-[oklch(24%_0.035_252)] transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-[oklch(77%_0.09_174)] motion-reduce:transition-none"
      >
        Pular para o conteúdo principal
      </a>

      <header className="flex border-b border-[oklch(35%_0.05_246)] bg-[oklch(22%_0.052_246)] px-5 py-5 text-[oklch(94%_0.018_85)] sm:px-8 lg:min-h-svh lg:flex-col lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
        <div className="flex w-full flex-wrap items-center gap-x-8 gap-y-5 lg:block">
          <Link
            href="/leads"
            className="flex min-h-11 items-center gap-3 text-sm font-semibold tracking-[0.1em] uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(77%_0.09_174)]"
          >
            <BrandMark />
            <span>Inteligência comercial</span>
          </Link>

          <PrivateNavigation />
        </div>

        <div className="mt-6 ml-auto flex items-center gap-4 border-l border-[oklch(38%_0.045_246)] pl-5 lg:mt-auto lg:ml-0 lg:block lg:border-t lg:border-l-0 lg:pt-6 lg:pl-0">
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
        className="min-w-0 px-5 py-8 focus:outline-none sm:px-8 sm:py-10 lg:px-[clamp(3rem,6vw,6rem)] lg:py-12"
      >
        {children}
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
