"use client";

import { ApplicationRecovery, type ApplicationErrorProps } from "../components/application/application-recovery";

export default function ApplicationError({ reset }: ApplicationErrorProps) {
  return (
    <ApplicationRecovery
      title="Não foi possível abrir esta página"
      description="Tente abrir a página novamente ou volte ao início. Se a interrupção continuar, informe ao responsável pelo ambiente qual tela você estava usando."
      interruptedSubmission
      reset={reset}
    />
  );
}
