import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerAuthorization, signIn } from "../../server/auth";

export const metadata: Metadata = {
  title: "Acesso corporativo | Inteligência comercial",
  description: "Acesso privado ao painel de inteligência comercial.",
};

interface LoginPageProps {
  searchParams: Promise<{
    error?: string | string[];
  }>;
}

async function startCorporateSignIn() {
  "use server";

  await signIn("organization-oidc", {
    redirectTo: "/leads",
  });
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const authorization = await getServerAuthorization();

  if (authorization.status === "authorized") {
    redirect("/leads");
  }

  const { error } = await searchParams;
  const hasAuthenticationError = error !== undefined;

  return (
    <main className="min-h-svh bg-[oklch(97%_0.012_82)] text-[oklch(24%_0.035_252)]">
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.08fr)_minmax(26rem,0.92fr)]">
        <section className="relative hidden overflow-hidden bg-[oklch(22%_0.052_246)] px-[clamp(3rem,7vw,8rem)] py-16 text-[oklch(94%_0.018_85)] lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden="true"
            className="absolute -right-36 -top-40 size-[34rem] rounded-full border border-[oklch(74%_0.09_174)] opacity-40"
          />
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-20 size-[22rem] rounded-full border border-[oklch(74%_0.09_174)] opacity-25"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-0 left-[18%] h-40 w-px bg-[oklch(74%_0.09_174)] opacity-40"
          />

          <div className="relative flex items-center gap-3 text-sm font-semibold tracking-[0.12em] uppercase">
            <BrandMark />
            <span>Inteligência comercial</span>
          </div>

          <div className="relative max-w-[38rem] pb-[clamp(2rem,6vh,5rem)]">
            <p className="mb-6 text-xs font-bold tracking-[0.2em] text-[oklch(77%_0.09_174)] uppercase">
              Ambiente privado
            </p>
            <p className="max-w-[14ch] font-serif text-[clamp(3rem,5vw,5.5rem)] leading-[0.98] tracking-[-0.045em] text-balance">
              Decisões comerciais com contexto.
            </p>
            <div className="mt-10 flex max-w-md items-start gap-4 border-t border-[oklch(38%_0.045_246)] pt-6">
              <span
                aria-hidden="true"
                className="mt-2 block size-2 shrink-0 rounded-full bg-[oklch(77%_0.09_174)]"
              />
              <p className="text-base leading-7 text-[oklch(84%_0.025_246)]">
                Consulte análises qualificadas em um espaço seguro, direto e
                orientado ao negócio.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-svh flex-col px-6 py-8 sm:px-10 sm:py-10 lg:px-[clamp(3rem,7vw,7rem)] lg:py-14">
          <div className="flex items-center gap-3 text-xs font-bold tracking-[0.12em] uppercase lg:justify-end">
            <span className="lg:hidden">
              <BrandMark />
            </span>
            <span>Painel interno</span>
          </div>

          <div className="flex flex-1 items-center py-14 sm:py-20">
            <div className="w-full max-w-md">
              <p className="mb-5 text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
                Entrada segura
              </p>
              <h1 className="font-serif text-[clamp(2.6rem,7vw,4.4rem)] leading-[0.98] tracking-[-0.045em]">
                Acesso corporativo
              </h1>
              <p className="mt-6 max-w-[38ch] text-base leading-7 text-[oklch(43%_0.03_252)]">
                Use sua identidade corporativa para entrar no ambiente
                reservado.
              </p>

              {hasAuthenticationError ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mt-8 border-l-2 border-[oklch(54%_0.17_28)] bg-[oklch(94%_0.025_28)] px-4 py-3 text-sm leading-6 text-[oklch(38%_0.09_28)]"
                >
                  Não foi possível concluir o acesso. Tente novamente ou
                  contate o suporte responsável.
                </div>
              ) : null}

              <form action={startCorporateSignIn} className="mt-9">
                <button
                  type="submit"
                  className="group flex min-h-14 w-full items-center justify-between gap-4 bg-[oklch(25%_0.06_246)] px-5 py-4 text-left text-sm font-bold tracking-[0.01em] text-[oklch(97%_0.012_82)] transition-[background-color,transform] duration-200 ease-out hover:bg-[oklch(31%_0.075_246)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
                >
                  <span>Entrar com acesso corporativo</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-1 motion-reduce:transition-none"
                    fill="none"
                  >
                    <path
                      d="M5 12h13m-5-5 5 5-5 5"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
              </form>

              <p className="mt-5 text-sm leading-6 text-[oklch(48%_0.025_252)]">
                O acesso é restrito a pessoas previamente autorizadas.
              </p>
            </div>
          </div>

          <p className="text-xs leading-5 text-[oklch(52%_0.02_252)]">
            Ambiente protegido · uso exclusivamente corporativo
          </p>
        </section>
      </div>
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
      <circle
        cx="16"
        cy="16"
        r="3"
        fill="currentColor"
      />
    </svg>
  );
}
