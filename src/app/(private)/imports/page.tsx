"use client";

import Link from "next/link";
import { useRef, useState } from "react";

const uploadEndpoint = "/api/imports";
const uploadFieldName = "arquivo_csv";
const maximumUploadMegabytes = 10;

type UploadStatus =
  | { kind: "idle" }
  | { kind: "selected" }
  | { kind: "loading" }
  | { kind: "acknowledged" }
  | { kind: "unknown" }
  | { kind: "conflict" }
  | { kind: "validationError"; message: string }
  | { kind: "accessError" }
  | { kind: "genericError" };

interface ImportApiSuccessPayload {
  readonly data: {
    readonly producerOutcome: "acknowledged" | "unknown";
    readonly workflowAcknowledgement: Record<string, unknown> | null;
    readonly durableAcceptance: null;
  };
}

function createIdempotencyKey(): string {
  const browserCrypto = globalThis.crypto;

  if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  if (browserCrypto && typeof browserCrypto.getRandomValues === "function") {
    browserCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) =>
    byte.toString(16).padStart(2, "0"),
  );

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImportSuccessPayload(
  value: unknown,
): value is ImportApiSuccessPayload {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }

  const outcome = value.data.producerOutcome;

  if (outcome === "acknowledged") {
    return (
      isRecord(value.data.workflowAcknowledgement) &&
      value.data.durableAcceptance === null
    );
  }

  return (
    outcome === "unknown" &&
    value.data.workflowAcknowledgement === null &&
    value.data.durableAcceptance === null
  );
}

function isCsvFilename(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv");
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return new Intl.NumberFormat("pt-BR").format(size) + " bytes";
  }

  return (
    new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    }).format(size / (1024 * 1024)) + " MB"
  );
}

export default function ImportUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attemptKey, setAttemptKey] = useState(createIdempotencyKey);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const controlsLocked = isTerminalStatus(status) || status.kind === "loading";
  const canSubmit = selectedFile !== null && status.kind === "selected";

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = event.currentTarget.files;

    if (files === null || files.length === 0) {
      setSelectedFile(null);
      setStatus({ kind: "idle" });
      return;
    }

    if (files.length !== 1) {
      setSelectedFile(null);
      setStatus({
        kind: "validationError",
        message: "Selecione apenas um arquivo CSV por envio.",
      });
      return;
    }

    const file = files[0];

    if (!isCsvFilename(file)) {
      setSelectedFile(null);
      setStatus({
        kind: "validationError",
        message: "O arquivo precisa estar no formato CSV.",
      });
      return;
    }

    setSelectedFile(file);
    setStatus({ kind: "selected" });
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (selectedFile === null) {
      setStatus({
        kind: "validationError",
        message: "Escolha um arquivo CSV antes de enviar.",
      });
      return;
    }

    const formData = new FormData();
    formData.set(uploadFieldName, selectedFile);
    setStatus({ kind: "loading" });

    try {
      const response = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          "Idempotency-Key": attemptKey,
        },
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 202) {
        const payload: unknown = await response.json();

        if (!isImportSuccessPayload(payload)) {
          setStatus({ kind: "genericError" });
          return;
        }

        setStatus({
          kind:
            payload.data.producerOutcome === "acknowledged"
              ? "acknowledged"
              : "unknown",
        });
        return;
      }

      if (response.status === 409) {
        setStatus({ kind: "conflict" });
        return;
      }

      if (response.status === 400 || response.status === 413) {
        setStatus({
          kind: "validationError",
          message: "Revise o arquivo selecionado e inicie nova tentativa.",
        });
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setStatus({ kind: "accessError" });
        return;
      }

      setStatus({ kind: "genericError" });
    } catch {
      setStatus({ kind: "genericError" });
    }
  }

  function startNewAttempt(): void {
    setAttemptKey(createIdempotencyKey());
    setSelectedFile(null);
    setStatus({ kind: "idle" });

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto w-full max-w-[86rem]">
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
          Importação controlada
        </p>
        <h1 className="mt-4 max-w-[13ch] font-serif text-[clamp(2.7rem,7vw,5rem)] leading-[0.97] tracking-[-0.05em] text-balance">
          Enviar CSV EmpresaAqui
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Envie uma lista por vez pelo Prospecta. A tela registra a tentativa e
          mostra apenas o retorno confirmado.
        </p>
        <Link
          href="/imports/batches"
          className="mt-7 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
        >
          Ver importações registradas
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link>
      </header>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <form
          onSubmit={handleSubmit}
          className="border-y border-[oklch(82%_0.025_82)] py-8"
        >
          <fieldset
            disabled={controlsLocked}
            className="grid gap-6 disabled:opacity-65"
          >
            <div>
              <label
                htmlFor="arquivo-csv"
                className="text-sm font-bold text-[oklch(29%_0.04_252)]"
              >
                Arquivo CSV
              </label>
              <p
                id="arquivo-csv-orientacao"
                className="mt-2 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]"
              >
                Use um único CSV da EmpresaAqui, em UTF-8, com cabeçalho e até
                {` ${maximumUploadMegabytes} MiB`}.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={fileInputRef}
                  id="arquivo-csv"
                  name={uploadFieldName}
                  type="file"
                  accept=".csv,text/csv"
                  aria-describedby="arquivo-csv-orientacao arquivo-csv-estado"
                  onChange={handleFileChange}
                  disabled={controlsLocked}
                  className="min-h-12 min-w-0 flex-1 border border-[oklch(70%_0.035_82)] bg-[oklch(99%_0.006_82)] px-4 py-3 text-sm text-[oklch(29%_0.04_252)] file:mr-4 file:border-0 file:bg-[oklch(24%_0.045_252)] file:px-4 file:py-2 file:text-sm file:font-bold file:text-[oklch(97%_0.012_82)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={!canSubmit || controlsLocked}
                  className="min-h-12 bg-[oklch(24%_0.045_252)] px-5 py-3 text-sm font-bold text-[oklch(97%_0.012_82)] transition-colors hover:bg-[oklch(31%_0.055_252)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] active:bg-[oklch(19%_0.04_252)] disabled:cursor-not-allowed disabled:bg-[oklch(70%_0.018_252)] motion-reduce:transition-none"
                >
                  Enviar CSV
                </button>
              </div>
            </div>
          </fieldset>

          <FileSelectionState file={selectedFile} status={status} />
        </form>

        <aside className="border-y border-[oklch(82%_0.025_82)] py-8 xl:py-7">
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            Orientação
          </p>
          <ul className="mt-5 space-y-4 text-sm leading-6 text-[oklch(43%_0.03_252)]">
            <li>Um arquivo CSV por tentativa.</li>
            <li>Formato aceito: .csv em texto UTF-8.</li>
            <li>Limite atual: até {maximumUploadMegabytes} MiB.</li>
            <li>Uma nova tentativa só começa pelo botão abaixo.</li>
          </ul>
        </aside>
      </div>

      <ResultState status={status} onNewAttempt={startNewAttempt} />
    </div>
  );
}

function FileSelectionState({
  file,
  status,
}: {
  readonly file: File | null;
  readonly status: UploadStatus;
}) {
  if (status.kind === "loading") {
    return (
      <p
        id="arquivo-csv-estado"
        role="status"
        aria-live="polite"
        className="mt-5 text-sm font-semibold text-[oklch(37%_0.095_174)]"
      >
        Enviando CSV...
      </p>
    );
  }

  if (file === null) {
    return (
      <p
        id="arquivo-csv-estado"
        className="mt-5 text-sm text-[oklch(48%_0.025_252)]"
      >
        Nenhum arquivo selecionado.
      </p>
    );
  }

  return (
    <p
      id="arquivo-csv-estado"
      className="mt-5 text-sm font-semibold text-[oklch(29%_0.04_252)]"
    >
      Arquivo selecionado: {file.name} ({formatFileSize(file.size)}).
    </p>
  );
}

function ResultState({
  status,
  onNewAttempt,
}: {
  readonly status: UploadStatus;
  readonly onNewAttempt: () => void;
}) {
  if (!isTerminalStatus(status)) {
    return null;
  }

  const message = resultMessage(status);
  const isError =
    status.kind === "conflict" ||
    status.kind === "validationError" ||
    status.kind === "accessError" ||
    status.kind === "genericError";

  return (
    <section
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={
        isError
          ? "mt-10 border-y border-[oklch(74%_0.08_32)] bg-[oklch(96%_0.025_32)] px-5 py-8"
          : "mt-10 border-y border-[oklch(72%_0.075_174)] bg-[oklch(94%_0.035_174)] px-5 py-8"
      }
    >
      <p
        className={
          isError
            ? "text-xs font-bold tracking-[0.16em] text-[oklch(42%_0.09_32)] uppercase"
            : "text-xs font-bold tracking-[0.16em] text-[oklch(36%_0.08_174)] uppercase"
        }
      >
        {message.kicker}
      </p>
      <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
        {message.title}
      </h2>
      <p
        className={
          isError
            ? "mt-4 max-w-2xl text-sm leading-6 text-[oklch(38%_0.045_32)]"
            : "mt-4 max-w-2xl text-sm leading-6 text-[oklch(32%_0.065_174)]"
        }
      >
        {message.body}
      </p>
      <button
        type="button"
        onClick={onNewAttempt}
        className="mt-7 min-h-12 border-b-2 border-[oklch(45%_0.105_174)] px-1 py-3 text-sm font-bold text-[oklch(24%_0.035_252)] transition-colors hover:border-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[oklch(45%_0.105_174)] active:text-[oklch(18%_0.04_252)] motion-reduce:transition-none"
      >
        Nova tentativa
      </button>
    </section>
  );
}

function isTerminalStatus(status: UploadStatus): boolean {
  return [
    "acknowledged",
    "unknown",
    "conflict",
    "validationError",
    "accessError",
    "genericError",
  ].includes(status.kind);
}

function resultMessage(status: UploadStatus): {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
} {
  switch (status.kind) {
    case "acknowledged":
      return {
        kicker: "Retorno recebido",
        title: "Recebido pelo fluxo",
        body: "A tentativa foi registrada e o fluxo retornou confirmação de recebimento. Nenhum status adicional foi inferido.",
      };
    case "unknown":
      return {
        kicker: "Retorno pendente",
        title: "Resultado desconhecido",
        body: "A tentativa foi registrada, mas a confirmação do fluxo não ficou disponível para esta tela.",
      };
    case "conflict":
      return {
        kicker: "Conflito",
        title: "Conflito de envio",
        body: "Já existe uma tentativa anterior para outro arquivo. Inicie uma nova tentativa antes de reenviar.",
      };
    case "validationError":
      return {
        kicker: "Arquivo não aceito",
        title: "Revise o CSV",
        body: status.message,
      };
    case "accessError":
      return {
        kicker: "Acesso restrito",
        title: "Envio não autorizado",
        body: "Sua sessão não tem acesso a esta operação. Entre novamente ou contate o suporte responsável.",
      };
    case "genericError":
      return {
        kicker: "Envio indisponível",
        title: "Não foi possível enviar agora",
        body: "O app não conseguiu concluir o envio com segurança. Inicie nova tentativa quando decidir reenviar.",
      };
    case "idle":
    case "selected":
    case "loading":
      return {
        kicker: "",
        title: "",
        body: "",
      };
  }
}
