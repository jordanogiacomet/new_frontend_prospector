"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  ContactCandidateDto,
  ContactCompanyMatchDto,
  ContactCompanySearchRequestDto,
  ContactCompanySearchStatus,
  ContactPreviewRequestDto,
  ContactPreviewStatus,
} from "../../types/contact-enrichment";

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
}

interface ContactAttemptContextValue {
  readonly attempts: Readonly<Record<string, ContactAttempt>>;
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
  const value = useMemo<ContactAttemptContextValue>(
    () => ({
      attempts,
      update: (key, updater) => {
        setAttempts((current) => ({
          ...current,
          [key]: updater(current[key] ?? createAttempt()),
        }));
      },
    }),
    [attempts],
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
}: {
  readonly attemptKey: string;
  readonly companyName: string | null;
  readonly companyCity: string | null;
  readonly companyState: string | null;
  readonly companySector: string | null;
  readonly cnpj: string;
  readonly initialDomain: string | null;
}) {
  const context = useContactAttemptContext();
  const attempt = context.attempts[attemptKey] ?? createAttempt();
  const companyLabel = companyName ?? "esta empresa";
  const approvedInitialDomain = normalizeDomain(initialDomain ?? "");

  function update(
    updater: (current: ContactAttempt) => ContactAttempt,
  ): void {
    context.update(attemptKey, updater);
  }

  async function submitPreview(): Promise<void> {
    const domain = normalizeDomain(attempt.domain);
    if (domain === null) {
      update((current) => ({
        ...current,
        phase: "domain",
        message: "Informe somente o domínio, como empresa.com.br.",
      }));
      return;
    }

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
        update((current) => ({ ...current, phase: "denied" }));
        return;
      }
      if (response.status === 409) {
        update((current) => ({ ...current, phase: "conflict" }));
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }

      const payload = parseSubmissionEnvelope(await response.json());
      if (payload === null) {
        update((current) => ({ ...current, phase: "error" }));
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
      update((current) => ({ ...current, phase: "error" }));
    }
  }

  async function submitCompanySearch(): Promise<void> {
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
        update((current) => ({ ...current, phase: "denied" }));
        return;
      }
      if (response.status === 409) {
        update((current) => ({ ...current, phase: "conflict" }));
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }
      const payload = parseCompanySearchSubmissionEnvelope(
        await response.json(),
      );
      if (payload === null) {
        update((current) => ({ ...current, phase: "error" }));
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
      update((current) => ({ ...current, phase: "error" }));
    }
  }

  async function loadCompanyMatches(): Promise<void> {
    if (attempt.companySearchRequestId === null) return;
    update((current) => ({
      ...current,
      phase: "company_search_loading",
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
        update((current) => ({ ...current, phase: "denied" }));
        return;
      }
      if (response.status !== 200) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }
      const result = parseCompanySearchEnvelope(await response.json());
      if (result === null) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }
      update((current) => ({
        ...current,
        phase: phaseForCompanySearchResult(result),
        companySearchResult: result,
        message: null,
      }));
    } catch {
      update((current) => ({ ...current, phase: "error" }));
    }
  }

  async function submitMatchedCompanyPreview(
    match: ContactCompanyMatchDto,
  ): Promise<void> {
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
        update((current) => ({ ...current, phase: "denied" }));
        return;
      }
      if (response.status === 409) {
        update((current) => ({ ...current, phase: "conflict" }));
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }
      const payload = parseSubmissionEnvelope(await response.json());
      if (payload === null) {
        update((current) => ({ ...current, phase: "error" }));
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
      update((current) => ({ ...current, phase: "error" }));
    }
  }

  async function loadContacts(): Promise<void> {
    if (attempt.requestId === null) return;
    update((current) => ({ ...current, phase: "loading" }));

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
        update((current) => ({ ...current, phase: "denied" }));
        return;
      }
      if (response.status !== 200) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }

      const result = parsePreviewEnvelope(await response.json());
      if (result === null) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }
      update((current) => ({
        ...current,
        phase: phaseForResult(result),
        result,
        message: null,
      }));
    } catch {
      update((current) => ({ ...current, phase: "error" }));
    }
  }

  async function revealContact(
    contact: ContactCandidateDto,
  ): Promise<void> {
    if (attempt.requestId === null) return;
    const channels = [
      ...(contact.canRevealWorkEmail ? (["work_email"] as const) : []),
      ...(contact.canRevealBusinessPhone
        ? (["business_phone"] as const)
        : []),
    ];
    if (channels.length === 0) return;

    update((current) => ({ ...current, phase: "loading" }));
    try {
      const response = await fetch(
        `/api/contact-enrichment/v2/${encodeURIComponent(attempt.requestId)}/reveal`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": `${attempt.idempotencyKey}:reveal:${contact.contactId}`,
          },
          body: JSON.stringify({
            contact_id: contact.contactId,
            channels,
          }),
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      if (response.status === 401 || response.status === 403) {
        update((current) => ({ ...current, phase: "denied" }));
        return;
      }
      if (response.status === 409) {
        update((current) => ({ ...current, phase: "conflict" }));
        return;
      }
      if (response.status !== 200 && response.status !== 202) {
        update((current) => ({ ...current, phase: "error" }));
        return;
      }
      update((current) => ({
        ...current,
        phase: "submitted",
        message:
          "Recuperação solicitada. Atualize os contatos para consultar o resultado.",
      }));
    } catch {
      update((current) => ({ ...current, phase: "error" }));
    }
  }

  async function suppress(contactId: string): Promise<void> {
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
        update((current) => ({ ...current, phase: "error" }));
        return;
      }
      await loadContacts();
    } catch {
      update((current) => ({ ...current, phase: "error" }));
    }
  }

  return (
    <div className="mt-4" data-contact-attempt={attemptKey}>
      {attempt.phase === "idle" ? (
        <button
          type="button"
          onClick={() =>
            update((current) => ({
              ...current,
              phase: "domain",
              domain:
                current.domain === ""
                  ? (approvedInitialDomain ?? "")
                  : current.domain,
            }))
          }
          aria-label={`Enriquecer lead e recuperar contatos de ${companyLabel}`}
          className="inline-flex min-h-11 flex-col items-start justify-center border border-[oklch(45%_0.105_174)] bg-[oklch(97%_0.018_174)] px-3 py-2 text-left text-sm font-bold text-[oklch(32%_0.09_174)] transition-colors hover:border-[oklch(24%_0.035_252)] hover:bg-[oklch(94%_0.035_174)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)]"
        >
          <span>Enriquecer lead</span>
          <span className="mt-0.5 text-xs font-semibold text-[oklch(43%_0.03_252)]">
            Recuperar contatos
          </span>
        </button>
      ) : null}

      {attempt.phase === "domain" ? (
        <div className="max-w-sm border border-[oklch(82%_0.025_82)] bg-[oklch(99%_0.006_82)] p-3">
          {approvedInitialDomain === null &&
          normalizeCompanyName(companyName) !== null ? (
            <div className="mb-4 border-b border-[oklch(88%_0.02_82)] pb-4">
              <p className="text-sm font-bold text-[oklch(28%_0.035_252)]">
                Domínio não encontrado
              </p>
              <p className="mt-1 text-xs leading-5 text-[oklch(43%_0.03_252)]">
                A Lusha pode localizar uma empresa pela razão social. A busca
                pode consumir crédito e sempre exigirá sua confirmação antes
                de procurar decisores.
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
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  domain: event.target.value,
                  message: null,
                }))
              }
              className="mt-2 min-h-11 w-full border border-[oklch(72%_0.035_82)] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(45%_0.105_174)]"
            />
          </label>
          {approvedInitialDomain !== null &&
          attempt.domain === approvedInitialDomain ? (
            <p className="mt-2 text-xs text-[oklch(43%_0.03_252)]">
              Domínio encontrado nos dados da empresa. Confirme antes de buscar.
            </p>
          ) : null}
          {attempt.message ? (
            <p role="alert" className="mt-2 text-xs text-[oklch(42%_0.09_32)]">
              {attempt.message}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton onClick={() => void submitPreview()}>
              Buscar decisores
            </ActionButton>
            <button
              type="button"
              onClick={() =>
                update(() => createAttempt())
              }
              className="min-h-11 px-2 text-sm font-semibold underline"
            >
              Cancelar
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
            Busca registrada. Consulte o resultado para confirmar a empresa.
          </p>
          <div className="mt-2">
            <ActionButton onClick={() => void loadCompanyMatches()}>
              Ver empresa localizada
            </ActionButton>
          </div>
        </div>
      ) : null}

      {attempt.phase === "company_search_available" &&
      attempt.companySearchResult ? (
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
        />
      ) : null}

      {attempt.phase === "company_search_empty" ? (
        <div>
          <StatusMessage>
            Nenhuma empresa foi localizada com esse nome.
          </StatusMessage>
          <button
            type="button"
            onClick={() =>
              update((current) => ({ ...current, phase: "domain" }))
            }
            className="mt-2 min-h-11 text-sm font-semibold underline"
          >
            Informar domínio
          </button>
        </div>
      ) : null}

      {attempt.phase === "company_search_expired" ? (
        <StatusMessage>
          A confirmação da empresa expirou. Inicie uma nova busca.
        </StatusMessage>
      ) : null}

      {attempt.phase === "submitting" || attempt.phase === "loading" ? (
        <p role="status" className="text-sm text-[oklch(43%_0.03_252)]">
          Buscando contatos…
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

      {attempt.phase === "available" && attempt.result ? (
        <ContactResults
          result={attempt.result}
          onReveal={revealContact}
          onSuppress={suppress}
          onRefresh={loadContacts}
        />
      ) : null}

      {attempt.phase === "empty" ? (
        <StatusMessage>Nenhum contato profissional disponível.</StatusMessage>
      ) : null}
      {attempt.phase === "unknown" ? (
        <StatusMessage>Resultado não confirmado. Não houve nova tentativa automática.</StatusMessage>
      ) : null}
      {attempt.phase === "denied" ? (
        <StatusMessage>Seu perfil não permite recuperar ou visualizar contatos.</StatusMessage>
      ) : null}
      {attempt.phase === "conflict" ? (
        <StatusMessage>A solicitação conflita com uma tentativa já registrada.</StatusMessage>
      ) : null}
      {attempt.phase === "error" ? (
        <StatusMessage>Não foi possível concluir a consulta agora.</StatusMessage>
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
}) {
  return (
    <div className="mt-3 max-w-md border border-[oklch(72%_0.035_82)] bg-[oklch(99%_0.006_82)] p-3">
      <p className="text-sm font-bold text-[oklch(28%_0.035_252)]">
        Confirme a empresa localizada
      </p>
      <p className="mt-1 text-xs leading-5 text-[oklch(43%_0.03_252)]">
        A Lusha não informa uma pontuação de correspondência. Confira nome,
        domínio e local antes de buscar decisores.
      </p>
      <p className="mt-2 text-xs font-semibold leading-5 text-[oklch(38%_0.04_252)]">
        Referência do lead: {formatCompanyReference(reference)}
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
              <ActionButton onClick={() => void onConfirm(match)}>
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
          className="min-h-11 text-sm font-semibold underline"
        >
          Atualizar resultado
        </button>
        <button
          type="button"
          onClick={onManualDomain}
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
  onReveal,
  onSuppress,
  onRefresh,
}: {
  readonly result: ContactPreviewRequestDto;
  readonly onReveal: (contact: ContactCandidateDto) => Promise<void>;
  readonly onSuppress: (contactId: string) => Promise<void>;
  readonly onRefresh: () => Promise<void>;
}) {
  if (result.transparency === null || result.candidates === null) {
    return <StatusMessage>Resultado retido pela política de contatos.</StatusMessage>;
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
                Legítimo interesse · Lusha
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
            {[contact.location.city, contact.location.state, contact.location.country]
              .filter(Boolean).length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-[oklch(45%_0.055_174)]">
                {[contact.location.city, contact.location.state, contact.location.country]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            {contact.governanceState !== "AVAILABLE" ? (
              <p className="mt-2 text-xs font-semibold">
                {contact.governanceState === "SUPPRESSED"
                  ? "Contato bloqueou abordagens."
                  : "Contato expirado."}
              </p>
            ) : (
              <AvailableContactActions
                contact={contact}
                onReveal={onReveal}
                onSuppress={onSuppress}
              />
            )}
          </article>
        ))}
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="mt-1 min-h-11 text-sm font-semibold underline decoration-[oklch(45%_0.105_174)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)]"
        >
          Atualizar contatos
        </button>
      </section>
    </div>
  );
}

function AvailableContactActions({
  contact,
  onReveal,
  onSuppress,
}: {
  readonly contact: ContactCandidateDto;
  readonly onReveal: (contact: ContactCandidateDto) => Promise<void>;
  readonly onSuppress: (contactId: string) => Promise<void>;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
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
      {contact.channels === null &&
      (contact.canRevealWorkEmail || contact.canRevealBusinessPhone) ? (
        <ActionButton onClick={() => void onReveal(contact)}>
          Recuperar canais profissionais
        </ActionButton>
      ) : null}
      <button
        type="button"
        onClick={() => void onSuppress(contact.contactId)}
        className="min-h-11 px-1 text-xs font-semibold underline decoration-[oklch(45%_0.105_174)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)]"
      >
        Não contatar
      </button>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 border border-[oklch(45%_0.105_174)] bg-[oklch(97%_0.018_174)] px-3 py-2 text-sm font-bold text-[oklch(32%_0.09_174)] transition-colors hover:bg-[oklch(93%_0.04_174)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[oklch(45%_0.105_174)] active:bg-[oklch(90%_0.05_174)] motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

function StatusMessage({ children }: { readonly children: ReactNode }) {
  return (
    <p role="status" className="mt-3 text-sm leading-5 text-[oklch(43%_0.03_252)]">
      {children}
    </p>
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
  return typeof requestId === "string" && isPreviewStatus(status)
    ? { requestId, status }
    : null;
}

function parsePreviewEnvelope(value: unknown): ContactPreviewRequestDto | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  if (
    typeof data.requestId !== "string" ||
    !isPreviewStatus(data.status) ||
    typeof data.requestedAt !== "string" ||
    typeof data.updatedAt !== "string" ||
    (data.previewExpiresAt !== null &&
      typeof data.previewExpiresAt !== "string") ||
    (data.candidates !== null && !Array.isArray(data.candidates)) ||
    (data.transparency !== null && !isRecord(data.transparency))
  ) {
    return null;
  }
  return data as unknown as ContactPreviewRequestDto;
}

function parseCompanySearchSubmissionEnvelope(value: unknown): {
  readonly searchRequestId: string;
  readonly status: ContactCompanySearchStatus;
} | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const searchRequestId = value.data.searchRequestId;
  const status = value.data.status;
  return typeof searchRequestId === "string" && isCompanySearchStatus(status)
    ? { searchRequestId, status }
    : null;
}

function parseCompanySearchEnvelope(
  value: unknown,
): ContactCompanySearchRequestDto | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const data = value.data;
  if (
    typeof data.searchRequestId !== "string" ||
    !isCompanySearchStatus(data.status) ||
    typeof data.requestedAt !== "string" ||
    typeof data.updatedAt !== "string" ||
    (data.matchesExpiresAt !== null &&
      typeof data.matchesExpiresAt !== "string") ||
    !Array.isArray(data.matches)
  ) {
    return null;
  }
  return data as unknown as ContactCompanySearchRequestDto;
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
