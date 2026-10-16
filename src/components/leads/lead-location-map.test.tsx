import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeadLocationMap } from "./lead-location-map";

describe("lead location map", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an embedded approximate map from city and UF only", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "available",
            precision: "municipality_center",
            latitude: -3.7932167,
            longitude: -38.5280359,
            boundingBox: [
              -38.6379078,
              -3.8945441,
              -38.4013259,
              -3.6921047,
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <LeadLocationMap
        cnpj="01340525000139"
        city="Fortaleza"
        leadRunId={`lr_${"a".repeat(64)}`}
        uf="CE"
      />,
    );

    const region = screen.getByRole("region", {
      name: "Localização da empresa",
    });
    expect(region).toHaveTextContent("Fortaleza / CE");
    expect(region).toHaveTextContent("Referência aproximada");
    expect(
      screen.getByRole("status", { name: "Carregando mapa" }),
    ).toBeInTheDocument();

    const map = await screen.findByTitle(
      "Mapa aproximado de Fortaleza / CE",
    );
    const src = map.getAttribute("src");
    expect(src).not.toBeNull();
    const embedUrl = new URL(src ?? "");
    expect(embedUrl.origin).toBe("https://www.openstreetmap.org");
    expect(embedUrl.pathname).toBe("/export/embed.html");
    expect(embedUrl.searchParams.get("marker")).toBe(
      "-3.7932167,-38.5280359",
    );
    expect(embedUrl.searchParams.get("bbox")).toBe(
      "-38.6379078,-3.8945441,-38.4013259,-3.6921047",
    );
    expect(map).toHaveAttribute("loading", "lazy");
    expect(map).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("calls only the private Prospecta endpoint from the browser", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "unavailable" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <LeadLocationMap
        cnpj="01340525000139"
        city="Recife"
        leadRunId={`lr_${"b".repeat(64)}`}
        uf="PE"
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/leads/01340525000139/location-map?leadRunId=lr_${"b".repeat(64)}`,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        method: "GET",
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("PLASFORT");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("Recife");
    expect(
      await screen.findByText("Localização indisponível"),
    ).toBeInTheDocument();
  });

  it("reuses a valid session result without geocoding the same location again", async () => {
    window.sessionStorage.setItem(
      "prospecta:lead-map:v4:11222333000181|recife|pe",
      JSON.stringify({
        precision: "municipality_center",
        latitude: -8.0584933,
        longitude: -34.8848193,
        boundingBox: [-34.951, -8.161, -34.784, -7.929],
      }),
    );

    render(
      <LeadLocationMap
        cnpj="11222333000181"
        city="Recife"
        leadRunId={`lr_${"c".repeat(64)}`}
        uf="PE"
      />,
    );

    expect(
      await screen.findByTitle("Mapa aproximado de Recife / PE"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries registered-address resolution before an honest unavailable state", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "unavailable" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <LeadLocationMap
        cnpj="11222333000181"
        city={null}
        leadRunId={`lr_${"d".repeat(64)}`}
        uf={null}
      />,
    );

    const region = screen.getByRole("region", {
      name: "Localização da empresa",
    });
    expect(
      await screen.findByText("Localização indisponível"),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent("Localização indisponível");
    expect(region).toHaveTextContent(
      "Não foi possível localizar um endereço cadastral nem uma referência municipal para esta empresa.",
    );
    expect(
      screen.queryByTitle(/Mapa aproximado/),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows an honest failure and retries only after an explicit action", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("synthetic geocoder failure"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              status: "available",
              precision: "municipality_center",
              latitude: -23.5506507,
              longitude: -46.6333824,
              boundingBox: [
                -46.826,
                -24.007,
                -46.365,
                -23.356,
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    render(
      <LeadLocationMap
        cnpj="11222333000181"
        city="São Paulo"
        leadRunId={`lr_${"e".repeat(64)}`}
        uf="SP"
      />,
    );

    expect(
      await screen.findByRole("alert", { name: "Mapa indisponível" }),
    ).toHaveTextContent("Não foi possível carregar a localização agora.");
    expect(fetchMock).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Tentar carregar o mapa" }),
    );

    expect(
      await screen.findByTitle("Mapa aproximado de São Paulo / SP"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("centers the marker on a registered-address point with honest copy", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "available",
            precision: "registered_address",
            latitude: -3.731862,
            longitude: -38.52667,
            boundingBox: [-38.53067, -3.734862, -38.52267, -3.728862],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <LeadLocationMap
        cnpj="01340525000139"
        city="Fortaleza"
        leadRunId={`lr_${"f".repeat(64)}`}
        uf="CE"
      />,
    );

    const map = await screen.findByTitle(
      "Mapa da sede cadastral aproximada de Fortaleza / CE",
    );
    const url = new URL(map.getAttribute("src") ?? "");
    expect(url.searchParams.get("marker")).toBe("-3.731862,-38.52667");
    expect(url.searchParams.get("bbox")).toBe(
      "-38.53067,-3.734862,-38.52267,-3.728862",
    );
    const region = screen.getByRole("region", {
      name: "Localização da empresa",
    });
    expect(region).toHaveTextContent("Sede cadastral aproximada");
    expect(region).toHaveTextContent(
      "não uma unidade operacional verificada",
    );
  });

  it("labels a postal-code fallback without claiming an exact office", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "available",
            precision: "registered_postal_code",
            latitude: -3.7,
            longitude: -38.5,
            boundingBox: [-38.504, -3.703, -38.496, -3.697],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <LeadLocationMap
        cnpj="11222333000181"
        city="Fortaleza"
        leadRunId={`lr_${"g".repeat(64)}`}
        uf="CE"
      />,
    );

    const map = await screen.findByTitle(
      "Mapa do entorno do CEP cadastral de Fortaleza / CE",
    );
    const url = new URL(map.getAttribute("src") ?? "");
    expect(url.searchParams.get("marker")).toBe("-3.7,-38.5");
    const region = screen.getByRole("region", {
      name: "Localização da empresa",
    });
    expect(region).toHaveTextContent("Entorno do CEP cadastral");
    expect(region).toHaveTextContent(
      "não a entrada ou uma unidade operacional verificada",
    );
  });
});
