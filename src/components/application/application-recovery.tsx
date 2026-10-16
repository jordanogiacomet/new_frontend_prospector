"use client";

import Link from "next/link";

import styles from "./application-recovery.module.css";

export interface ApplicationErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

interface ApplicationRecoveryProps {
  readonly title: string;
  readonly description: string;
  readonly reset?: () => void;
  readonly interruptedSubmission?: boolean;
}

export function ApplicationRecovery({
  title,
  description,
  reset,
  interruptedSubmission = false,
}: ApplicationRecoveryProps) {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.brand}>
          <svg aria-hidden="true" viewBox="0 0 32 32" width="32" height="32" fill="none">
            <path d="M16 3 29 16 16 29 3 16 16 3Z" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9 16h14M16 9v14" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="16" cy="16" r="3" fill="currentColor" />
          </svg>
          <span>Prospecta</span>
        </div>

        <section role={reset ? "alert" : undefined}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
          {interruptedSubmission ? (
            <p className={styles.notice}>
              Se esta interrupção aconteceu após enviar um CSV, consulte as
              importações registradas antes de enviar novamente. Esta tela não
              confirma o resultado do envio.
            </p>
          ) : null}
        </section>

        <div className={styles.actions}>
          {reset ? (
            <button type="button" onClick={() => reset()} className={`${styles.action} ${styles.primary}`}>
              Tentar abrir novamente
            </button>
          ) : null}
          <Link href="/inicio" className={styles.action}>Voltar ao início</Link>
          <Link href="/ajuda" className={styles.action}>Consultar ajuda</Link>
        </div>
      </div>
    </main>
  );
}
