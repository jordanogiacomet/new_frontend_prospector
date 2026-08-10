import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContactEnrichmentAction,
  ContactEnrichmentProvider,
} from "./contact-enrichment-action";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function renderAction(initialDomain: string | null = null) {
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

beforeEach(() => {
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
  it("prefills one approved producer domain and keeps confirmation explicit", () => {
    renderAction("empresa.example");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Enriquecer lead e recuperar contatos/i,
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
        name: /Enriquecer lead e recuperar contatos/i,
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Domínio da empresa" }), {
      target: { value: "https://empresa.example/path" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));

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
    fireEvent.click(screen.getByRole("button", { name: /Enriquecer lead/i }));
    expect(screen.getByText(/pode consumir crédito/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Referência do lead/i)).toHaveTextContent(
      "Empresa Sintética · Recife / PE · Serviços sintéticos",
    );
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
                jobTitle: "Direção financeira",
                departments: ["Finance"],
                seniority: "Director",
                location: { city: "Recife", state: "PE", country: "Brasil" },
                linkedinUrl: null,
                canRevealWorkEmail: true,
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
    fireEvent.click(screen.getByRole("button", { name: /Enriquecer lead/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Domínio da empresa" }), {
      target: { value: "EMPRESA.EXAMPLE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));

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
    fireEvent.click(screen.getByRole("button", { name: /Enriquecer lead/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Domínio da empresa" }), {
      target: { value: "empresa.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar decisores" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Ver ou atualizar contatos" }),
    );
    expect(await screen.findByText("Contato bloqueou abordagens.")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    });
  });
});
