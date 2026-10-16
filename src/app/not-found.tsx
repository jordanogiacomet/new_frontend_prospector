import { ApplicationRecovery } from "../components/application/application-recovery";

export default function NotFound() {
  return (
    <ApplicationRecovery
      title="Página não encontrada"
      description="O endereço não corresponde a uma página disponível. Volte ao início para continuar sua consulta."
    />
  );
}
