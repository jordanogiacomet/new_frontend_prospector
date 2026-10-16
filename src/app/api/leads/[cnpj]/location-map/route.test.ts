import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LeadDetail } from "../../../../../types/leads";

const mocks = vi.hoisted(() => ({
  resolveLocation: vi.fn(),
  resolveRegisteredLocation: vi.fn(),
  registeredAddressBounds: vi.fn(),
  getServerEnv: vi.fn(),
  getLeadDetail: vi.fn(),
  isDemoDataEnabled: vi.fn(),
  requirePermission: vi.fn(),
  resolveVisibility: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("../../../../../server/demo/mode", () => ({
  isDemoDataEnabled: mocks.isDemoDataEnabled,
}));
vi.mock("../../../../../server/leads/lead-read-visibility", () => ({
  resolveLeadReadVisibility: mocks.resolveVisibility,
}));
vi.mock("../../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../../../server/maps/lead-location-bounds", () => ({
  registeredAddressBounds: mocks.registeredAddressBounds,
}));
vi.mock("../../../../../server/maps/lead-location-resolver", () => ({
  resolveLeadMunicipalityLocation: mocks.resolveLocation,
}));
vi.mock("../../../../../server/maps/lead-registered-location-service", () => ({
  resolveLeadRegisteredLocation: mocks.resolveRegisteredLocation,
}));
vi.mock("../../../../../server/repositories/lead-detail-repository", () => ({
  getLeadDetail: mocks.getLeadDetail,
}));

import { SafeApiError } from "../../../../../server/api/errors";
import { GET } from "./route";

const cnpj = "11222333000181";
const leadRunId = `lr_${"a".repeat(64)}`;
const detail = {
  cnpj,
  lead_run_id: leadRunId,
  city: "Fortaleza",
  uf: "CE",
} as LeadDetail;

function request(query = ""): NextRequest {
  return new NextRequest(
    `https://prospecta.example.test/api/leads/${cnpj}/location-map${query}`,
  );
}

function context(value = cnpj) {
  return { params: Promise.resolve({ cnpj: value }) };
}

describe("GET /api/leads/:cnpj/location-map", () => {
  beforeEach(() => {
    mocks.resolveLocation.mockReset();
    mocks.resolveRegisteredLocation.mockReset();
    mocks.registeredAddressBounds.mockReset();
    mocks.getServerEnv.mockReset();
    mocks.getLeadDetail.mockReset();
    mocks.isDemoDataEnabled.mockReset();
    mocks.requirePermission.mockReset();
    mocks.resolveVisibility.mockReset();
    mocks.requirePermission.mockResolvedValue({
      actor: {
        issuer: "urn:synthetic",
        subject: "synthetic-subject",
        organizationId: "synthetic-organization",
        permissions: ["leads:read"],
      },
      status: "authorized",
    });
    mocks.isDemoDataEnabled.mockReturnValue(false);
    mocks.resolveVisibility.mockResolvedValue({});
    mocks.getLeadDetail.mockResolvedValue(detail);
    mocks.getServerEnv.mockReturnValue({
      FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: true,
      COMPANY_REGISTRY_API_BASE_URL: "https://registry.example.test/cnpj",
      LEAD_GEOCODING_API_URL: "https://geocoder.example.test/search",
      LEAD_POSTAL_CODE_API_BASE_URL:
        "https://registry.example.test/cep/v2",
      LEAD_GEOCODING_USER_AGENT:
        "Prospecta-Test/1.0 (contact: privacy@example.test)",
      LEAD_LOCATION_LOOKUP_TIMEOUT_MS: 4_000,
    });
    mocks.resolveRegisteredLocation.mockResolvedValue(null);
    mocks.registeredAddressBounds.mockReturnValue({
      boundingBox: [-38.53067, -3.734862, -38.52267, -3.728862],
    });
    mocks.resolveLocation.mockReturnValue({
      precision: "municipality_center",
      latitude: -3.7932167,
      longitude: -38.5280359,
      boundingBox: [-38.6379078, -3.8945441, -38.4013259, -3.6921047],
    });
  });

  it("authorizes before validation, producer read, or location resolution", async () => {
    mocks.requirePermission.mockRejectedValue(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const response = await GET(request("?leadRunId=invalid"), context("bad"));

    expect(response.status).toBe(401);
    expect(mocks.getLeadDetail).not.toHaveBeenCalled();
    expect(mocks.resolveLocation).not.toHaveBeenCalled();
    expect(mocks.resolveRegisteredLocation).not.toHaveBeenCalled();
  });

  it("reads the authorized lead and returns mapped municipality fallback coordinates", async () => {
    const response = await GET(
      request(`?leadRunId=${leadRunId}`),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.getLeadDetail).toHaveBeenCalledWith(
      cnpj,
      leadRunId,
      expect.objectContaining({ enabled: false }),
      {},
    );
    expect(mocks.resolveLocation).toHaveBeenCalledWith({
      city: "Fortaleza",
      uf: "CE",
    });
    expect(await response.json()).toEqual({
      data: {
        status: "available",
        precision: "municipality_center",
        latitude: -3.7932167,
        longitude: -38.5280359,
        boundingBox: [-38.6379078, -3.8945441, -38.4013259, -3.6921047],
      },
    });
  });

  it("prefers a tightly bounded registered-address coordinate", async () => {
    mocks.resolveRegisteredLocation.mockResolvedValue({
      latitude: -3.731862,
      longitude: -38.52667,
      precision: "registered_address",
    });

    const response = await GET(
      request(`?leadRunId=${leadRunId}`),
      context(),
    );

    expect(mocks.resolveRegisteredLocation).toHaveBeenCalledWith({
      organizationId: "synthetic-organization",
      cnpjNormalizado: cnpj,
      configuration: {
        enabled: true,
        companyRegistryApiBaseUrl: "https://registry.example.test/cnpj",
        geocodingApiUrl: "https://geocoder.example.test/search",
        postalCodeApiBaseUrl: "https://registry.example.test/cep/v2",
        geocodingUserAgent:
          "Prospecta-Test/1.0 (contact: privacy@example.test)",
        timeoutMilliseconds: 4_000,
      },
    });
    expect(mocks.registeredAddressBounds).toHaveBeenCalledWith(
      -3.731862,
      -38.52667,
    );
    expect(mocks.resolveLocation).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      data: {
        status: "available",
        precision: "registered_address",
        latitude: -3.731862,
        longitude: -38.52667,
        boundingBox: [-38.53067, -3.734862, -38.52267, -3.728862],
      },
    });
  });

  it("preserves explicit postal-code precision in the response", async () => {
    mocks.resolveRegisteredLocation.mockResolvedValue({
      latitude: -3.7,
      longitude: -38.5,
      precision: "registered_postal_code",
    });

    const response = await GET(
      request(`?leadRunId=${leadRunId}`),
      context(),
    );

    expect(await response.json()).toEqual({
      data: {
        status: "available",
        precision: "registered_postal_code",
        latitude: -3.7,
        longitude: -38.5,
        boundingBox: [-38.53067, -3.734862, -38.52267, -3.728862],
      },
    });
  });

  it("still tries the registered address when city and UF are absent", async () => {
    mocks.getLeadDetail.mockResolvedValue({ ...detail, city: null, uf: null });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "unavailable" } });
    expect(mocks.resolveRegisteredLocation).toHaveBeenCalledOnce();
    expect(mocks.resolveLocation).not.toHaveBeenCalled();
  });

  it("returns unavailable when the exact municipality pair is unknown", async () => {
    mocks.resolveLocation.mockReturnValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "unavailable" } });
  });

  it("returns safe validation and not-found responses", async () => {
    const invalid = await GET(request(), context("invalid"));
    expect(invalid.status).toBe(400);
    expect(mocks.resolveLocation).not.toHaveBeenCalled();

    mocks.getLeadDetail.mockResolvedValue(null);
    const missing = await GET(request(), context());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: "LEAD_NOT_FOUND" },
    });
  });
});
