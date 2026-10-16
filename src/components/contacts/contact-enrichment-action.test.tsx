import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { permissionState } = vi.hoisted(() => ({
  permissionState: {
    permissions: new Set([
      "contacts:enrich",
      "contacts:read",
      "contacts:reveal",
      "contacts:govern",
    ]),
  },
}));

vi.mock("../auth/private-capabilities", () => ({
  usePrivateCapabilities: () => ({
    hasPermission: (permission: string) =>
      permissionState.permissions.has(permission),
  }),
}));

import {
  ContactEnrichmentAction,
  ContactEnrichmentProvider,
} from "./contact-enrichment-action";
import type { ContactCandidateDto, ContactRevealProgressDto } from "../../types/contact-enrichment";

const recoveryId = "00000000-0000-4000-8000-000000000797";
const recoveryContactId = "00000000-0000-4000-8000-000000000799";

function selectWorkEmail() {
  fireEvent.click(screen.getByRole("button", { name: "Escolher canais profissionais" }));
  fireEvent.click(screen.getByLabelText("E-mail profissional"));
  return screen.getByRole("button", { name: "Recuperar canais selecionados" });
}

function recoveryProgress(status: ContactRevealProgressDto["status"], channelsMatchResult = false): ContactRevealProgressDto {
  return {
    revealRequestId: recoveryId, status, requestedChannels: ["work_email", "business_phone"],
    requestedAt: "2026-10-13T12:00:00.000Z", updatedAt: "2026-10-13T12:00:02.000Z", channelsMatchResult,
  };
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function renderAction(
  initialDomain: string | null = null,
  producerScore: number | null = 82,
) {
  return render(
    <ContactEnrichmentProvider>
      <ContactEnrichmentAction
        attemptKey="decision-synthetic-contact"
        companyName="Empresa Sintética"
        companyCity="Recife"
        companyState="PE"
        companySector="Serviços sintéticos"
        cnpj="12345678000195"
        initialDomain={initialDomain}
        producerScore={producerScore}
      />
    </ContactEnrichmentProvider>,
  );
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function previewSubmission(requestId: string) {
  return response(
    {
      data: {
        requestId,
        status: "PREVIEW_DISPATCHED",
        requestedAt: "2026-08-10T12:00:00.000Z",
        updatedAt: "2026-08-10T12:00:00.000Z",
      },
    },
    202,
  );
}

function availablePreview(
  requestId: string,
  options: {
    readonly email?: boolean;
    readonly phone?: boolean;
    readonly source?: "LUSHA" | "APOLLO";
    readonly channels?: ContactCandidateDto["channels"];
    readonly reveal?: ContactRevealProgressDto;
  } = {},
) {
  const source = options.source ?? "LUSHA";
  return response({
    data: {
      requestId,
      status: "PREVIEW_AVAILABLE",
      requestedAt: "2026-08-10T12:00:00.000Z",
      updatedAt: "2026-08-10T12:00:02.000Z",
      previewExpiresAt: "2026-09-09T12:00:02.000Z",
      transparency: {
        controllerLegalName: "Controlador Sintético Ltda.",
        controllerRegistration: null,
        purpose: "Prospecção B2B sintética.",
        legalBasis: "LEGITIMATE_INTEREST",
        source: source === "APOLLO" ? "LUSHA_AND_APOLLO" : "LUSHA",
        previewRetentionDays: 30,
        revealedRetentionDays: 90,
        privacyContact: "privacidade@example.test",
      },
      candidates: [
        {
          contactId: "00000000-0000-4000-8000-000000000799",
          fullName: source === "APOLLO" ? "Contato G." : "Contato Governado Sintético",
          jobTitle: "Controller",
          departments: ["Finance"],
          seniority: "Director",
          location: { city: "Recife", state: "PE", country: "Brasil" },
          linkedinUrl:
            source === "APOLLO"
              ? null
              : "https://www.linkedin.com/in/governado-sintetico",
          canRevealWorkEmail: options.email ?? true,
          canRevealBusinessPhone:
            options.phone ?? (source === "LUSHA"),
          source,
          obtainedAt: "2026-08-10T12:00:02.000Z",
          expiresAt: "2026-09-09T12:00:02.000Z",
          channels: options.channels ?? null,
          reveal: options.reveal ?? null,
          governanceState: "AVAILABLE",
        },
      ],
    },
  });
}

async function openAvailablePreview(
  options: {
    readonly email?: boolean;
    readonly phone?: boolean;
    readonly source?: "LUSHA" | "APOLLO";
  } = {},
) {
  const requestId = "00000000-0000-4000-8000-000000000798";
  fetchMock
    .mockResolvedValueOnce(previewSubmission(requestId))
    .mockResolvedValueOnce(availablePreview(requestId, options));
  renderAction("empresa.example");
  fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
  fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Ver ou atualizar contatos" }),
  );
  await screen.findByText(
    options.source === "APOLLO"
      ? "Contato G."
      : "Contato Governado Sintético",
  );
  return requestId;
}

beforeEach(() => {
  permissionState.permissions = new Set([
    "contacts:enrich",
    "contacts:read",
    "contacts:reveal",
    "contacts:govern",
  ]);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  if (globalThis.crypto.randomUUID === undefined) {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: () => "00000000-0000-4000-8000-000000000777",
    });
  }
});

describe("ContactEnrichmentAction", () => {
  it("does not offer contact actions without the exact contact permissions", () => {
    permissionState.permissions = new Set();
    renderAction("empresa.example");

    expect(
      screen.queryByRole("button", { name: /Encontrar contatos/i }),
    ).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Seu perfil não permite buscar ou visualizar contatos.",
    );
  });
  it("prefills one approved producer domain and keeps confirmation explicit", () => {
    renderAction("empresa.example");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Encontrar contatos de Empresa Sintética/i,
      }),
    );

    expect(
      screen.getByRole("textbox", { name: "Domínio da empresa" }),
    ).toHaveValue("empresa.example");
    expect(screen.getByText(/domínio encontrado/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates the company domain without making a request", async () => {
    renderAction();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Encontrar contatos de Empresa Sintética/i,
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Domínio da empresa" }), {
      target: { value: "https://empresa.example/path" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar decisores" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe somente o domínio",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("locates a company by name and requires explicit confirmation before preview", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          {
            data: {
              searchRequestId: "00000000-0000-4000-8000-000000000780",
              status: "SEARCH_DISPATCHED",
              requestedAt: "2026-08-06T12:00:00.000Z",
              updatedAt: "2026-08-06T12:00:00.000Z",
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            searchRequestId: "00000000-0000-4000-8000-000000000780",
            status: "SEARCH_AVAILABLE",
            requestedAt: "2026-08-06T12:00:00.000Z",
            updatedAt: "2026-08-06T12:00:02.000Z",
            matchesExpiresAt: "2026-08-07T12:00:02.000Z",
            matches: [
              {
                companyMatchId: "00000000-0000-4000-8000-000000000781",
                companyName: "Empresa Sintética",
                companyDomain: "empresa.example",
                industry: "Serviços profissionais",
                location: {
                  city: "Recife",
                  state: "PE",
                  country: "Brasil",
                },
                source: "LUSHA",
                obtainedAt: "2026-08-06T12:00:02.000Z",
                expiresAt: "2026-08-07T12:00:02.000Z",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        response(
          {
            data: {
              requestId: "00000000-0000-4000-8000-000000000782",
              status: "PREVIEW_DISPATCHED",
              requestedAt: "2026-08-06T12:00:03.000Z",
              updatedAt: "2026-08-06T12:00:03.000Z",
            },
          },
          202,
        ),
      );

    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    expect(screen.getByText("Localize a empresa")).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Busque pelo nome da empresa, com cidade e UF quando disponíveis.",
    );
    expect(document.body).toHaveTextContent(
      "Confirme a empresa encontrada antes de buscar decisores.",
    );
    expect(screen.getByText(/pode consumir crédito/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Localizar empresa pelo nome" }),
    );
    expect(
      await screen.findByRole("button", { name: "Ver empresa localizada" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/contact-enrichment/v2/company-search",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        cnpj_normalizado: "12345678000195",
        company_name: "Empresa Sintética",
        company_city: "Recife",
        company_state: "PE",
        company_country_iso2: "BR",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Ver empresa localizada" }),
    );
    expect(
      await screen.findByText(/Serviços profissionais/),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Dados desta ficha:/i)).toHaveTextContent(
      "Empresa Sintética · Recife / PE · Serviços sintéticos",
    );
    expect(
      screen.getByText(/compare nome, domínio e localização com os dados desta ficha/i),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Usar esta empresa" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Ver ou atualizar contatos",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/contact-enrichment/v2",
    );
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({
        cnpj_normalizado: "12345678000195",
        company_match_id: "00000000-0000-4000-8000-000000000781",
      }),
    );
    for (const [url] of fetchMock.mock.calls) {
      expect(url).not.toMatch(/n8n|lusha|192\.168\./i);
    }
  });

  it("checks the recorded company search after an unknown dispatch without submitting again", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          {
            data: {
              searchRequestId: "00000000-0000-4000-8000-000000000783",
              status: "DISPATCH_OUTCOME_UNKNOWN",
              requestedAt: "2026-08-10T12:00:00.000Z",
              updatedAt: "2026-08-10T12:00:00.000Z",
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            searchRequestId: "00000000-0000-4000-8000-000000000783",
            status: "SEARCH_AVAILABLE",
            requestedAt: "2026-08-10T12:00:00.000Z",
            updatedAt: "2026-08-10T12:00:02.000Z",
            matchesExpiresAt: "2026-08-11T12:00:02.000Z",
            matches: [
              {
                companyMatchId: "00000000-0000-4000-8000-000000000784",
                companyName: "Empresa Sintética",
                companyDomain: "empresa.example",
                industry: "Serviços profissionais",
                location: {
                  city: "Recife",
                  state: "PE",
                  country: "Brasil",
                },
                source: "LUSHA",
                obtainedAt: "2026-08-10T12:00:02.000Z",
                expiresAt: "2026-08-11T12:00:02.000Z",
              },
            ],
          },
        }),
      );

    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Localizar empresa pelo nome" }),
    );

    const checkButton = await screen.findByRole("button", {
      name: "Ver empresa localizada",
    });
    expect(screen.getByText(/pedido já registrado/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(checkButton);

    expect(await screen.findByText(/Serviços profissionais/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/contact-enrichment/v2/company-search",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/contact-enrichment/v2/company-search/00000000-0000-4000-8000-000000000783",
    );
  });

  it("shows pending feedback and requires an explicit restart after an unknown company result", async () => {
    const searchRequestId = "00000000-0000-4000-8000-000000000785";
    fetchMock
      .mockResolvedValueOnce(
        response(
          {
            data: {
              searchRequestId,
              status: "SEARCH_DISPATCHED",
              requestedAt: "2026-08-11T12:00:00.000Z",
              updatedAt: "2026-08-11T12:00:00.000Z",
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            searchRequestId,
            status: "SEARCH_DISPATCHED",
            requestedAt: "2026-08-11T12:00:00.000Z",
            updatedAt: "2026-08-11T12:00:00.000Z",
            matchesExpiresAt: null,
            matches: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            searchRequestId,
            status: "PROVIDER_OUTCOME_UNKNOWN",
            requestedAt: "2026-08-11T12:00:00.000Z",
            updatedAt: "2026-08-11T12:00:30.000Z",
            matchesExpiresAt: null,
            matches: [],
          },
        }),
      );

    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Localizar empresa pelo nome" }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Ver empresa localizada" }),
    );
    expect(
      await screen.findByText(/busca ainda está em processamento/i),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Ver empresa localizada" }),
    );
    expect(
      await screen.findByText(/fonte não confirmou o resultado/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/pode consumir um novo crédito/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.slice(1).every(([, init]) => init?.method === undefined)).toBe(
      true,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar nova busca" }),
    );
    expect(
      screen.getByRole("button", { name: "Localizar empresa pelo nome" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("calls only Prospecta with a stable idempotency key and loads contacts explicitly", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          {
            data: {
              requestId: "00000000-0000-4000-8000-000000000701",
              status: "PREVIEW_DISPATCHED",
              requestedAt: "2026-07-31T12:00:00.000Z",
              updatedAt: "2026-07-31T12:00:00.000Z",
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            requestId: "00000000-0000-4000-8000-000000000701",
            status: "PREVIEW_AVAILABLE",
            requestedAt: "2026-07-31T12:00:00.000Z",
            updatedAt: "2026-07-31T12:00:02.000Z",
            previewExpiresAt: "2026-08-30T12:00:02.000Z",
            transparency: {
              controllerLegalName: "Controlador Sintético Ltda.",
              controllerRegistration: "00.000.000/0001-00",
              purpose: "Prospecção B2B sintética.",
              legalBasis: "LEGITIMATE_INTEREST",
              source: "LUSHA",
              previewRetentionDays: 30,
              revealedRetentionDays: 90,
              privacyContact: "privacidade@example.test",
            },
            candidates: [
              {
                contactId: "00000000-0000-4000-8000-000000000702",
                fullName: "Contato Sintético",
                jobTitle: "Controller",
                departments: ["Finance"],
                seniority: "Director",
                location: { city: "Recife", state: "PE", country: "Brasil" },
                linkedinUrl: "https://www.linkedin.com/in/contato-sintetico",
                canRevealWorkEmail: true,
                canRevealBusinessPhone: false,
                source: "LUSHA",
                obtainedAt: "2026-07-31T12:00:02.000Z",
                expiresAt: "2026-08-30T12:00:02.000Z",
                channels: null,
                governanceState: "AVAILABLE",
              },
              {
                contactId: "00000000-0000-4000-8000-000000000703",
                fullName: "Contato sem LinkedIn",
                jobTitle: "Vice President of Operations",
                departments: ["Operations"],
                seniority: "Vice President",
                location: { city: null, state: null, country: "Brasil" },
                linkedinUrl: null,
                canRevealWorkEmail: false,
                canRevealBusinessPhone: false,
                source: "LUSHA",
                obtainedAt: "2026-07-31T12:00:02.000Z",
                expiresAt: "2026-08-30T12:00:02.000Z",
                channels: null,
                governanceState: "AVAILABLE",
              },
            ],
          },
        }),
      );

    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    expect(
      screen.getByText(/prioriza patrimônio e ativo imobilizado/i),
    ).toHaveTextContent(
      /contabilidade, controladoria e finanças, e responsáveis por inventário e estoques/i,
    );
    expect(document.body).toHaveTextContent(
      /você escolhe se deseja recuperar e-mail ou telefone profissional/i,
    );
    expect(document.body).toHaveTextContent(
      /recuperar canais profissionais é uma etapa separada e pode consumir créditos/i,
    );
    expect(document.body).not.toHaveTextContent(
      /pode consumir créditos de busca da Lusha/i,
    );
    expect(document.body).not.toHaveTextContent(/Lusha|Apollo/i);
    fireEvent.change(screen.getByRole("textbox", { name: "Domínio da empresa" }), {
      target: { value: "EMPRESA.EXAMPLE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar decisores" }),
    );

    const viewButton = await screen.findByRole("button", {
      name: "Ver ou atualizar contatos",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [submissionUrl, submissionInit] = fetchMock.mock.calls[0] ?? [];
    expect(submissionUrl).toBe("/api/contact-enrichment/v2");
    expect(submissionInit?.body).toBe(
      JSON.stringify({
        cnpj_normalizado: "12345678000195",
        company_domain: "empresa.example",
      }),
    );
    const idempotencyKey = new Headers(submissionInit?.headers).get(
      "Idempotency-Key",
    );
    expect(idempotencyKey).toMatch(/^contact-preview-/);

    fireEvent.click(viewButton);
    expect(await screen.findByText("Contato Sintético")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Decisores localizados" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Uso responsável dos contatos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Contato Sintético" }),
    ).toBeInTheDocument();
    const linkedinLink = screen.getByRole("link", {
      name: "Abrir LinkedIn de Contato Sintético",
    });
    expect(linkedinLink).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/contato-sintetico",
    );
    expect(linkedinLink).toHaveAttribute("target", "_blank");
    expect(linkedinLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(linkedinLink).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByText("LinkedIn não informado")).toBeInTheDocument();

    expect(screen.getByText("Pontuação do produtor: 82")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Calcular pontuação desta consulta" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pontuação comercial: 97",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Perfil aplicado: Controller · bônus +15",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "A pontuação do produtor não foi alterada",
    );
    expect(document.body).toHaveTextContent(
      "30 dias para prévia · 90 dias para canais",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/contact-enrichment/v2/00000000-0000-4000-8000-000000000701",
    );
    for (const [url] of fetchMock.mock.calls) {
      expect(url).not.toMatch(/n8n|lusha|192\.168\./i);
    }
  });

  it("identifies the factual provider source for each returned candidate", async () => {
    await openAvailablePreview({ source: "APOLLO" });

    expect(screen.getByText("Fonte: Apollo")).toBeInTheDocument();
    expect(screen.getByText("Nome mascarado na prévia da fonte.")).toBeInTheDocument();
    expect(
      screen.getByText("LinkedIn não disponível na prévia Apollo"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Legítimo interesse · Lusha e Apollo"),
    ).toBeInTheDocument();
  });

  it("shows a corporate-phone fallback separately without making it callable or scoring it", async () => {
    const requestId = "00000000-0000-4000-8000-000000000796";
    fetchMock
      .mockResolvedValueOnce(previewSubmission(requestId))
      .mockResolvedValueOnce(
        response({
          data: {
            requestId,
            status: "PREVIEW_AVAILABLE",
            requestedAt: "2026-08-11T12:00:00.000Z",
            updatedAt: "2026-08-11T12:00:02.000Z",
            previewExpiresAt: "2026-09-10T12:00:02.000Z",
            transparency: {
              controllerLegalName: "Controlador Sintético Ltda.",
              controllerRegistration: null,
              purpose: "Prospecção B2B sintética.",
              legalBasis: "LEGITIMATE_INTEREST",
              source: "LUSHA_AND_APOLLO",
              previewRetentionDays: 30,
              revealedRetentionDays: 90,
              privacyContact: "privacidade@example.test",
            },
            candidates: [],
            companyPhoneFallback: {
              value: "+551133334444",
              source: "APOLLO",
              contactability: "UNKNOWN",
              obtainedAt: "2026-08-11T12:00:02.000Z",
              expiresAt: "2026-09-10T12:00:02.000Z",
              governanceState: "AVAILABLE",
            },
          },
        }),
      );

    renderAction("empresa.example", 73);
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Ver ou atualizar contatos" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Telefone geral da empresa" }),
    ).toBeInTheDocument();
    expect(screen.getByText("+551133334444")).toBeInTheDocument();
    expect(screen.getByText(/possibilidade de contato não informada/i)).toBeInTheDocument();
    expect(screen.getByText("Fonte: Apollo")).toBeInTheDocument();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Calcular pontuação desta consulta" }),
    ).not.toBeInTheDocument();
  });

  it("describes an empty decision-maker query without claiming company absence", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          {
            data: {
              requestId: "00000000-0000-4000-8000-000000000721",
              status: "PREVIEW_DISPATCHED",
              requestedAt: "2026-08-10T12:00:00.000Z",
              updatedAt: "2026-08-10T12:00:00.000Z",
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            requestId: "00000000-0000-4000-8000-000000000721",
            status: "PREVIEW_EMPTY",
            requestedAt: "2026-08-10T12:00:00.000Z",
            updatedAt: "2026-08-10T12:00:02.000Z",
            previewExpiresAt: null,
            transparency: null,
            candidates: [],
          },
        }),
      );

    renderAction("empresa.example");
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar decisores" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Ver ou atualizar contatos" }),
    );

    expect(
      await screen.findByText(
        "Nenhum decisor disponível nesta consulta.",
      ),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      "Essa amostra não comprova que a empresa não possui contatos profissionais.",
    );
    expect(document.body).not.toHaveTextContent(
      "A empresa não possui perfis prioritários",
    );
    expect(document.body).toHaveTextContent("Não é possível confirmar quais consultas foram concluídas.");
    expect(document.body).not.toHaveTextContent("nas consultas da Lusha e do Apollo");
  });

  it.each([
    { status: "PREVIEW_FAILED", provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "ACCESS_DENIED", text: "Lusha recusou o acesso à consulta." },
    { status: "PREVIEW_EMPTY", provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NO_MATCHES", text: "Apollo não retornou decisores válidos nesta amostra." },
    { status: "PREVIEW_EMPTY", provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES", text: "Lusha retornou perfis, mas nenhum dos cargos desta amostra corresponde às áreas prioritárias." },
    { status: "PREVIEW_EMPTY", provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES", text: "Apollo retornou perfis, mas nenhum dos cargos desta amostra corresponde às áreas prioritárias." },
    { status: "PREVIEW_EMPTY", provider: "APOLLO", stage: "COMPANY_MATCH", code: "DOMAIN_UNAVAILABLE", text: "Apollo não foi consultado porque a empresa confirmada não possui um domínio válido" },
    { status: "PROVIDER_OUTCOME_UNKNOWN", provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "TIMEOUT", text: "O tempo de espera pela resposta do Apollo foi excedido." },
    { status: "PREVIEW_FAILED", provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "RATE_LIMITED", text: "Apollo informou que o limite de consultas foi atingido." },
  ])("shows a factual reason for $provider $code without requesting another search", async ({ status, provider, stage, code, text }) => {
    const requestId = "00000000-0000-4000-8000-000000000776";
    fetchMock.mockResolvedValueOnce(previewSubmission(requestId)).mockResolvedValueOnce(response({
      data: {
        requestId, status,
        requestedAt: "2026-10-06T12:00:00.000Z",
        updatedAt: "2026-10-06T12:00:02.000Z",
        previewExpiresAt: null,
        transparency: null,
        candidates: [],
        searchDiagnostics: [{ provider, stage, code }],
      },
    }));
    renderAction("empresa.example");
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver ou atualizar contatos" }));
    expect(await screen.findByRole("region", { name: "Resultado das consultas" })).toHaveTextContent(text);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBeUndefined();
    expect(document.body).not.toHaveTextContent("créditos esgotados");
  });

  it("reports when a provider confirms failure without giving a reason", async () => {
    const requestId = "00000000-0000-4000-8000-000000000777";
    fetchMock.mockResolvedValueOnce(previewSubmission(requestId)).mockResolvedValueOnce(response({ data: {
      requestId, status: "PREVIEW_FAILED", requestedAt: "2026-10-06T12:00:00.000Z",
      updatedAt: "2026-10-06T12:00:02.000Z", previewExpiresAt: null, candidates: [], transparency: null,
    } }));
    renderAction("empresa.example");
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver ou atualizar contatos" }));
    expect(await screen.findByText(/A fonte confirmou uma falha nesta consulta, mas não informou o motivo./)).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Motivo não informado");
  });

  it("explains the HTTPS gate using a known safe code and ignores server text", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: {
      code: "CONTACT_DATA_HTTPS_REQUIRED", message: "secret raw provider body",
    } }, 503));
    renderAction("empresa.example");
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A consulta de contatos requer uma conexão segura.");
    expect(document.body).not.toHaveTextContent("secret raw provider body");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not render contact links for a suppressed person", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          data: {
            requestId: "00000000-0000-4000-8000-000000000711",
            status: "PREVIEW_DISPATCHED",
            requestedAt: "2026-07-31T12:00:00.000Z",
            updatedAt: "2026-07-31T12:00:00.000Z",
          },
        }, 202),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            requestId: "00000000-0000-4000-8000-000000000711",
            status: "PREVIEW_AVAILABLE",
            requestedAt: "2026-07-31T12:00:00.000Z",
            updatedAt: "2026-07-31T12:00:02.000Z",
            previewExpiresAt: "2026-08-30T12:00:02.000Z",
            transparency: {
              controllerLegalName: "Controlador Sintético Ltda.",
              controllerRegistration: null,
              purpose: "Prospecção B2B sintética.",
              legalBasis: "LEGITIMATE_INTEREST",
              source: "LUSHA",
              previewRetentionDays: 30,
              revealedRetentionDays: 90,
              privacyContact: "privacidade@example.test",
            },
            candidates: [
              {
                contactId: "00000000-0000-4000-8000-000000000712",
                fullName: "Contato indisponível",
                jobTitle: null,
                departments: [],
                seniority: null,
                location: { city: null, state: null, country: null },
                linkedinUrl: null,
                canRevealWorkEmail: false,
                canRevealBusinessPhone: false,
                source: "LUSHA",
                obtainedAt: "2026-07-31T12:00:02.000Z",
                expiresAt: "2026-08-30T12:00:02.000Z",
                channels: null,
                governanceState: "SUPPRESSED",
              },
            ],
          },
        }),
      );
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Domínio da empresa" }), {
      target: { value: "empresa.example" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Buscar decisores" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Ver ou atualizar contatos" }),
    );
    expect(await screen.findByText(/Contato bloqueado para abordagem./)).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    });
  });

  it("requires an explicit channel selection before revealing contact data", async () => {
    const requestId = await openAvailablePreview();
    fetchMock.mockResolvedValueOnce(
      response(
        {
          data: {
            requestId,
            revealRequestId: "00000000-0000-4000-8000-000000000797",
            status: "REVEAL_DISPATCHED",
          },
        },
        202,
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Escolher canais profissionais" }),
    );
    expect(screen.getByLabelText("E-mail profissional")).not.toBeChecked();
    expect(screen.getByLabelText("Telefone profissional")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Recuperar canais selecionados" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByLabelText("E-mail profissional"));
    fireEvent.click(
      screen.getByRole("button", { name: "Recuperar canais selecionados" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [, revealInit] = fetchMock.mock.calls[2] ?? [];
    expect(revealInit?.body).toBe(
      JSON.stringify({
        contact_id: "00000000-0000-4000-8000-000000000799",
        channels: ["work_email"],
      }),
    );
    expect(
      new Headers(revealInit?.headers).get("Idempotency-Key"),
    ).toContain(":work_email");
  });

  it("keeps reveal and governance actions behind their independent permissions", async () => {
    permissionState.permissions = new Set(["contacts:enrich", "contacts:read"]);
    await openAvailablePreview();

    expect(
      screen.queryByRole("button", { name: "Escolher canais profissionais" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Não contatar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Abrir LinkedIn de Contato Governado Sintético",
      }),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before suppressing a contact and blocks duplicate clicks", async () => {
    await openAvailablePreview();

    fireEvent.click(screen.getByRole("button", { name: "Não contatar" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText(/bloqueia futuras abordagens por todos os canais/i),
    ).toBeInTheDocument();

    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar não contatar" }),
    );

    expect(
      screen.getByRole("button", { name: "Bloqueando contato…" }),
    ).toBeDisabled();
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/suppress");
  });

  it("does not start a new search after an unconfirmed failed contact submission", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: { code: "FAILED" } }, 500));
    renderAction("empresa.example");
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));

    expect(
      await screen.findByText(/O registro desta busca não pôde ser confirmado/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar nova busca" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers from an expired company confirmation without an automatic retry", async () => {
    const searchRequestId = "00000000-0000-4000-8000-000000000797";
    fetchMock
      .mockResolvedValueOnce(
        response(
          {
            data: {
              searchRequestId,
              status: "SEARCH_DISPATCHED",
              requestedAt: "2026-08-10T12:00:00.000Z",
              updatedAt: "2026-08-10T12:00:00.000Z",
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            searchRequestId,
            status: "SEARCH_EXPIRED",
            requestedAt: "2026-08-10T12:00:00.000Z",
            updatedAt: "2026-08-10T12:01:00.000Z",
            matchesExpiresAt: "2026-08-10T12:00:30.000Z",
            matches: [],
          },
        }),
      );
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Localizar empresa pelo nome" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Ver empresa localizada" }),
    );

    expect(
      await screen.findByText(/confirmação da empresa expirou/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Iniciar nova busca" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Informar domínio" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("contact recovery feedback", () => {
  it.each([500, 503, 201])("treats unexpected preview HTTP %s as unconfirmed without a new key or POST", async (status) => {
    fetchMock.mockResolvedValueOnce(response({ error: { code: "DATA_SOURCE_UNAVAILABLE" } }, status));
    renderAction("empresa.example");
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    const button = screen.getByRole("button", { name: "Buscar decisores" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByText(/O registro desta busca não pôde ser confirmado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar nova busca" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirmed company visible and prevents redispatch when its preview acceptance is unknown", async () => {
    const searchRequestId = "00000000-0000-4000-8000-000000000795";
    fetchMock.mockResolvedValueOnce(response({ data: { searchRequestId, status: "SEARCH_DISPATCHED" } }, 202))
      .mockResolvedValueOnce(response({ data: {
        searchRequestId, status: "SEARCH_AVAILABLE", requestedAt: "2026-10-13T12:00:00Z", updatedAt: "2026-10-13T12:00:01Z",
        matchesExpiresAt: "2026-10-14T12:00:00Z", matches: [{
          companyMatchId: "00000000-0000-4000-8000-000000000796", companyName: "Empresa Confirmada Sintética", companyDomain: "empresa.example",
          industry: null, location: { city: "Recife", state: "PE", country: "Brasil" }, source: "LUSHA",
          obtainedAt: "2026-10-13T12:00:01Z", expiresAt: "2026-10-14T12:00:00Z",
        }],
      } })).mockResolvedValueOnce(response({ error: { code: "DATA_SOURCE_UNAVAILABLE" } }, 503));
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /Encontrar contatos/i }));
    fireEvent.click(screen.getByRole("button", { name: "Localizar empresa pelo nome" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver empresa localizada" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar esta empresa" }));
    expect(await screen.findByText(/O registro desta busca não pôde ser confirmado/)).toBeInTheDocument();
    expect(screen.getByText("Empresa Confirmada Sintética")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar esta empresa" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("button", { name: "Iniciar nova busca" })).not.toBeInTheDocument();
  });

  it.each([
    [409, "CONTACT_REVEAL_UNAVAILABLE", "não estão disponíveis para recuperação"],
    [404, "CONTACT_PREVIEW_NOT_FOUND", "solicitação não foi encontrada"],
    [409, "CONTACT_REVEAL_IDEMPOTENCY_CONFLICT", "conflita com uma solicitação já registrada"],
    [401, "AUTHENTICATION_REQUIRED", "Sua sessão expirou"],
    [403, "ACCESS_DENIED", "não permite esta ação"],
  ])("preserves selected channels and shows the safe action-local reason for %s %s", async (status, code, text) => {
    const requestId = await openAvailablePreview();
    fetchMock.mockResolvedValueOnce(response({ error: { code, message: "raw private provider detail" } }, status));
    fireEvent.click(selectWorkEmail());
    const card = screen.getByRole("article", { name: "Contato Governado Sintético" });
    expect(await within(card).findByRole("alert")).toHaveTextContent(text);
    if (status === 401 || status === 403) expect(screen.getByRole("button", { name: "Recuperar canais selecionados" })).toBeDisabled();
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    expect(screen.getByLabelText("Telefone profissional")).not.toBeChecked();
    expect(document.body).not.toHaveTextContent("raw private provider detail");
    if (status === 401) expect(within(card).getByRole("link", { name: "Entrar novamente" })).toHaveAttribute("href", "/login");

    fetchMock.mockRejectedValueOnce(new Error("private network detail"));
    fireEvent.click(within(card).getByRole("button", { name: "Consultar pedido existente" }));
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[3]?.[0]).toBe(`/api/contact-enrichment/v2/${requestId}`);
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBeUndefined();
    expect(screen.getByRole("article", { name: "Contato Governado Sintético" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    expect(document.body).not.toHaveTextContent("private network detail");
  });

  it.each([
    ["REQUEST_RECORDED", "envio ainda não foi confirmado"],
    ["REVEAL_DISPATCHED", "aguardando resposta"],
    ["DISPATCH_OUTCOME_UNKNOWN", "permanece desconhecido"],
    ["PROVIDER_OUTCOME_UNKNOWN", "permanece desconhecido"],
    ["REVEAL_EMPTY", "encerrada sem canais profissionais disponíveis"],
    ["REVEAL_FAILED", "registrou uma falha"],
    ["REVEAL_AVAILABLE", "conclusão ainda não foi validada"],
  ])("reads business status %s without treating a 202 as completion", async (status, text) => {
    const requestId = await openAvailablePreview();
    fetchMock.mockResolvedValueOnce(response({ data: { requestId, revealRequestId: recoveryId, status } }, 202));
    fireEvent.click(selectWorkEmail());
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    expect(screen.getByRole("button", { name: "Recuperar canais selecionados" })).toBeDisabled();
    expect(document.body).not.toHaveTextContent("Recuperação concluída");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["network", "invalid", "wrong-request", "invalid-reveal-id"])("keeps an unknown recovery consultable after %s without a second mutation", async (failure) => {
    await openAvailablePreview();
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("synthetic connection failure"));
    else fetchMock.mockResolvedValueOnce(response({ data: failure === "invalid"
      ? { status: "REVEAL_COMPLETED" }
      : failure === "invalid-reveal-id" ? { requestId: "00000000-0000-4000-8000-000000000798", revealRequestId: "invalid", status: "REVEAL_DISPATCHED" }
      : { requestId: "another-request", revealRequestId: recoveryId, status: "REVEAL_DISPATCHED" } }, 202));
    const button = selectWorkEmail();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("não pôde ser confirmado");
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    expect(screen.getByRole("button", { name: "Recuperar canais selecionados" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Consultar pedido existente" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("blocks duplicate recovery while pending and retains the card throughout GET recovery", async () => {
    const requestId = await openAvailablePreview();
    let finish!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    const button = selectWorkEmail();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Solicitando canais…" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    finish(response({ data: { requestId, revealRequestId: recoveryId, status: "REVEAL_DISPATCHED" } }, 202));
    await screen.findByText(/Recuperação enviada e aguardando resposta/);

    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
    const card = screen.getByRole("article", { name: "Contato Governado Sintético" });
    fireEvent.click(within(card).getByRole("button", { name: "Consultar pedido existente" }));
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    expect(screen.getByRole("button", { name: "Atualizando contatos…" })).toBeDisabled();
    finish(availablePreview(requestId, { reveal: recoveryProgress("REVEAL_EMPTY") }));
    expect(await within(card).findByText(/Recuperação encerrada sem canais profissionais/)).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([
    [false, "Recuperação parcial"],
    [true, "Recuperação concluída"],
  ])("reports channels as %s only from the recorded result and returned channel facts", async (both, text) => {
    const requestId = await openAvailablePreview();
    fetchMock.mockResolvedValueOnce(availablePreview(requestId, {
      reveal: recoveryProgress("REVEAL_AVAILABLE", true),
      channels: {
        workEmails: [{ value: "sintetico@example.test", confidence: null, sourceUpdatedAt: null }],
        businessPhones: both ? [{ value: "+551133334444", type: "work", sourceUpdatedAt: null }] : [],
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "Atualizar contatos" }));
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("explains unavailable channels and independent permissions without inferring a cause", async () => {
    permissionState.permissions = new Set(["contacts:enrich", "contacts:read"]);
    await openAvailablePreview({ email: false, phone: false });
    expect(screen.getByText(/Seu perfil não permite recuperar canais/)).toBeInTheDocument();
    expect(screen.getByText(/Seu perfil não permite registrar bloqueios/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves preview channels when an invalid refresh arrives and does not invent success", async () => {
    await openAvailablePreview();
    selectWorkEmail();
    fetchMock.mockResolvedValueOnce(response({ data: {
      requestId: "00000000-0000-4000-8000-000000000798", status: "PREVIEW_AVAILABLE",
      requestedAt: "2026-10-13T12:00:00Z", updatedAt: "2026-10-13T12:00:02Z",
      previewExpiresAt: null, candidates: [{ contactId: recoveryContactId }], transparency: {},
    } }));
    fireEvent.click(screen.getByRole("button", { name: "Atualizar contatos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O resultado anterior foi preservado");
    expect(screen.getByLabelText("E-mail profissional")).toBeChecked();
    expect(screen.getByRole("article", { name: "Contato Governado Sintético" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
