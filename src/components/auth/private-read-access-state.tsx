import Link from "next/link";

export function PrivateReadAccessState({
  status,
  headingLevel = "h1",
}: {
  readonly status: "auth_required" | "access_denied";
  readonly headingLevel?: "h1" | "h3";
}) {
  const expired = status === "auth_required";
  const Heading = headingLevel;

  return (
    <section role="alert" className="mx-auto w-full max-w-4xl border-y border-[oklch(82%_0.025_82)] py-10">
      <p className="text-xs font-bold uppercase text-[oklch(45%_0.105_174)]">{expired ? "Acesso expirado" : "Acesso restrito"}</p>
      <Heading className="mt-4 font-serif text-3xl tracking-[-0.03em]">{expired ? "Sua sessão expirou" : "Acesso não autorizado"}</Heading>
      <p className="mt-5 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {expired ? "Entre novamente para continuar. As consultas foram interrompidas." : "Seu perfil não permite esta consulta. Solicite ao responsável a verificação do seu acesso."}
      </p>
      <Link href={expired ? "/login" : "/inicio"} className="ui-action ui-action--primary mt-6">
        {expired ? "Entrar novamente" : "Voltar ao início"}
      </Link>
    </section>
  );
}
