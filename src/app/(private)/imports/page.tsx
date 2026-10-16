"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { usePrivateCapabilities } from "../../../components/auth/private-capabilities";
import { usePendingPageAction } from "../../../components/application/use-pending-page-action";
import { useImportCompanyNotices } from "../../../components/imports/import-company-notices";

const uploadEndpoint = "/api/imports";
const uploadFieldName = "arquivo_csv";
const maximumUploadMegabytes = 10;
const maximumUploadBytes = maximumUploadMegabytes * 1024 * 1024;
const approvedCsvMediaTypes = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

function subscribeToHydration(): () => void {
  return () => undefined;
}

function clientHydrationSnapshot(): boolean {
  return true;
}

function serverHydrationSnapshot(): boolean {
  return false;
}

type UploadStatus =
  | { kind: "idle" }
  | { kind: "selected" }
  | { kind: "loading" }
  | { kind: "acknowledged"; submissionId: string | null }
  | {
      kind: "unknown";
      submissionId: string | null;
      appRecordConfirmed: boolean;
      reason?: "network" | "invalid_response" | "server";
    }
  | { kind: "conflict" }
  | { kind: "validationError"; message: string }
  | { kind: "auth_required" }
  | { kind: "access_denied" };

interface ImportApiSuccessPayload {
  readonly data: {
    readonly submissionId: string;
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImportSuccessPayload(
  value: unknown,
): value is ImportApiSuccessPayload {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    !isUuid(value.data.submissionId)
  ) {
    return false;
  }

  const outcome = value.data.producerOutcome;

  if (outcome === "acknowledged") {
    const acknowledgement = value.data.workflowAcknowledgement;
    return (
      isRecord(acknowledgement) &&
      typeof acknowledgement.import_batch_id === "string" &&
      acknowledgement.import_batch_id.trim().length > 0 &&
      Number.isSafeInteger(acknowledgement.row_count) &&
      Number(acknowledgement.row_count) >= 0 &&
      typeof acknowledgement.acknowledgedAt === "string" &&
      Number.isFinite(Date.parse(acknowledgement.acknowledgedAt)) &&
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
  return (
    /^[^/\\\0]+\.csv$/i.test(file.name) &&
    !/^\.csv$/i.test(file.name) &&
    file.name.length <= 255
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
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
  const { hasPermission } = usePrivateCapabilities();
  const watchImportCompanies = useImportCompanyNotices();
  const canReadImports = hasPermission("imports:read");
  const clientReady = useSyncExternalStore(
    subscribeToHydration,
    clientHydrationSnapshot,
    serverHydrationSnapshot,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const reopenNoticeRef = useRef<HTMLButtonElement>(null);
  const closeNoticeRef = useRef<HTMLButtonElement>(null);
  const submissionStartedRef = useRef(false);
  const [attemptKey, setAttemptKey] = useState(createIdempotencyKey);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const confirmedSubmissionId = status.kind === "acknowledged" || (status.kind === "unknown" && status.appRecordConfirmed)
    ? status.submissionId : null;
  useEffect(() => {
    if (confirmedSubmissionId !== null && canReadImports) {
      return watchImportCompanies(confirmedSubmissionId);
    }
  }, [confirmedSubmissionId, canReadImports, watchImportCompanies]);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [noticeStarted, setNoticeStarted] = useState(false);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const blockNavigation = useCallback(() => {
    setNavigationBlocked(true);
    setNoticeVisible(true);
  }, []);
  usePendingPageAction(status.kind === "loading", formRef, blockNavigation);
  const controlsLocked =
    !clientReady || isTerminalStatus(status) || status.kind === "loading";
  const canSubmit = selectedFile !== null && status.kind === "selected";

  if (!hasPermission("imports:create")) {
    return <ReadOnlyImports canReadImports={canReadImports} />;
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    if (submissionStartedRef.current || controlsLocked) return;
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

    const mediaType = file.type.split(";", 1)[0].trim().toLowerCase();
    const metadataError =
      !approvedCsvMediaTypes.has(mediaType)
        ? "O tipo do arquivo não é aceito. Selecione um CSV exportado da EmpresaAqui."
        : !Number.isSafeInteger(file.size) || file.size <= 0
          ? "O arquivo está vazio. Selecione um CSV com cabeçalho e conteúdo."
          : file.size > maximumUploadBytes
            ? `O arquivo ultrapassa o limite de ${maximumUploadMegabytes} MiB. Selecione um arquivo menor.`
            : null;

    if (metadataError !== null) {
      setSelectedFile(null);
      setStatus({ kind: "validationError", message: metadataError });
      return;
    }

    setSelectedFile(file);
    setStatus({ kind: "selected" });
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (controlsLocked || submissionStartedRef.current) {
      return;
    }

    if (selectedFile === null) {
      setStatus({
        kind: "validationError",
        message: "Escolha um arquivo CSV antes de enviar.",
      });
      return;
    }

    const formData = new FormData();
    formData.set(uploadFieldName, selectedFile);
    submissionStartedRef.current = true;
    setStatus({ kind: "loading" });
    setNoticeStarted(true);
    setNoticeVisible(true);
    let responseReceived = false;

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
      responseReceived = true;

      if (response.status === 202) {
        const payload: unknown = await response.json();

        if (!isImportSuccessPayload(payload)) {
          setStatus({
            kind: "unknown",
            submissionId: null,
            appRecordConfirmed: false,
            reason: "invalid_response",
          });
          return;
        }

        const submissionId = payload.data.submissionId;

        setStatus(
          payload.data.producerOutcome === "acknowledged"
            ? { kind: "acknowledged", submissionId }
            : {
                kind: "unknown",
                submissionId,
                appRecordConfirmed: true,
              },
        );
        return;
      }

      if (response.ok) {
        setStatus({
          kind: "unknown",
          submissionId: null,
          appRecordConfirmed: false,
          reason: "invalid_response",
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
          message: response.status === 413
            ? "O arquivo ultrapassa o limite permitido. Selecione um arquivo menor."
            : "Revise o formato CSV, a codificação UTF-8 e a presença do cabeçalho antes de iniciar outra tentativa.",
        });
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setStatus({ kind: response.status === 401 ? "auth_required" : "access_denied" });
        return;
      }

      if (response.status >= 500) {
        setStatus({
          kind: "unknown",
          submissionId: null,
          appRecordConfirmed: false,
          reason: "server",
        });
        return;
      }

      setStatus({ kind: "unknown", submissionId: null, appRecordConfirmed: false, reason: "invalid_response" });
    } catch {
      setStatus({
        kind: "unknown",
        submissionId: null,
        appRecordConfirmed: false,
        reason: responseReceived ? "invalid_response" : "network",
      });
    } finally {
      // A response must surface even when the pending panel was hidden.
      setNoticeVisible(true);
      setNavigationBlocked(false);
    }
  }

  function startNewAttempt(): void {
    submissionStartedRef.current = false;
    setAttemptKey(createIdempotencyKey());
    setSelectedFile(null);
    setStatus({ kind: "idle" });
    setNoticeStarted(false);
    setNoticeVisible(false);

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto w-full max-w-[86rem]">
      {noticeStarted && noticeVisible ? (
        <aside
          aria-label="Aviso da importação"
          className="mb-6 ml-auto w-full max-w-sm border border-[var(--prospecta-border)] bg-[var(--prospecta-surface)] p-4 shadow-lg sm:fixed sm:right-5 sm:bottom-5 sm:z-40 sm:mb-0 sm:max-h-[45svh] sm:overflow-y-auto"
        >
          <div className="flex items-center gap-3">
            {status.kind === "loading" ? <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-[var(--prospecta-accent)] border-r-transparent motion-reduce:animate-none" /> : null}
            <p className="text-sm font-bold">{status.kind === "loading" ? "Enviando importação…" : status.kind === "acknowledged" ? "Envio registrado; recebimento confirmado" : status.kind === "unknown" ? status.appRecordConfirmed ? "Envio registrado; confirmação pendente" : "Registro do envio não confirmado" : "Envio bloqueado; confira a orientação"}</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--prospecta-ink-muted)]">
            {status.kind === "loading"
              ? "Ocultar este aviso não cancela o envio. Aguarde nesta página; não há garantia de continuidade após sair, recarregar ou fechar a aba."
              : "Consulte o retorno e o próximo passo na seção abaixo do formulário."}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {status.kind !== "loading" ? <a href="#resultado-importacao" className="ui-action ui-action--quiet">Ver resultado</a> : null}
            <button ref={closeNoticeRef} type="button" className="ui-action ui-action--quiet" onClick={() => {
              setNoticeVisible(false);
              queueMicrotask(() => reopenNoticeRef.current?.focus());
            }}>Ocultar aviso</button>
          </div>
        </aside>
      ) : null}
      <header className="max-w-4xl">
        <p className="text-xs font-bold tracking-[0.2em] text-[oklch(45%_0.105_174)] uppercase">
          Importar empresas
        </p>
        <h1 className="operational-title mt-4">
          Enviar CSV EmpresaAqui
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-[oklch(43%_0.03_252)]">
          Importe uma lista por vez e acompanhe a análise das empresas nas
          importações registradas.
        </p>
        {canReadImports ? <Link
          href="/imports/batches"
          className="mt-7 inline-flex min-h-11 items-center border-b border-[oklch(45%_0.105_174)] px-1 text-sm font-bold text-[oklch(37%_0.095_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:text-[oklch(24%_0.035_252)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] motion-reduce:transition-none"
        >
          Ver importações registradas
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link> : null}
      </header>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <form
            ref={formRef}
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
                    aria-describedby={`arquivo-csv-orientacao arquivo-csv-estado${status.kind === "validationError" ? " resultado-importacao" : ""}`}
                    aria-invalid={status.kind === "validationError" || undefined}
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
            {status.kind === "loading" ? <p className="mt-2 text-sm leading-6">Aguarde a resposta nesta página. O arquivo e os controles ficam bloqueados para evitar outro envio.</p> : null}
            {navigationBlocked ? <p role="alert" className="mt-3 text-sm font-semibold">Aguarde o retorno antes de sair. O envio continua nesta página.</p> : null}
            {noticeStarted && !noticeVisible ? <button ref={reopenNoticeRef} type="button" className="ui-action ui-action--quiet mt-3" onClick={() => {
              setNoticeVisible(true);
              queueMicrotask(() => closeNoticeRef.current?.focus());
            }}>Reabrir aviso</button> : null}
            {!clientReady ? (
              <p role="status" className="mt-3 text-sm leading-6">Preparando formulário…</p>
            ) : null}
          </form>

          <ResultState status={status} canReadImports={canReadImports} onNewAttempt={startNewAttempt} />
        </div>

        <aside aria-label="Orientação da importação" className="border-y border-[oklch(82%_0.025_82)] py-8 xl:py-7">
          <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
            Como funciona
          </p>
          <ol className="mt-5 list-decimal space-y-4 pl-5 text-sm leading-6 text-[oklch(43%_0.03_252)]">
            <li>Escolha um CSV exportado da EmpresaAqui.</li>
            <li>Envie uma única vez e aguarde a confirmação nesta tela.</li>
            <li>{canReadImports ? "Acompanhe a importação. Consulte o histórico antes de qualquer novo envio." : "Peça ao responsável para acompanhar a importação e verificar o histórico antes de qualquer novo envio."}</li>
          </ol>
        </aside>
      </div>
    </div>
  );
}

function ReadOnlyImports({ canReadImports }: { readonly canReadImports: boolean }) {
  return (
    <section className="mx-auto w-full max-w-[86rem] border-y border-[oklch(82%_0.025_82)] py-10">
      <p className="text-xs font-bold tracking-[0.16em] text-[oklch(45%_0.105_174)] uppercase">
        Consulta de importações
      </p>
      <h1 className="mt-3 font-serif text-[clamp(2.4rem,6vw,4rem)] leading-tight tracking-[-0.04em]">
        {canReadImports ? "Importações registradas" : "Importação sem permissão"}
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[oklch(43%_0.03_252)]">
        {canReadImports
          ? "Seu perfil pode consultar os envios registrados, mas não iniciar uma nova importação."
          : "Seu perfil não permite importar ou consultar envios. Solicite ao responsável a verificação do seu acesso."}
      </p>
      {canReadImports ? <Link href="/imports/batches" className="ui-action ui-action--primary mt-6">
        Consultar importações
      </Link> : <Link href="/inicio" className="ui-action ui-action--quiet mt-6">Voltar ao início</Link>}
    </section>
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
  canReadImports,
  onNewAttempt,
}: {
  readonly status: UploadStatus;
  readonly canReadImports: boolean;
  readonly onNewAttempt: () => void;
}) {
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isTerminalStatus(status)) {
      resultRef.current?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
    }
  }, [status]);

  if (!isTerminalStatus(status)) {
    return null;
  }

  const message = resultMessage(status, canReadImports);
  const isError =
    status.kind === "conflict" ||
    status.kind === "validationError" ||
    status.kind === "auth_required" ||
    status.kind === "access_denied";
  const submissionId =
    status.kind === "acknowledged" || status.kind === "unknown"
      ? status.submissionId
      : null;

  return (
    <section
      ref={resultRef}
      id="resultado-importacao"
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
      {status.kind === "auth_required" ? (
        <Link href="/login" className="ui-action ui-action--primary mt-6">Entrar novamente</Link>
      ) : canReadImports && submissionId !== null ? (
        <Link
          href={`/imports/batches/${encodeURIComponent(submissionId)}`}
          className="ui-action ui-action--primary mt-6"
        >
          Acompanhar importação
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link>
      ) : canReadImports && status.kind === "unknown" ? (
        <Link
          href="/imports/batches"
          className="ui-action ui-action--primary mt-6"
        >
          Consultar importações registradas
          <span aria-hidden="true" className="ml-1">
            →
          </span>
        </Link>
      ) : null}
      {status.kind === "unknown" || status.kind === "auth_required" || status.kind === "access_denied" ? null : (
        <button
          type="button"
          onClick={onNewAttempt}
          className="ui-action ui-action--secondary mt-6 ml-3"
        >
          {status.kind === "acknowledged" ? "Importar outro arquivo" : "Nova tentativa"}
        </button>
      )}
    </section>
  );
}

function isTerminalStatus(status: UploadStatus): boolean {
  return [
    "acknowledged",
    "unknown",
    "conflict",
    "validationError",
    "auth_required",
    "access_denied",
  ].includes(status.kind);
}

function resultMessage(status: UploadStatus, canReadImports: boolean): {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
} {
  switch (status.kind) {
    case "acknowledged":
      return {
        kicker: "Retorno recebido",
        title: "Envio recebido",
        body: "O envio foi registrado e o recebimento foi confirmado. Acompanhe a importação para saber quando os resultados estiverem disponíveis.",
      };
    case "unknown":
      return {
        kicker: "Retorno pendente",
        title: "Resultado desconhecido",
        body: (status.appRecordConfirmed
          ? "O envio foi registrado, mas o recebimento ainda não foi confirmado. "
          : "Não foi possível confirmar o registro deste envio. " +
            (status.reason === "network" ? "A conexão não retornou uma resposta; o motivo não foi informado. "
              : status.reason === "invalid_response" ? "A resposta recebida não pôde ser validada. "
                : status.reason === "server" ? "O serviço retornou um erro; o motivo não foi informado. " : "Motivo não informado. ") +
            "O arquivo foi preservado nesta tela. ") + (canReadImports
            ? "Consulte as importações registradas antes de enviar o arquivo novamente."
            : "Solicite ao responsável o acesso ao histórico antes de enviar o arquivo novamente."),
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
    case "auth_required":
      return {
        kicker: "Acesso expirado",
        title: "Sua sessão expirou",
        body: "Entre novamente para continuar. O arquivo foi preservado nesta tela e nenhum novo envio será iniciado automaticamente.",
      };
    case "access_denied":
      return {
        kicker: "Acesso restrito",
        title: "Importação sem permissão",
        body: "Seu acesso não permite enviar este arquivo. Solicite ao responsável a verificação das suas permissões. Nenhum novo envio será iniciado.",
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
