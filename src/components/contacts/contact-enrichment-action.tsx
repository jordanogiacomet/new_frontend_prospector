"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  calculateContactCommercialScore,
  type ContactCommercialScoreResult,
} from "../../lib/contact-commercial-score";
import { formatScore } from "../../lib/formatters";
import {
  contactApiErrorMessage,
  describeContactRevealStatus,
  isContactRevealStatus,
  describeContactSearchDiagnostic,
  readContactSearchDiagnostics,
} from "../../lib/contact-search-feedback";
import type {
  ContactCandidateDto,
  ContactCompanyMatchDto,
  ContactCompanySearchRequestDto,
  ContactCompanySearchStatus,
  ContactPreviewRequestDto,
  ContactPreviewStatus,
  ContactRevealChannel,
  ContactRevealStatus,
  ContactSearchDiagnosticDto,
} from "../../types/contact-enrichment";
import { usePrivateCapabilities } from "../auth/private-capabilities";

type ActionPhase =
  | "idle"
  | "domain"
  | "company_search_submitting"
  | "company_search_submitted"
  | "company_search_loading"
  | "company_search_available"
  | "company_search_empty"
  | "company_search_expired"
  | "submitting"
  | "submitted"
  | "loading"
  | "available"
  | "empty"
  | "unknown"
  | "denied"
  | "conflict"
  | "error";

interface ContactMutationFeedback {
  readonly kind: "recorded" | "error" | "unknown";
  readonly message: string;
  readonly status?: ContactRevealStatus;
}

interface ContactAttempt {
  readonly phase: ActionPhase;
  readonly domain: string;
  readonly idempotencyKey: string;
  readonly companySearchIdempotencyKey: string;
  readonly companySearchRequestId: string | null;
  readonly companySearchResult: ContactCompanySearchRequestDto | null;
  readonly requestId: string | null;
  readonly result: ContactPreviewRequestDto | null;
  readonly message: string | null;
  readonly accessBlocked: boolean;
  readonly submissionUnconfirmed: boolean;
}

interface ContactAttemptContextValue {
  readonly attempts: Readonly<Record<string, ContactAttempt>>;
  readonly expandedAttemptKey: string | null;
  readonly expand: (key: string) => void;
  readonly collapse: (key: string) => void;
  readonly update: (
    key: string,
    updater: (current: ContactAttempt) => ContactAttempt,
  ) => void;
}

const ContactAttemptContext = createContext<ContactAttemptContextValue | null>(
  null,
);

export function ContactEnrichmentProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [attempts, setAttempts] = useState<
    Readonly<Record<string, ContactAttempt>>
  >({});
  const [expandedAttemptKey, setExpandedAttemptKey] = useState<string | null>(
    null,
  );
  const value = useMemo<ContactAttemptContextValue>(
    () => ({
      attempts,
      expandedAttemptKey,
      expand: setExpandedAttemptKey,
      collapse: (key) =>
        setExpandedAttemptKey((current) => (current === key ? null : current)),
      update: (key, updater) => {
        setAttempts((current) => ({
          ...current,
          [key]: updater(current[key] ?? createAttempt()),
        }));
      },
    }),
    [attempts, expandedAttemptKey],
  );

  return (
    <ContactAttemptContext.Provider value={value}>
      {children}
    </ContactAttemptContext.Provider>
  );
}

export function ContactEnrichmentAction({
  attemptKey,
  companyName,
  companyCity,
  companyState,
  companySector,
  cnpj,
  initialDomain,
  producerScore,
}: {
  readonly attemptKey: string;
  readonly companyName: string | null;
  readonly companyCity: string | null;
  readonly companyState: string | null;
  readonly companySector: string | null;
  readonly cnpj: string;
  readonly initialDomain: string | null;
  readonly producerScore: number | null;
}) {
  const context = useContactAttemptContext();
  const { hasPermission } = usePrivateCapabilities();
  const canEnrich = hasPermission("contacts:enrich");
  const canRead = hasPermission("contacts:read");
  const canReveal = hasPermission("contacts:reveal");
  const canGovern = hasPermission("contacts:govern");
  const attempt = context.attempts[attemptKey] ?? createAttempt();
  const isExpanded = context.expandedAttemptKey === attemptKey;
  const companyLabel = companyName ?? "esta empresa";
  const approvedInitialDomain = normalizeDomain(initialDomain ?? "");
  const actionInFlight = useRef(false);

  if (!canEnrich || !canRead) {
    return (
      <p className="mt-4 text-sm leading-6 text-[oklch(43%_0.03_252)]">
        Seu perfil não permite buscar ou visualizar contatos. Solicite ao
        responsável pelo acesso as permissões necessárias para esta consulta.
      </p>
    );
  }

  function update(
    updater: (current: ContactAttempt) => ContactAttempt,
  ): void {
    context.update(attemptKey, updater);
  }

  function openAttempt(): void {
    context.expand(attemptKey);
    if (attempt.phase === "idle") {
      update((current) => ({
        ...current,
        phase: "domain",
        domain:
          current.domain === "" ? (approvedInitialDomain ?? "") : current.domain,
      }));
    }
  }

  function resetAttempt(): void {
    update(() => ({
      ...createAttempt(),
      phase: "domain",
      domain: approvedInitialDomain ?? attempt.domain,
    }));
  }

  async function showRequestError(
    response: Response,
    phase: "denied" | "conflict" | "error",
    mutation = false,
  ): Promise<void> {
    let message: string | null = null;
    let preflightDenied = false;
    try {
      const payload = await response.json();
      message = contactApiErrorMessage(payload);
      preflightDenied = isRecord(payload) && isRecord(payload.error) && payload.error.code === "CONTACT_DATA_HTTPS_REQUIRED";
    } catch {
      // Unknown response bodies never become user-facing provider diagnostics.
    }
    const unknownSubmission = mutation && !preflightDenied && ![400, 401, 403, 404, 409, 413, 415, 422, 429].includes(response.status);
    update((current) => ({
      ...current,
      phase: unknownSubmission ? "unknown" : current.result?.status === "PREVIEW_AVAILABLE" ? "available"
        : current.companySearchResult?.status === "SEARCH_AVAILABLE" ? "company_search_available"
        : phase,
      message: unknownSubmission ? `${message ? `${message} ` : ""}${unconfirmedContactSubmission}` : message ?? httpContactError(response.status),
      accessBlocked: response.status === 401 || response.status === 403 || current.accessBlocked,
      submissionUnconfirmed: unknownSubmission || current.submissionUnconfirmed,
    }));
  }

  async function submitPreview(): Promise<void> {
    if (actionInFlight.current) return;
    const domain = normalizeDomain(attempt.domain);
    if (domain === null) {
      update((current) => ({
        ...current,
        phase: "domain",
        message: "Informe somente o domínio, como empresa.com.br.",
      }));
      return;
    }

    actionInFlight.current = true;
    update((current) => ({
      ...current,
      phase: "submitting",
      domain,
      message: null,
    }));

    try {
      const response = await fetch("/api/contact-enrichment/v2", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.idempotencyKey,
        },
        body: JSON.stringify({
          cnpj_normalizado: cnpj,
          company_domain: domain,
        }),
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 401 || response.status === 403) {
        await showRequestError(response, "denied");
        return;
      }
      if (response.status === 409) {
        await showRequestError(response, "conflict");
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        await showRequestError(response, "error", true);
        return;
      }

      const payload = parseSubmissionEnvelope(await response.json());
      if (payload === null) {
        update((current) => ({ ...current, phase: "unknown", message: unconfirmedContactSubmission, submissionUnconfirmed: true }));
        return;
      }
      update((current) => ({
        ...current,
        phase:
          payload.status === "DISPATCH_OUTCOME_UNKNOWN"
            ? "unknown"
            : "submitted",
        requestId: payload.requestId,
        result: null,
        message: null,
      }));
    } catch {
      update((current) => ({ ...current, phase: "unknown", message: unconfirmedContactSubmission, submissionUnconfirmed: true }));
    } finally {
      actionInFlight.current = false;
    }
  }

  async function submitCompanySearch(): Promise<void> {
    if (actionInFlight.current) return;
    const normalizedCompanyName = normalizeCompanyName(companyName);
    const normalizedCompanyCity = normalizeCompanyLocationText(companyCity);
    const normalizedCompanyState = normalizeCompanyState(companyState);
    if (normalizedCompanyName === null) {
      update((current) => ({
        ...current,
        phase: "domain",
        message: "Informe o domínio da empresa para continuar.",
      }));
      return;
    }

    actionInFlight.current = true;
    update((current) => ({
      ...current,
      phase: "company_search_submitting",
      message: null,
    }));
    try {
      const response = await fetch(
        "/api/contact-enrichment/v2/company-search",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": attempt.companySearchIdempotencyKey,
          },
          body: JSON.stringify({
            cnpj_normalizado: cnpj,
            company_name: normalizedCompanyName,
            company_city: normalizedCompanyCity,
            company_state: normalizedCompanyState,
            company_country_iso2: "BR",
          }),
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      if (response.status === 401 || response.status === 403) {
        await showRequestError(response, "denied");
        return;
      }
      if (response.status === 409) {
        await showRequestError(response, "conflict");
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        await showRequestError(response, "error", true);
        return;
      }
      const payload = parseCompanySearchSubmissionEnvelope(
        await response.json(),
      );
      if (payload === null) {
        update((current) => ({ ...current, phase: "unknown", message: unconfirmedContactSubmission, submissionUnconfirmed: true }));
        return;
      }
      update((current) => ({
        ...current,
        phase:
          payload.status === "DISPATCH_OUTCOME_UNKNOWN"
            ? "unknown"
            : "company_search_submitted",
        companySearchRequestId: payload.searchRequestId,
        companySearchResult: null,
      }));
    } catch {
      update((current) => ({ ...current, phase: "unknown", message: unconfirmedContactSubmission, submissionUnconfirmed: true }));
    } finally {
      actionInFlight.current = false;
    }
  }

  async function loadCompanyMatches(): Promise<void> {
    if (attempt.companySearchRequestId === null || actionInFlight.current) return;
    actionInFlight.current = true;
    update((current) => ({
      ...current,
      phase: "company_search_loading",
      message: null,
    }));
    try {
      const response = await fetch(
        `/api/contact-enrichment/v2/company-search/${encodeURIComponent(attempt.companySearchRequestId)}`,
        {
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      if (response.status === 401 || response.status === 403) {
        await showRequestError(response, "denied");
        return;
      }
      if (response.status !== 200) {
        await showRequestError(response, "error");
        return;
      }
      const result = parseCompanySearchEnvelope(await response.json());
      if (result === null || result.searchRequestId !== attempt.companySearchRequestId) {
        showReadError();
        return;
      }
      const nextPhase = phaseForCompanySearchResult(result);
      update((current) => ({
        ...current,
        phase: nextPhase,
        companySearchResult: result,
        accessBlocked: false,
        message:
          nextPhase === "company_search_submitted"
            ? "A busca ainda está em processamento. Aguarde alguns segundos e consulte novamente."
            : null,
      }));
    } catch {
      showReadError();
    } finally {
      actionInFlight.current = false;
    }
  }

  async function submitMatchedCompanyPreview(
    match: ContactCompanyMatchDto,
  ): Promise<void> {
    if (actionInFlight.current || attempt.phase === "unknown" || attempt.accessBlocked) return;
    actionInFlight.current = true;
    update((current) => ({
      ...current,
      phase: "submitting",
      message: null,
    }));
    try {
      const response = await fetch("/api/contact-enrichment/v2", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.idempotencyKey,
        },
        body: JSON.stringify({
          cnpj_normalizado: cnpj,
          company_match_id: match.companyMatchId,
        }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401 || response.status === 403) {
        await showRequestError(response, "denied");
        return;
      }
      if (response.status === 409) {
        await showRequestError(response, "conflict");
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        await showRequestError(response, "error", true);
        return;
      }
      const payload = parseSubmissionEnvelope(await response.json());
      if (payload === null) {
        update((current) => ({ ...current, phase: "unknown", message: unconfirmedContactSubmission, submissionUnconfirmed: true }));
        return;
      }
      update((current) => ({
        ...current,
        phase:
          payload.status === "DISPATCH_OUTCOME_UNKNOWN"
            ? "unknown"
            : "submitted",
        requestId: payload.requestId,
        result: null,
        message: null,
      }));
    } catch {
      update((current) => ({ ...current, phase: "unknown", message: unconfirmedContactSubmission, submissionUnconfirmed: true }));
    } finally {
      actionInFlight.current = false;
    }
  }

  async function loadContacts(): Promise<void> {
    if (attempt.requestId === null || actionInFlight.current) return;
    actionInFlight.current = true;
    update((current) => ({ ...current, phase: "loading", message: null }));

    try {
      const response = await fetch(
        `/api/contact-enrichment/v2/${encodeURIComponent(attempt.requestId)}`,
        {
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      if (response.status === 401 || response.status === 403) {
        await showRequestError(response, "denied");
        return;
      }
      if (response.status !== 200) {
        await showRequestError(response, "error");
        return;
      }

      const result = parsePreviewEnvelope(await response.json());
      if (result === null || result.requestId !== attempt.requestId) {
        showReadError();
        return;
      }
      update((current) => ({
        ...current,
        phase: phaseForResult(result),
        result,
        message: null,
        accessBlocked: false,
      }));
    } catch {
      showReadError();
    } finally {
      actionInFlight.current = false;
    }
  }

  function showReadError(): void {
    update((current) => ({
      ...current,
      phase: current.result?.status === "PREVIEW_AVAILABLE" ? "available"
        : current.companySearchResult?.status === "SEARCH_AVAILABLE" ? "company_search_available" : "error",
      message: "Não foi possível validar a atualização do pedido. Motivo não informado. O resultado anterior foi preservado; consulte novamente o pedido existente, sem enviar uma nova busca.",
    }));
  }

  async function revealContact(
    contact: ContactCandidateDto,
    channels: readonly ContactRevealChannel[],
  ): Promise<ContactMutationFeedback> {
    if (attempt.requestId === null || channels.length === 0) {
      return { kind: "error", message: "Selecione um canal de um pedido existente antes de recuperar contatos." };
    }
    try {
      const response = await fetch(
        `/api/contact-enrichment/v2/${encodeURIComponent(attempt.requestId)}/reveal`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": `${attempt.idempotencyKey}:reveal:${contact.contactId}:${channels.join("+")}`,
          },
          body: JSON.stringify({
            contact_id: contact.contactId,
            channels,
          }),
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      if (response.status !== 200 && response.status !== 202) {
        if (response.status === 401 || response.status === 403) update((current) => ({ ...current, accessBlocked: true }));
        return readMutationError(response);
      }
      const payload = await response.json();
      if (!isRecord(payload) || !isRecord(payload.data) ||
        payload.data.requestId !== attempt.requestId ||
        !isOpaqueId(payload.data.revealRequestId) ||
        !isContactRevealStatus(payload.data.status)) {
        return { kind: "unknown", message: unconfirmedContactRecovery };
      }
      return {
        kind: "recorded", status: payload.data.status,
        message: describeContactRevealStatus(payload.data.status),
      };
    } catch {
      return { kind: "unknown", message: unconfirmedContactRecovery };
    }
  }

  async function suppress(contactId: string): Promise<ContactMutationFeedback> {
    try {
      const response = await fetch(
        `/api/contact-enrichment/v2/contacts/${encodeURIComponent(contactId)}/suppress`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scope: "all",
            reason: "DATA_SUBJECT_OPT_OUT",
          }),
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      if (response.status !== 200) {
        if (response.status === 401 || response.status === 403) update((current) => ({ ...current, accessBlocked: true }));
        return readMutationError(response, unconfirmedContactSuppression);
      }
      const payload = await response.json();
      if (!isRecord(payload) || !isRecord(payload.data) || payload.data.suppressed !== true || payload.data.contactId !== contactId) {
        return { kind: "unknown", message: unconfirmedContactSuppression };
      }
      void loadContacts();
      return { kind: "recorded", message: "Bloqueio registrado. Consulte o pedido existente para verificar a disponibilidade atual do contato." };
    } catch {
      return { kind: "unknown", message: unconfirmedContactSuppression };
    }
  }

  if (!isExpanded) {
    return (
      <div className="mt-4" data-contact-attempt={attemptKey}>
        <button
          type="button"
          onClick={openAttempt}
          aria-expanded="false"
          aria-label={`Encontrar contatos de ${companyLabel}`}
          className="ui-action ui-action--secondary flex-col items-start text-left"
        >
          <span>{attempt.phase === "idle" ? "Encontrar contatos" : "Continuar consulta"}</span>
          <span className="mt-0.5 text-xs font-semibold text-[oklch(43%_0.03_252)]">
            {attempt.phase === "idle" ? "Buscar pessoas desta empresa" : "Ver estado e contatos"}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4" data-contact-attempt={attemptKey}>

      {attempt.phase === "domain" ? (
        <div className="max-w-2xl border-l-2 border-[oklch(72%_0.075_174)] pl-4">
          {approvedInitialDomain === null &&
          normalizeCompanyName(companyName) !== null ? (
            <div className="mb-4 border-b border-[oklch(88%_0.02_82)] pb-4">
              <p className="text-sm font-bold text-[oklch(28%_0.035_252)]">
                Localize a empresa
              </p>
              <p className="mt-1 text-xs leading-5 text-[oklch(43%_0.03_252)]">
                Busque pelo nome da empresa, com cidade e UF quando disponíveis.
                Confirme a empresa encontrada antes de buscar decisores. A busca
                pode usar um crédito.
              </p>
              <div className="mt-3">
                <ActionButton onClick={() => void submitCompanySearch()}>
                  Localizar empresa pelo nome
                </ActionButton>
              </div>
              <p className="mt-3 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[oklch(52%_0.025_252)]">
                Ou informe o domínio
              </p>
            </div>
          ) : null}
          <label className="block text-xs font-bold text-[oklch(43%_0.03_252)]">
            Domínio da empresa
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              placeholder="empresa.com.br"
              value={attempt.domain}
              aria-invalid={attempt.message !== null}
              aria-describedby={attempt.message !== null ? `contact-domain-message-${attemptKey}` : undefined}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  domain: event.target.value,
                  message: null,
                }))
              }
              className="ui-field mt-2 text-sm"
            />
          </label>
          {approvedInitialDomain !== null &&
          attempt.domain === approvedInitialDomain ? (
            <p className="mt-2 text-xs text-[oklch(43%_0.03_252)]">
              Domínio encontrado nos dados da empresa. Confirme antes de buscar.
            </p>
          ) : null}
          {attempt.message ? (
            <p id={`contact-domain-message-${attemptKey}`} role="alert" className="mt-2 text-xs text-[oklch(42%_0.09_32)]">
              {attempt.message}
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-[oklch(43%_0.03_252)]">
            O Prospecta prioriza patrimônio e ativo imobilizado, depois
            contabilidade, controladoria e finanças, e responsáveis por
            inventário e estoques. Você escolhe se deseja recuperar e-mail ou
            telefone profissional.
            Recuperar canais profissionais é uma etapa separada e pode consumir
            créditos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton onClick={() => void submitPreview()}>
              Buscar decisores
            </ActionButton>
            <button
              type="button"
              onClick={() => {
                update(() => createAttempt());
                context.collapse(attemptKey);
              }}
              className="ui-action ui-action--quiet"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {attempt.phase === "company_search_submitting" ||
      attempt.phase === "company_search_loading" ? (
        <p role="status" className="text-sm text-[oklch(43%_0.03_252)]">
          Localizando a empresa…
        </p>
      ) : null}

      {attempt.phase === "company_search_submitted" ? (
        <div>
          <p role="status" className="text-sm text-[oklch(43%_0.03_252)]">
            {attempt.message ??
              "Busca registrada. Consulte o resultado para confirmar a empresa."}
          </p>
          <div className="mt-2">
            <ActionButton onClick={() => void loadCompanyMatches()}>
              Ver empresa localizada
            </ActionButton>
          </div>
        </div>
      ) : null}

      {attempt.companySearchResult?.status === "SEARCH_AVAILABLE" && attempt.requestId === null && attempt.phase !== "domain" ? (
        <div>
        {attempt.message && attempt.phase !== "unknown" ? <ActionError message={attempt.message} /> : null}
        <CompanySearchResults
          result={attempt.companySearchResult}
          reference={{
            companyName: normalizeCompanyName(companyName),
            city: normalizeCompanyLocationText(companyCity),
            state: normalizeCompanyState(companyState),
            sector: normalizeCompanySector(companySector),
          }}
          onConfirm={submitMatchedCompanyPreview}
          onRefresh={loadCompanyMatches}
          onManualDomain={() =>
            update((current) => ({ ...current, phase: "domain" }))
          }
          pending={attempt.phase === "company_search_loading" || attempt.phase === "submitting" || attempt.phase === "unknown" || attempt.accessBlocked}
        />
        </div>
      ) : null}

      {attempt.phase === "company_search_empty" ? (
        <div>
          <StatusMessage>
            Nenhuma empresa foi localizada com esse nome.
          </StatusMessage>
          <SearchFeedback
            diagnostics={attempt.companySearchResult?.searchDiagnostics}
            fallback="Motivo não informado. A fonte não informou os detalhes desta consulta. Isso não comprova que a empresa não existe."
          />
          <RecoveryActions onRestart={resetAttempt} />
        </div>
      ) : null}

      {attempt.phase === "company_search_expired" ? (
        <div>
          <StatusMessage>
            A confirmação da empresa expirou. Inicie uma nova busca.
          </StatusMessage>
          <RecoveryActions onRestart={resetAttempt} />
        </div>
      ) : null}

      {attempt.phase === "submitting" || attempt.phase === "loading" ? (
        <p role="status" className="text-sm text-[oklch(43%_0.03_252)]">
          {attempt.phase === "loading" ? "Consultando o pedido de contatos…" : "Registrando busca de contatos…"}
        </p>
      ) : null}

      {attempt.phase === "submitted" ? (
        <div>
          <p role="status" className="text-sm text-[oklch(43%_0.03_252)]">
            {attempt.message ?? "Busca registrada. Os contatos só serão carregados quando você solicitar."}
          </p>
          <div className="mt-2">
            <ActionButton onClick={() => void loadContacts()}>
              Ver ou atualizar contatos
            </ActionButton>
          </div>
        </div>
      ) : null}

      {attempt.result?.status === "PREVIEW_AVAILABLE" ? (
        <div>
        {attempt.message ? <ActionError message={attempt.message} /> : null}
        <ContactResults
          result={attempt.result}
          producerScore={producerScore}
          onReveal={revealContact}
          onSuppress={suppress}
          onRefresh={loadContacts}
          canReveal={canReveal}
          canGovern={canGovern}
          refreshing={attempt.phase === "loading"}
          mutationsBlocked={attempt.accessBlocked}
        />
        </div>
      ) : null}

      {attempt.phase === "empty" ? (
        <div>
          <StatusMessage>
            Nenhum decisor disponível nesta consulta.
          </StatusMessage>
          <SearchFeedback
            diagnostics={attempt.result?.searchDiagnostics}
            fallback="Motivo não informado. A fonte não informou os detalhes desta busca. Não é possível confirmar quais consultas foram concluídas."
          />
          <p className="mt-2 text-xs leading-5 text-[oklch(43%_0.03_252)]">
            Essa amostra não comprova que a empresa não possui contatos
            profissionais.
          </p>
          <RecoveryActions onRestart={resetAttempt} />
        </div>
      ) : null}
      {attempt.phase === "unknown" ? (
        <div>
          <StatusMessage>
            {attempt.message ?? (attempt.requestId === null &&
            attempt.companySearchRequestId !== null
              ? "A fonte não confirmou o resultado desta busca. Consultar novamente apenas lê o pedido já registrado."
              : "Resultado inicial não confirmado. Consulte o pedido já registrado; isso não envia uma nova tentativa.")}
          </StatusMessage>
          <SearchFeedback
            diagnostics={attempt.requestId !== null
              ? attempt.result?.searchDiagnostics
              : attempt.companySearchResult?.searchDiagnostics}
            fallback={attempt.message ? undefined : "Motivo não informado. Um resultado ainda não confirmado não comprova falha nem ausência de contatos."}
          />
          {attempt.submissionUnconfirmed ? null : attempt.requestId !== null ? (
            <div className="mt-2">
              <ActionButton onClick={() => void loadContacts()}>
                Ver ou atualizar contatos
              </ActionButton>
            </div>
          ) : attempt.companySearchRequestId !== null ? (
            <div className="mt-2 grid gap-3">
              <div>
                <ActionButton onClick={() => void loadCompanyMatches()}>
                  Ver empresa localizada
                </ActionButton>
              </div>
              <p className="text-xs leading-5 text-[oklch(43%_0.03_252)]">
                Uma nova busca é uma nova solicitação e pode consumir um novo
                crédito.
              </p>
              <div>
                <ActionButton onClick={resetAttempt}>
                  Iniciar nova busca
                </ActionButton>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {attempt.phase === "denied" ? (
        <div>
          <ActionError message={attempt.message ?? "Seu perfil não permite recuperar ou visualizar contatos. Solicite a liberação ao responsável pelo acesso."} />
          {attempt.requestId !== null ? <ActionButton onClick={() => void loadContacts()}>Consultar pedido existente</ActionButton>
            : attempt.companySearchRequestId !== null ? <ActionButton onClick={() => void loadCompanyMatches()}>Consultar pedido existente</ActionButton> : null}
        </div>
      ) : null}
      {attempt.phase === "conflict" ? (
        <div>
          <StatusMessage>{attempt.message ?? "A solicitação conflita com uma tentativa já registrada."}</StatusMessage>
          {attempt.requestId !== null ? <ActionButton onClick={() => void loadContacts()}>Consultar pedido existente</ActionButton>
            : attempt.companySearchRequestId !== null ? <ActionButton onClick={() => void loadCompanyMatches()}>Consultar pedido existente</ActionButton>
            : <RecoveryActions onRestart={resetAttempt} />}
        </div>
      ) : null}
      {attempt.phase === "error" ? (
        <div>
          {attempt.message ? <ActionError message={attempt.message} /> : <StatusMessage alert>Não foi possível concluir a consulta agora.</StatusMessage>}
          <SearchFeedback
            diagnostics={attempt.result?.status === "PREVIEW_FAILED"
              ? attempt.result.searchDiagnostics
              : attempt.companySearchResult?.status === "SEARCH_FAILED"
                ? attempt.companySearchResult.searchDiagnostics : null}
            fallback={attempt.message !== null ? undefined
              : attempt.result?.status === "PREVIEW_FAILED" || attempt.companySearchResult?.status === "SEARCH_FAILED"
                ? "A fonte confirmou uma falha nesta consulta, mas não informou o motivo. Motivo não informado."
                : "Motivo não informado. Não foi possível confirmar o resultado da consulta."}
          />
          {attempt.requestId !== null ? <ActionButton onClick={() => void loadContacts()}>Consultar pedido existente</ActionButton>
            : attempt.companySearchRequestId !== null ? <ActionButton onClick={() => void loadCompanyMatches()}>Consultar pedido existente</ActionButton>
            : <RecoveryActions onRestart={resetAttempt} />}
        </div>
      ) : null}
    </div>
  );
}

function CompanySearchResults({
  result,
  reference,
  onConfirm,
  onRefresh,
  onManualDomain,
  pending,
}: {
  readonly result: ContactCompanySearchRequestDto;
  readonly reference: {
    readonly companyName: string | null;
    readonly city: string | null;
    readonly state: string | null;
    readonly sector: string | null;
  };
  readonly onConfirm: (match: ContactCompanyMatchDto) => Promise<void>;
  readonly onRefresh: () => Promise<void>;
  readonly onManualDomain: () => void;
  readonly pending: boolean;
}) {
  return (
    <div className="mt-3 max-w-2xl border-l-2 border-[oklch(72%_0.075_174)] pl-4">
      <p className="text-sm font-bold text-[oklch(28%_0.035_252)]">
        Confirme a empresa localizada
      </p>
      <p className="mt-1 text-xs leading-5 text-[oklch(43%_0.03_252)]">
        Compare nome, domínio e localização com os dados desta ficha.
        Confirme apenas a empresa correspondente antes de buscar decisores.
      </p>
      <p className="mt-2 text-xs font-semibold leading-5 text-[oklch(38%_0.04_252)]">
        Dados desta ficha: {formatCompanyReference(reference)}
      </p>
      <div className="mt-3 grid gap-3">
        {result.matches.map((match) => (
          <article
            key={match.companyMatchId}
            className="border-t border-[oklch(88%_0.02_82)] pt-3 first:border-t-0 first:pt-0"
          >
            <p className="font-bold">{match.companyName}</p>
            <p className="mt-1 text-xs leading-5 text-[oklch(43%_0.03_252)]">
              {[
                match.companyDomain,
                match.industry,
                match.location.city,
                match.location.state,
                match.location.country,
              ]
                .filter(Boolean)
                .join(" · ") || "Sem detalhes empresariais adicionais"}
            </p>
            <div className="mt-2">
              <ActionButton disabled={pending} onClick={() => void onConfirm(match)}>
                Usar esta empresa
              </ActionButton>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={pending}
          className="min-h-11 text-sm font-semibold underline"
        >
          Atualizar resultado
        </button>
        <button
          type="button"
          onClick={onManualDomain}
          disabled={pending}
          className="min-h-11 text-sm font-semibold underline"
        >
          Informar domínio
        </button>
      </div>
    </div>
  );
}

function ContactResults({
  result,
  producerScore,
  onReveal,
  onSuppress,
  onRefresh,
  canReveal,
  canGovern,
  refreshing,
  mutationsBlocked,
}: {
  readonly result: ContactPreviewRequestDto;
  readonly producerScore: number | null;
  readonly onReveal: (
    contact: ContactCandidateDto,
    channels: readonly ContactRevealChannel[],
  ) => Promise<ContactMutationFeedback>;
  readonly onSuppress: (contactId: string) => Promise<ContactMutationFeedback>;
  readonly onRefresh: () => Promise<void>;
  readonly canReveal: boolean;
  readonly canGovern: boolean;
  readonly refreshing: boolean;
  readonly mutationsBlocked: boolean;
}) {
  if (result.transparency === null || result.candidates === null) {
    return <StatusMessage>Resultado retido pela política de contatos. Motivo não informado. Consulte o responsável pelo acesso antes de continuar.</StatusMessage>;
  }

  const transparency = result.transparency;

  return (
    <div className="mt-5 min-w-0">
      <section
        role="region"
        aria-label="Uso responsável dos contatos"
        className="border-y border-[oklch(74%_0.055_174)] py-5"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-[oklch(37%_0.095_174)] uppercase">
              Uso responsável dos contatos
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[oklch(34%_0.035_174)]">
              {transparency.purpose}
            </p>
          </div>
          <dl className="grid gap-x-6 gap-y-4 text-xs leading-5 sm:grid-cols-2">
            <div>
              <dt className="font-bold text-[oklch(31%_0.055_174)]">
                Controlador dos dados
              </dt>
              <dd className="mt-1 text-[oklch(42%_0.03_252)]">
                {transparency.controllerLegalName}
                {transparency.controllerRegistration
                  ? ` · ${transparency.controllerRegistration}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-[oklch(31%_0.055_174)]">
                Base e fonte
              </dt>
              <dd className="mt-1 text-[oklch(42%_0.03_252)]">
                Legítimo interesse · {transparency.source === "LUSHA_AND_APOLLO"
                  ? "Lusha e Apollo"
                  : "Lusha"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-[oklch(31%_0.055_174)]">
                Retenção
              </dt>
              <dd className="mt-1 text-[oklch(42%_0.03_252)]">
                {transparency.previewRetentionDays} dias para prévia · {" "}
                {transparency.revealedRetentionDays} dias para canais
              </dd>
            </div>
            <div>
              <dt className="font-bold text-[oklch(31%_0.055_174)]">
                Direitos e opt-out
              </dt>
              <dd className="mt-1 break-words text-[oklch(42%_0.03_252)]">
                {transparency.privacyContact}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <SearchFeedback diagnostics={result.searchDiagnostics} />

      {result.companyPhoneFallback ? (
        <CompanyPhoneFallback phone={result.companyPhoneFallback} />
      ) : null}

      {result.candidates.length > 0 ? (
      <section aria-label="Decisores localizados" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h5 className="font-serif text-2xl tracking-[-0.025em]">
            Decisores localizados
          </h5>
          <p className="text-xs font-bold tracking-[0.1em] text-[oklch(45%_0.055_174)] uppercase">
            {result.candidates.length} {result.candidates.length === 1 ? "perfil" : "perfis"}
          </p>
        </div>

        <div className="mt-2 grid gap-x-8 md:grid-cols-2 xl:grid-cols-3">
        {result.candidates.map((contact) => (
          <article
            key={contact.contactId}
            aria-labelledby={`contact-${contact.contactId}`}
            className="border-t border-[oklch(82%_0.035_174)] py-5"
          >
            <h6
              id={`contact-${contact.contactId}`}
              className="text-base font-bold text-[oklch(24%_0.045_252)]"
            >
              {contact.fullName}
            </h6>
            <p className="mt-2 text-xs leading-5 text-[oklch(43%_0.03_252)]">
              {[contact.jobTitle, contact.seniority, ...contact.departments]
                .filter(Boolean)
                .join(" · ") || "Contexto profissional não informado"}
            </p>
            <p className="mt-2 text-[0.7rem] font-bold tracking-[0.08em] text-[oklch(45%_0.055_174)] uppercase">
              Fonte: {contact.source === "APOLLO" ? "Apollo" : "Lusha"}
            </p>
            {contact.source === "APOLLO" ? (
              <p className="mt-1 text-xs leading-5 text-[oklch(48%_0.025_252)]">
                Nome mascarado na prévia da fonte.
              </p>
            ) : null}
            {[contact.location.city, contact.location.state, contact.location.country]
              .filter(Boolean).length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-[oklch(45%_0.055_174)]">
                {[contact.location.city, contact.location.state, contact.location.country]
                  .filter(Boolean)
                .join(" · ")}
              </p>
            ) : null}
            {contact.governanceState === "AVAILABLE" ? (
              contact.linkedinUrl !== null ? (
                <a
                  href={contact.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  aria-label={`Abrir LinkedIn de ${contact.fullName}`}
                  className="mt-3 inline-flex min-h-11 items-center text-xs font-bold underline decoration-[oklch(45%_0.105_174)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)]"
                >
                  Abrir LinkedIn
                  <span aria-hidden="true" className="ml-1">
                    ↗
                  </span>
                </a>
              ) : (
                <p className="mt-3 text-xs text-[oklch(48%_0.025_252)]">
                  {contact.source === "APOLLO"
                    ? "LinkedIn não disponível na prévia Apollo"
                    : "LinkedIn não informado"}
                </p>
              )
            ) : null}
            {contact.governanceState !== "AVAILABLE" ? (
              <p className="mt-2 text-xs font-semibold">
                {contact.governanceState === "SUPPRESSED"
                  ? "Contato bloqueado para abordagem."
                  : "Contato expirado."}
                {contact.governanceState === "SUPPRESSED"
                  ? " A recuperação e o uso deste contato estão bloqueados. Respeite a restrição registrada."
                  : " O prazo de retenção terminou. Inicie uma nova busca para consultar a disponibilidade atual."}
              </p>
            ) : (
              <AvailableContactActions
                contact={contact}
                onReveal={onReveal}
                onSuppress={onSuppress}
                canReveal={canReveal}
                canGovern={canGovern}
                onRefresh={onRefresh}
                refreshing={refreshing}
                mutationsBlocked={mutationsBlocked}
              />
            )}
          </article>
        ))}
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          className="mt-1 min-h-11 text-sm font-semibold underline decoration-[oklch(45%_0.105_174)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)]"
        >
          {refreshing ? "Atualizando contatos…" : "Atualizar contatos"}
        </button>
      </section>
      ) : (
        <p className="mt-6 text-sm leading-6 text-[oklch(43%_0.03_252)]">
          Nenhum decisor disponível nesta consulta. Motivo não informado quando a fonte não apresenta um diagnóstico.
        </p>
      )}

      {result.candidates.length > 0 ? (
      <ContactCommercialScorePanel
        key={contactScorePanelKey(result, producerScore)}
        producerScore={producerScore}
        candidates={result.candidates}
      />
      ) : null}
    </div>
  );
}

function CompanyPhoneFallback({
  phone,
}: {
  readonly phone: NonNullable<
    ContactPreviewRequestDto["companyPhoneFallback"]
  >;
}) {
  const available =
    phone.governanceState === "AVAILABLE" && phone.value !== null;

  return (
    <section
      aria-label="Telefone geral da empresa"
      className="mt-6 border-y border-[oklch(78%_0.04_82)] py-5"
    >
      <h5 className="font-serif text-2xl tracking-[-0.025em]">
        Telefone geral da empresa
      </h5>
      {available ? (
        <>
          <p className="mt-3 text-lg font-bold text-[oklch(24%_0.045_252)]">
            {phone.value}
          </p>
          <p className="mt-2 text-xs font-bold tracking-[0.08em] text-[oklch(45%_0.055_174)] uppercase">
            Fonte: Apollo
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[oklch(43%_0.03_252)]">
            Linha corporativa retornada para a empresa confirmada.
            Possibilidade de contato não informada pela fonte; valide o número
            e a política de abordagem antes de usar.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm font-semibold text-[oklch(43%_0.03_252)]">
          {phone.governanceState === "SUPPRESSED"
            ? "Telefone bloqueado para abordagem."
            : "Telefone expirado."}
        </p>
      )}
    </section>
  );
}

function ContactCommercialScorePanel({
  producerScore,
  candidates,
}: {
  readonly producerScore: number | null;
  readonly candidates: readonly ContactCandidateDto[];
}) {
  const [assessment, setAssessment] =
    useState<ContactCommercialScoreResult | null>(null);

  return (
    <section
      aria-label="Cálculo comercial desta consulta"
      className="mt-6 border-y border-[oklch(78%_0.04_82)] py-5"
    >
      <p className="text-xs font-bold tracking-[0.14em] text-[oklch(37%_0.095_174)] uppercase">
        Cálculo comercial desta consulta
      </p>
      <p className="mt-2 text-sm text-[oklch(34%_0.035_174)]">
        Pontuação do produtor: {formatScore(producerScore)}
      </p>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-[oklch(43%_0.03_252)]">
        Considera somente os perfis prioritários retornados nesta consulta. A
        pontuação do produtor permanece intacta.
      </p>
      <button
        type="button"
        onClick={() =>
          setAssessment(
            calculateContactCommercialScore(producerScore, candidates),
          )
        }
        className="ui-action ui-action--secondary mt-3"
      >
        Calcular pontuação desta consulta
      </button>
      {assessment !== null ? (
        <ContactCommercialScoreStatus result={assessment} />
      ) : null}
    </section>
  );
}

function ContactCommercialScoreStatus({
  result,
}: {
  readonly result: ContactCommercialScoreResult;
}) {
  if (result.kind === "SCORED") {
    return (
      <div role="status" className="mt-3 text-sm leading-6">
        <p className="font-bold">Pontuação comercial: {result.commercialScore}</p>
        <p>
          Perfil aplicado: {result.matchedProfile} · bônus +{result.bonus}
        </p>
        <p className="text-xs text-[oklch(43%_0.03_252)]">
          A pontuação do produtor não foi alterada.
        </p>
      </div>
    );
  }

  if (result.kind === "PRODUCER_SCORE_UNAVAILABLE") {
    return (
      <p role="status" className="mt-3 text-sm leading-6">
        Perfil prioritário localizado, mas a pontuação do produtor está
        indisponível. Nenhuma pontuação comercial foi inventada.
      </p>
    );
  }

  return (
    <p role="status" className="mt-3 text-sm leading-6">
      Nenhum perfil prioritário apareceu entre os contatos retornados nesta
      consulta. A pontuação comercial não foi alterada.
    </p>
  );
}

function contactScorePanelKey(
  result: ContactPreviewRequestDto,
  producerScore: number | null,
): string {
  const candidateState = result.candidates
    ?.map((candidate) => `${candidate.contactId}:${candidate.governanceState}`)
    .join(",");
  return `${result.requestId}:${producerScore ?? "missing"}:${candidateState ?? "withheld"}`;
}

function AvailableContactActions({
  contact,
  onReveal,
  onSuppress,
  canReveal,
  canGovern,
  onRefresh,
  refreshing,
  mutationsBlocked,
}: {
  readonly contact: ContactCandidateDto;
  readonly onReveal: (
    contact: ContactCandidateDto,
    channels: readonly ContactRevealChannel[],
  ) => Promise<ContactMutationFeedback>;
  readonly onSuppress: (contactId: string) => Promise<ContactMutationFeedback>;
  readonly canReveal: boolean;
  readonly canGovern: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly refreshing: boolean;
  readonly mutationsBlocked: boolean;
}) {
  const [isChoosingChannels, setIsChoosingChannels] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<
    readonly ContactRevealChannel[]
  >([]);
  const [revealState, setRevealState] = useState<"idle" | "submitting">("idle");
  const [revealFeedback, setRevealFeedback] = useState<ContactMutationFeedback | null>(null);
  const revealInFlight = useRef(false);
  const suppressionInFlight = useRef(false);
  const [previousReveal, setPreviousReveal] = useState<string | null>(null);
  const [suppressionFeedback, setSuppressionFeedback] = useState<ContactMutationFeedback | null>(null);
  const [suppressionState, setSuppressionState] = useState<
    "idle" | "confirming" | "submitting" | "error"
  >("idle");
  const hasRevealSelection = selectedChannels.length > 0;
  const recordedReveal = contact.reveal ? `${contact.reveal.revealRequestId}:${contact.reveal.status}:${contact.reveal.updatedAt}` : null;
  const hasNewRevealFacts = recordedReveal !== previousReveal;
  const revealMessage = contact.reveal && (revealFeedback === null || hasNewRevealFacts)
    ? describeContactRevealStatus(contact.reveal.status, contact) : revealFeedback?.message;
  const revealRecorded = contact.reveal !== undefined && contact.reveal !== null ||
    revealFeedback?.kind === "recorded" || revealFeedback?.kind === "unknown";
  const recoveryBlocked = mutationsBlocked || suppressionState === "submitting" || suppressionFeedback?.kind === "unknown";

  function toggleChannel(channel: ContactRevealChannel): void {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((candidate) => candidate !== channel)
        : [...current, channel],
    );
  }

  async function submitReveal(): Promise<void> {
    if (!hasRevealSelection || revealInFlight.current || revealRecorded || refreshing || recoveryBlocked) return;
    revealInFlight.current = true;
    setPreviousReveal(recordedReveal);
    setRevealState("submitting");
    setRevealFeedback(null);
    try {
      setRevealFeedback(await onReveal(contact, selectedChannels));
    } finally {
      revealInFlight.current = false;
      setRevealState("idle");
    }
  }

  async function submitSuppression(): Promise<void> {
    if (suppressionInFlight.current || revealInFlight.current || refreshing || mutationsBlocked) return;
    suppressionInFlight.current = true;
    setSuppressionState("submitting");
    setSuppressionFeedback(null);
    try {
      const result = await onSuppress(contact.contactId);
      setSuppressionFeedback(result);
      setSuppressionState(result.kind === "recorded" ? "idle" : "error");
    } finally {
      suppressionInFlight.current = false;
    }
  }

  return (
    <div className="mt-4 grid gap-4">
      {contact.channels ? (
        <div className="w-full text-xs leading-5">
          {contact.channels.workEmails.map((email) => (
            <p key={email.value}>E-mail profissional: {email.value}</p>
          ))}
          {contact.channels.businessPhones.map((phone) => (
            <p key={phone.value}>Telefone profissional: {phone.value}</p>
          ))}
        </div>
      ) : null}
      {!canReveal ? (
        <p className="text-xs leading-5 text-[oklch(43%_0.03_252)]">
          Seu perfil não permite recuperar canais profissionais. Solicite a
          permissão de recuperação ao responsável pelo acesso.
        </p>
      ) : null}
      {canReveal && !contact.canRevealWorkEmail && !contact.canRevealBusinessPhone && contact.channels === null ? (
        <p className="text-xs leading-5 text-[oklch(43%_0.03_252)]">
          Nenhum canal está disponível para recuperação nesta prévia. Motivo
          não informado. Consulte o pedido existente; isso não comprova ausência de e-mail ou telefone.
        </p>
      ) : null}
      {contact.channels === null &&
      canReveal &&
      (contact.canRevealWorkEmail || contact.canRevealBusinessPhone) ? (
        <div>
          {!isChoosingChannels ? (
            <ActionButton disabled={refreshing || recoveryBlocked} onClick={() => setIsChoosingChannels(true)}>
              Escolher canais profissionais
            </ActionButton>
          ) : (
            <fieldset className="border-l-2 border-[oklch(72%_0.075_174)] pl-4">
              <legend className="text-xs font-bold tracking-[0.08em] uppercase">
                Canais a recuperar
              </legend>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm">
                {contact.canRevealWorkEmail ? (
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes("work_email")}
                      disabled={revealState === "submitting" || revealRecorded || refreshing || recoveryBlocked}
                      onChange={() => toggleChannel("work_email")}
                    />
                    E-mail profissional
                  </label>
                ) : null}
                {contact.canRevealBusinessPhone ? (
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes("business_phone")}
                      disabled={revealState === "submitting" || revealRecorded || refreshing || recoveryBlocked}
                      onChange={() => toggleChannel("business_phone")}
                    />
                    Telefone profissional
                  </label>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!hasRevealSelection || revealState === "submitting" || revealRecorded || refreshing || recoveryBlocked}
                  onClick={() => void submitReveal()}
                  className="ui-action ui-action--secondary"
                >
                  {revealState === "submitting"
                    ? "Solicitando canais…"
                    : "Recuperar canais selecionados"}
                </button>
                <button
                  type="button"
                  disabled={revealState === "submitting" || revealRecorded || refreshing}
                  onClick={() => {
                    setIsChoosingChannels(false);
                    setSelectedChannels([]);
                  }}
                  className="ui-action ui-action--quiet"
                >
                  Cancelar
                </button>
              </div>
              {!hasRevealSelection && !revealRecorded ? <p className="mt-2 text-xs leading-5">Selecione ao menos um canal para habilitar a recuperação.</p> : null}
              {revealState === "submitting" ? <p role="status" className="mt-3 text-xs">Registrando recuperação dos canais selecionados… Aguarde a confirmação antes de realizar outra ação.</p> : null}
            </fieldset>
          )}
        </div>
      ) : null}

      {revealMessage ? (
        <div>
          {revealFeedback?.kind === "error" || revealFeedback?.kind === "unknown" ? <ActionError message={revealMessage} /> : <StatusMessage>{revealMessage}</StatusMessage>}
          <ActionButton disabled={refreshing || revealState === "submitting"} onClick={() => void onRefresh()}>Consultar pedido existente</ActionButton>
        </div>
      ) : null}

      {canGovern ? (
      <div className="border-t border-[oklch(84%_0.03_82)] pt-3">
        {suppressionState === "idle" && suppressionFeedback?.kind !== "recorded" ? (
          <button
            type="button"
            onClick={() => setSuppressionState("confirming")}
            disabled={refreshing || revealState === "submitting" || mutationsBlocked}
            className="ui-action ui-action--danger"
          >
            Não contatar
          </button>
        ) : null}
        {suppressionState === "confirming" ? (
          <div className="border-l-2 border-[oklch(67%_0.11_32)] pl-4">
            <p className="text-xs leading-5 text-[oklch(42%_0.09_32)]">
              Esta ação bloqueia futuras abordagens por todos os canais deste
              contato no Prospecta.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void submitSuppression()}
                disabled={refreshing || mutationsBlocked || revealState === "submitting"}
                className="ui-action ui-action--danger"
              >
                Confirmar não contatar
              </button>
              <button
                type="button"
                onClick={() => setSuppressionState("idle")}
                className="ui-action ui-action--quiet"
              >
                Manter contato
              </button>
            </div>
          </div>
        ) : null}
        {suppressionState === "submitting" ? (
          <button
            type="button"
            disabled
            className="ui-action ui-action--danger"
          >
            Bloqueando contato…
          </button>
        ) : null}
        {suppressionState === "error" ? (
          <div>
            <ActionError message={suppressionFeedback?.message ?? "Não foi possível bloquear este contato agora. Motivo não informado. Consulte o pedido existente antes de tentar novamente."} />
            <ActionButton disabled={refreshing} onClick={() => void onRefresh()}>Consultar pedido existente</ActionButton>
            {suppressionFeedback?.kind !== "unknown" ? (
            <button
              type="button"
              onClick={() => setSuppressionState("confirming")}
              disabled={refreshing || mutationsBlocked}
              className="ui-action ui-action--quiet mt-2"
            >
              Tentar novamente
            </button>
            ) : null}
          </div>
        ) : null}
      </div>
      ) : <p className="text-xs leading-5 text-[oklch(43%_0.03_252)]">Seu perfil não permite registrar bloqueios de contato. Peça ao responsável pela governança para registrar a restrição.</p>}
      {suppressionFeedback?.kind === "recorded" ? <StatusMessage>{suppressionFeedback.message}</StatusMessage> : null}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 border border-[oklch(45%_0.105_174)] bg-[oklch(97%_0.018_174)] px-3 py-2 text-sm font-bold text-[oklch(32%_0.09_174)] transition-colors hover:bg-[oklch(93%_0.04_174)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] active:bg-[oklch(90%_0.05_174)] motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

function RecoveryActions({ onRestart }: { readonly onRestart: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onRestart}
        className="ui-action ui-action--secondary"
      >
        Iniciar nova busca
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="ui-action ui-action--quiet"
      >
        Informar domínio
      </button>
    </div>
  );
}

function StatusMessage({
  children,
  alert = false,
}: {
  readonly children: ReactNode;
  readonly alert?: boolean;
}) {
  return (
    <p
      role={alert ? "alert" : "status"}
      className="mt-3 text-sm leading-5 text-[oklch(43%_0.03_252)]"
    >
      {children}
    </p>
  );
}

function ActionError({ message }: { readonly message: string }) {
  return (
    <div role="alert" className="mt-3 text-sm leading-5 text-[oklch(42%_0.09_32)]">
      <p>{message}</p>
      {message.includes("Sua sessão") ? <a href="/login" className="mt-2 inline-flex min-h-11 items-center font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2">Entrar novamente</a> : null}
    </div>
  );
}

const unconfirmedContactSubmission = "O registro desta busca não pôde ser confirmado. Motivo não informado. Não envie uma nova busca antes de verificar esta tentativa com o responsável pelo acesso; não foi recebida uma identificação de pedido para consulta.";
const unconfirmedContactRecovery = "O registro ou o resultado desta recuperação não pôde ser confirmado. Motivo não informado. Sua seleção foi preservada. Consulte o pedido existente antes de solicitar novamente.";
const unconfirmedContactSuppression = "O bloqueio deste contato não pôde ser confirmado. Motivo não informado. Consulte o pedido existente antes de repetir a ação.";

function httpContactError(status: number): string {
  if (status === 401) return contactApiErrorMessage({ error: { code: "AUTHENTICATION_REQUIRED" } })!;
  if (status === 403) return contactApiErrorMessage({ error: { code: "ACCESS_DENIED" } })!;
  if (status === 409) return "A ação encontrou um conflito. Motivo não informado. Consulte o pedido existente antes de tentar novamente.";
  if (status === 404) return "O pedido ou contato não foi encontrado para seu acesso. Consulte o pedido existente e confira a empresa selecionada.";
  if (status === 400 || status === 422) return "Os dados da ação não foram aceitos. Confira a empresa e os canais selecionados antes de corrigir a solicitação.";
  return "Não foi possível concluir a consulta agora. Motivo não informado. Consulte o pedido existente antes de enviar uma nova solicitação.";
}

async function readMutationError(response: Response, unknownMessage = unconfirmedContactRecovery): Promise<ContactMutationFeedback> {
  let message: string | null = null;
  let preflightDenied = false;
  try {
    const payload = await response.json();
    message = contactApiErrorMessage(payload);
    preflightDenied = isRecord(payload) && isRecord(payload.error) && payload.error.code === "CONTACT_DATA_HTTPS_REQUIRED";
  } catch { /* Safe code mapping only. */ }
  const unknown = !preflightDenied && ![400, 401, 403, 404, 409, 413, 415, 422, 429].includes(response.status);
  return { kind: unknown ? "unknown" : "error", message: unknown ? `${message ? `${message} ` : ""}${unknownMessage}` : message ?? httpContactError(response.status) };
}

function SearchFeedback({ diagnostics, fallback }: {
  readonly diagnostics: readonly ContactSearchDiagnosticDto[] | null | undefined;
  readonly fallback?: string;
}) {
  const safeDiagnostics = readContactSearchDiagnostics(diagnostics);
  if (safeDiagnostics === null) {
    return fallback ? <p className="mt-2 text-xs leading-5 text-[oklch(43%_0.03_252)]">{fallback}</p> : null;
  }
  return (
    <div role="region" aria-label="Resultado das consultas" className="mt-3 border-l-2 border-[oklch(74%_0.055_174)] pl-3">
      <p className="text-xs font-bold">Resultado das consultas</p>
      <ul className="mt-2 space-y-2 text-xs leading-5 text-[oklch(43%_0.03_252)]">
        {safeDiagnostics.map((diagnostic) => (
          <li key={`${diagnostic.provider}:${diagnostic.stage}`}>{describeContactSearchDiagnostic(diagnostic)}</li>
        ))}
      </ul>
    </div>
  );
}

function useContactAttemptContext(): ContactAttemptContextValue {
  const value = useContext(ContactAttemptContext);
  if (value === null) {
    throw new Error("ContactEnrichmentAction requires ContactEnrichmentProvider.");
  }
  return value;
}

function createAttempt(idempotencyKey = createIdempotencyKey()): ContactAttempt {
  return {
    phase: "idle",
    domain: "",
    idempotencyKey,
    companySearchIdempotencyKey: createIdempotencyKey(
      "contact-company-search",
    ),
    companySearchRequestId: null,
    companySearchResult: null,
    requestId: null,
    result: null,
    message: null,
    accessBlocked: false,
    submissionUnconfirmed: false,
  };
}

function createIdempotencyKey(prefix = "contact-preview"): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const value = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const uuid = `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  return `${prefix}-${uuid}`;
}

function normalizeCompanyName(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= 200 &&
    !/[\u0000-\u001f\u007f<>]/.test(normalized)
    ? normalized
    : null;
}

function normalizeCompanyLocationText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= 100 &&
    !/[\u0000-\u001f\u007f<>]/.test(normalized)
    ? normalized
    : null;
}

function normalizeCompanyState(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function normalizeCompanySector(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= 300 &&
    !/[\u0000-\u001f\u007f<>]/.test(normalized)
    ? normalized
    : null;
}

function formatCompanyReference(reference: {
  readonly companyName: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly sector: string | null;
}): string {
  const location =
    reference.city !== null && reference.state !== null
      ? `${reference.city} / ${reference.state}`
      : (reference.city ?? reference.state);
  return [reference.companyName, location, reference.sector]
    .filter((value): value is string => value !== null)
    .join(" · ");
}

function normalizeDomain(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
    normalized,
  )
    ? normalized
    : null;
}

function phaseForResult(result: ContactPreviewRequestDto): ActionPhase {
  if (result.status === "PREVIEW_AVAILABLE") return "available";
  if (result.status === "PREVIEW_EMPTY") return "empty";
  if (
    result.status === "DISPATCH_OUTCOME_UNKNOWN" ||
    result.status === "PROVIDER_OUTCOME_UNKNOWN"
  ) {
    return "unknown";
  }
  if (result.status === "PREVIEW_FAILED") return "error";
  return "submitted";
}

function phaseForCompanySearchResult(
  result: ContactCompanySearchRequestDto,
): ActionPhase {
  if (result.status === "SEARCH_AVAILABLE" && result.matches.length > 0) {
    return "company_search_available";
  }
  if (result.status === "SEARCH_EMPTY") return "company_search_empty";
  if (result.status === "SEARCH_EXPIRED") return "company_search_expired";
  if (
    result.status === "DISPATCH_OUTCOME_UNKNOWN" ||
    result.status === "PROVIDER_OUTCOME_UNKNOWN"
  ) {
    return "unknown";
  }
  if (result.status === "SEARCH_FAILED") return "error";
  return "company_search_submitted";
}

function parseSubmissionEnvelope(
  value: unknown,
): { readonly requestId: string; readonly status: ContactPreviewStatus } | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const requestId = value.data.requestId;
  const status = value.data.status;
  return isOpaqueId(requestId) && isPreviewStatus(status)
    ? { requestId, status }
    : null;
}

function parsePreviewEnvelope(value: unknown): ContactPreviewRequestDto | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  if (
    !isOpaqueId(data.requestId) ||
    !isPreviewStatus(data.status) ||
    typeof data.requestedAt !== "string" ||
    typeof data.updatedAt !== "string" ||
    (data.previewExpiresAt !== null &&
      typeof data.previewExpiresAt !== "string") ||
    (data.candidates !== null && (!Array.isArray(data.candidates) || !data.candidates.every(isContactCandidate))) ||
    (data.companyPhoneFallback !== undefined &&
      data.companyPhoneFallback !== null &&
      !isCompanyPhone(data.companyPhoneFallback)) ||
    (data.transparency !== null && !isContactTransparency(data.transparency))
  ) {
    return null;
  }
  return { ...data, companyPhoneFallback: data.companyPhoneFallback ?? null, searchDiagnostics: readContactSearchDiagnostics(data.searchDiagnostics) } as unknown as ContactPreviewRequestDto;
}

function parseCompanySearchSubmissionEnvelope(value: unknown): {
  readonly searchRequestId: string;
  readonly status: ContactCompanySearchStatus;
} | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const searchRequestId = value.data.searchRequestId;
  const status = value.data.status;
  return isOpaqueId(searchRequestId) && isCompanySearchStatus(status)
    ? { searchRequestId, status }
    : null;
}

function parseCompanySearchEnvelope(
  value: unknown,
): ContactCompanySearchRequestDto | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  if (
    !isOpaqueId(data.searchRequestId) ||
    !isCompanySearchStatus(data.status) ||
    typeof data.requestedAt !== "string" ||
    typeof data.updatedAt !== "string" ||
    (data.matchesExpiresAt !== null &&
      typeof data.matchesExpiresAt !== "string") ||
    !Array.isArray(data.matches) || !data.matches.every(isCompanyMatch)
  ) {
    return null;
  }
  return { ...data, searchDiagnostics: readContactSearchDiagnostics(data.searchDiagnostics) } as unknown as ContactCompanySearchRequestDto;
}

function isPreviewStatus(value: unknown): value is ContactPreviewStatus {
  return (
    value === "REQUEST_RECORDED" ||
    value === "PREVIEW_DISPATCHED" ||
    value === "DISPATCH_OUTCOME_UNKNOWN" ||
    value === "PREVIEW_AVAILABLE" ||
    value === "PREVIEW_EMPTY" ||
    value === "PREVIEW_FAILED" ||
    value === "PROVIDER_OUTCOME_UNKNOWN"
  );
}

function isCompanySearchStatus(
  value: unknown,
): value is ContactCompanySearchStatus {
  return (
    value === "SEARCH_REQUEST_RECORDED" ||
    value === "SEARCH_DISPATCHED" ||
    value === "DISPATCH_OUTCOME_UNKNOWN" ||
    value === "SEARCH_AVAILABLE" ||
    value === "SEARCH_EMPTY" ||
    value === "SEARCH_FAILED" ||
    value === "PROVIDER_OUTCOME_UNKNOWN" ||
    value === "SEARCH_EXPIRED"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isContactLocation(value: unknown): boolean {
  return isRecord(value) && isNullableString(value.city) && isNullableString(value.state) && isNullableString(value.country);
}

function isContactCandidate(value: unknown): boolean {
  if (!isRecord(value) || typeof value.contactId !== "string" || typeof value.fullName !== "string" ||
    !isNullableString(value.jobTitle) || !isNullableString(value.seniority) ||
    !Array.isArray(value.departments) || !value.departments.every((department) => typeof department === "string") ||
    !isContactLocation(value.location) || !isNullableString(value.linkedinUrl) ||
    typeof value.canRevealWorkEmail !== "boolean" || typeof value.canRevealBusinessPhone !== "boolean" ||
    !["LUSHA", "APOLLO"].includes(String(value.source)) ||
    typeof value.obtainedAt !== "string" || typeof value.expiresAt !== "string" ||
    !["AVAILABLE", "SUPPRESSED", "EXPIRED"].includes(String(value.governanceState))) return false;
  if (value.channels !== null && (!isRecord(value.channels) ||
    !Array.isArray(value.channels.workEmails) || !Array.isArray(value.channels.businessPhones) ||
    !value.channels.workEmails.every((email) => isRecord(email) && typeof email.value === "string" && isNullableString(email.confidence) && isNullableString(email.sourceUpdatedAt)) ||
    !value.channels.businessPhones.every((phone) => isRecord(phone) && typeof phone.value === "string" && ["work", "direct"].includes(String(phone.type)) && isNullableString(phone.sourceUpdatedAt)))) return false;
  if (value.reveal !== undefined && value.reveal !== null && (!isRecord(value.reveal) ||
    !isOpaqueId(value.reveal.revealRequestId) || !isContactRevealStatus(value.reveal.status) ||
    typeof value.reveal.requestedAt !== "string" || !Number.isFinite(Date.parse(value.reveal.requestedAt)) ||
    typeof value.reveal.updatedAt !== "string" || !Number.isFinite(Date.parse(value.reveal.updatedAt)) ||
    typeof value.reveal.channelsMatchResult !== "boolean" ||
    !Array.isArray(value.reveal.requestedChannels) || value.reveal.requestedChannels.length === 0 || value.reveal.requestedChannels.length > 2 ||
    !value.reveal.requestedChannels.every((channel) => channel === "work_email" || channel === "business_phone") ||
    new Set(value.reveal.requestedChannels).size !== value.reveal.requestedChannels.length)) return false;
  return true;
}

function isContactTransparency(value: unknown): boolean {
  return isRecord(value) && typeof value.controllerLegalName === "string" && isNullableString(value.controllerRegistration) &&
    typeof value.purpose === "string" && value.legalBasis === "LEGITIMATE_INTEREST" &&
    ["LUSHA", "LUSHA_AND_APOLLO"].includes(String(value.source)) && value.previewRetentionDays === 30 &&
    value.revealedRetentionDays === 90 && typeof value.privacyContact === "string";
}

function isCompanyPhone(value: unknown): boolean {
  return isRecord(value) && isNullableString(value.value) && value.source === "APOLLO" && value.contactability === "UNKNOWN" &&
    typeof value.obtainedAt === "string" && typeof value.expiresAt === "string" &&
    ["AVAILABLE", "SUPPRESSED", "EXPIRED"].includes(String(value.governanceState));
}

function isCompanyMatch(value: unknown): boolean {
  return isRecord(value) && typeof value.companyMatchId === "string" && typeof value.companyName === "string" &&
    isNullableString(value.companyDomain) && isNullableString(value.industry) && isContactLocation(value.location) &&
    value.source === "LUSHA" && typeof value.obtainedAt === "string" && typeof value.expiresAt === "string";
}
