import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({ query: vi.fn() }));

import type {
  LeadRegisteredLocationConfiguration,
  LeadRegisteredLocationDependencies,
} from "./lead-registered-location-service";
import { resolveLeadRegisteredLocation } from "./lead-registered-location-service";

const configuration: LeadRegisteredLocationConfiguration = {
  enabled: true,
  companyRegistryApiBaseUrl:
    "https://registry.example.test/api/cnpj/v1",
  geocodingApiUrl: "https://geocoder.example.test/search",
  postalCodeApiBaseUrl: "https://registry.example.test/api/cep/v2",
  geocodingUserAgent:
    "Prospecta-Test/1.0 (contact: privacy@example.test)",
  timeoutMilliseconds: 4_000,
};
const identity = {
  organizationId: "org-synthetic-map",
  cnpjNormalizado: "11222333000181",
} as const;
const firstNow = new Date("2026-08-13T12:00:00.000Z");
const resolvedAt = new Date("2026-08-13T12:00:02.000Z");

const fetchMock = vi.fn();
const findCache = vi.fn();
const saveAvailable = vi.fn();
const saveUnavailable = vi.fn();
const scheduleGeocoder = vi.fn();

function dependencies(): LeadRegisteredLocationDependencies {
  const dates = [firstNow, resolvedAt];
  return {
    fetch: fetchMock as unknown as typeof fetch,
    findCache,
    saveAvailable,
    saveUnavailable,
    now: () => dates.shift() ?? resolvedAt,
    scheduleGeocoder,
  } as LeadRegisteredLocationDependencies;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function registryResponse(): Response {
  return jsonResponse({
    razao_social: "Empresa Sintética que não deve ser persistida",
    logradouro: "Rua Exemplo",
    numero: "123",
    complemento: "Sala 5",
    bairro: "Centro",
    municipio: "Fortaleza",
    uf: "CE",
    cep: "60000000",
    qsa: [{ nome_socio: "Pessoa que deve ser ignorada" }],
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  findCache.mockReset();
  saveAvailable.mockReset();
  saveUnavailable.mockReset();
  scheduleGeocoder.mockReset();
  saveAvailable.mockResolvedValue(undefined);
  saveUnavailable.mockResolvedValue(undefined);
  scheduleGeocoder.mockImplementation(
    async (operation: () => Promise<Response>) => operation(),
  );
});

describe("registered lead location service", () => {
  it("returns a current app-owned coordinate without provider work", async () => {
    findCache.mockResolvedValue({
      status: "available",
      latitude: -3.731862,
      longitude: -38.52667,
      precision: "registered_address",
      source: "BRASILAPI_NOMINATIM",
      resolvedAt: firstNow,
      expiresAt: new Date("2026-11-11T12:00:00.000Z"),
    });

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toEqual({
      latitude: -3.731862,
      longitude: -38.52667,
      precision: "registered_address",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveAvailable).not.toHaveBeenCalled();
  });

  it("fails closed before provider work when the required cache is unavailable", async () => {
    findCache.mockRejectedValue(new Error("synthetic database failure"));

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves one structured Brazilian address and stores coordinates only", async () => {
    findCache.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(registryResponse())
      .mockResolvedValueOnce(
        jsonResponse([{ lat: "-3.7318624", lon: "-38.5266703" }]),
      );

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toEqual({
      latitude: -3.7318624,
      longitude: -38.5266703,
      precision: "registered_address",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const registryUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(registryUrl.toString()).toBe(
      "https://registry.example.test/api/cnpj/v1/11222333000181",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "User-Agent": configuration.geocodingUserAgent,
      }),
      redirect: "error",
    });
    const geocoderUrl = fetchMock.mock.calls[1]?.[0] as URL;
    expect(geocoderUrl.origin).toBe("https://geocoder.example.test");
    expect(geocoderUrl.searchParams.get("street")).toBe(
      "123 Rua Exemplo",
    );
    expect(geocoderUrl.searchParams.get("city")).toBe("Fortaleza");
    expect(geocoderUrl.searchParams.get("state")).toBe("CE");
    expect(geocoderUrl.searchParams.get("postalcode")).toBe("60000000");
    expect(geocoderUrl.searchParams.get("countrycodes")).toBe("br");
    expect(geocoderUrl.searchParams.get("limit")).toBe("1");
    expect(geocoderUrl.searchParams.has("q")).toBe(false);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "User-Agent": configuration.geocodingUserAgent,
      }),
      redirect: "error",
    });
    expect(scheduleGeocoder).toHaveBeenCalledOnce();
    expect(saveAvailable).toHaveBeenCalledWith({
      ...identity,
      latitude: -3.7318624,
      longitude: -38.5266703,
      precision: "registered_address",
      source: "BRASILAPI_NOMINATIM",
      resolvedAt,
      expiresAt: new Date("2026-11-11T12:00:02.000Z"),
    });
    expect(JSON.stringify(saveAvailable.mock.calls)).not.toContain(
      "Rua Exemplo",
    );
    expect(saveUnavailable).not.toHaveBeenCalled();
  });

  it("uses a validated postal-code coordinate when the exact address is absent", async () => {
    findCache.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(registryResponse())
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          cep: "60000000",
          street: "provider value that must not be retained",
          location: {
            type: "Point",
            coordinates: {
              longitude: "-38.500000",
              latitude: "-3.700000",
            },
          },
        }),
      );

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toEqual({
      latitude: -3.7,
      longitude: -38.5,
      precision: "registered_postal_code",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const postalUrl = fetchMock.mock.calls[2]?.[0] as URL;
    expect(postalUrl.toString()).toBe(
      "https://registry.example.test/api/cep/v2/60000000",
    );
    expect(saveAvailable).toHaveBeenCalledWith({
      ...identity,
      latitude: -3.7,
      longitude: -38.5,
      precision: "registered_postal_code",
      source: "BRASILAPI_CEP_V2",
      resolvedAt,
      expiresAt: new Date("2026-11-11T12:00:02.000Z"),
    });
    expect(JSON.stringify(saveAvailable.mock.calls)).not.toContain(
      "provider value",
    );
  });

  it("negative-caches an unavailable registry result for 24 hours", async () => {
    findCache.mockResolvedValue(null);
    fetchMock.mockResolvedValue(jsonResponse({ error: "not found" }, 404));

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(scheduleGeocoder).not.toHaveBeenCalled();
    expect(saveUnavailable).toHaveBeenCalledWith({
      ...identity,
      resolvedAt,
      expiresAt: new Date("2026-08-14T12:00:02.000Z"),
    });
  });

  it("does not retry a timed-out geocoder request", async () => {
    findCache.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(registryResponse())
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(jsonResponse({ error: "not found" }, 404));

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(scheduleGeocoder).toHaveBeenCalledOnce();
    expect(saveUnavailable).toHaveBeenCalledOnce();
    expect(saveAvailable).not.toHaveBeenCalled();
  });

  it("rejects oversized or non-JSON provider bodies without another request", async () => {
    findCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(
      new Response("x".repeat(256_001), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(scheduleGeocoder).not.toHaveBeenCalled();
    expect(saveUnavailable).toHaveBeenCalledOnce();
  });

  it("rejects coordinates outside Brazil and never returns an uncached result", async () => {
    findCache.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(registryResponse())
      .mockResolvedValueOnce(jsonResponse([{ lat: "48.8", lon: "2.3" }]));

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toBeNull();
    expect(saveUnavailable).toHaveBeenCalledOnce();

    saveUnavailable.mockRejectedValueOnce(
      new Error("synthetic cache write failure"),
    );
    fetchMock
      .mockResolvedValueOnce(registryResponse())
      .mockResolvedValueOnce(
        jsonResponse([{ lat: "-3.7318624", lon: "-38.5266703" }]),
      );
    findCache.mockResolvedValueOnce(null);
    saveAvailable.mockRejectedValueOnce(
      new Error("synthetic cache write failure"),
    );

    await expect(
      resolveLeadRegisteredLocation(
        { ...identity, configuration },
        dependencies(),
      ),
    ).resolves.toBeNull();
  });

  it("does no cache or network work while the feature is disabled", async () => {
    await expect(
      resolveLeadRegisteredLocation(
        {
          ...identity,
          configuration: { ...configuration, enabled: false },
        },
        dependencies(),
      ),
    ).resolves.toBeNull();
    expect(findCache).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
