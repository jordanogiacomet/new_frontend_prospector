"use client";

import { ApplicationRecovery, type ApplicationErrorProps } from "../components/application/application-recovery";

export default function GlobalError({ reset }: ApplicationErrorProps) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "oklch(97% 0.012 82)", color: "oklch(24% 0.035 252)", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <title>Página indisponível | Prospecta</title>
        <ApplicationRecovery
          title="Não foi possível abrir esta página"
          description="O aplicativo está indisponível nesta tela. Tente abrir novamente ou volte ao início. Se a interrupção continuar, informe ao responsável pelo ambiente."
          interruptedSubmission
          reset={reset}
        />
      </body>
    </html>
  );
}
