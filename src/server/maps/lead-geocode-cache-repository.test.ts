import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({ query: mocks.query }));

import {
  findCurrentLeadGeocode,
  LeadGeocodeCacheInputError,
  saveAvailableLeadGeocode,
  saveUnavailableLeadGeocode,
} from "./lead-geocode-cache-repository";

const identity = {
  organizationId: "org-synthetic-map",
  cnpjNormalizado: "11222333000181",
} as const;
const resolvedAt = new Date("2026-08-13T12:00:00.000Z");
const expiresAt = new Date("2026-11-11T12:00:00.000Z");

beforeEach(() => {
  mocks.query.mockReset();
});

describe("lead registered geocode cache repository", () => {
  it("reads only a current organization-scoped CNPJ entry", async () => {
    mocks.query.mockResolvedValue([
      {
        status: "AVAILABLE",
        latitude: "-3.731862",
        longitude: "-38.526670",
        precision: "REGISTERED_ADDRESS",
        source: "BRASILAPI_NOMINATIM",
        resolved_at: resolvedAt,
        expires_at: expiresAt,
      },
    ]);

    await expect(
      findCurrentLeadGeocode({ ...identity, now: resolvedAt }),
    ).resolves.toEqual({
      status: "available",
      latitude: -3.731862,
      longitude: -38.52667,
      precision: "registered_address",
      source: "BRASILAPI_NOMINATIM",
      resolvedAt,
      expiresAt,
    });

    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(
          /WHERE organization_id = \$1[\s\S]*cnpj_normalizado = \$2[\s\S]*expires_at > \$3/i,
        ),
        values: [identity.organizationId, identity.cnpjNormalizado, resolvedAt],
      }),
    );
  });

  it("upserts available coordinates without address-shaped values", async () => {
    mocks.query.mockResolvedValue([]);

    await saveAvailableLeadGeocode({
      ...identity,
      latitude: -3.731862,
      longitude: -38.52667,
      precision: "registered_address",
      source: "BRASILAPI_NOMINATIM",
      resolvedAt,
      expiresAt,
    });

    const statement = mocks.query.mock.calls[0]?.[0];
    expect(statement.values).toEqual([
      identity.organizationId,
      identity.cnpjNormalizado,
      "AVAILABLE",
      -3.731862,
      -38.52667,
      "REGISTERED_ADDRESS",
      "BRASILAPI_NOMINATIM",
      resolvedAt,
      expiresAt,
    ]);
    expect(statement.text).not.toMatch(
      /logradouro|street|numero|number|bairro|district|cep|postal|query|payload|company_name/i,
    );
  });

  it("stores a negative result without coordinates", async () => {
    mocks.query.mockResolvedValue([]);

    await saveUnavailableLeadGeocode({
      ...identity,
      resolvedAt,
      expiresAt: new Date("2026-08-14T12:00:00.000Z"),
    });

    expect(mocks.query.mock.calls[0]?.[0].values).toEqual([
      identity.organizationId,
      identity.cnpjNormalizado,
      "UNAVAILABLE",
      null,
      null,
      null,
      "BRASILAPI_NOMINATIM_CEP_V2",
      resolvedAt,
      new Date("2026-08-14T12:00:00.000Z"),
    ]);
  });

  it("rejects cross-scope and invalid coordinate input before SQL", async () => {
    await expect(
      findCurrentLeadGeocode({
        organizationId: " org-synthetic-map",
        cnpjNormalizado: identity.cnpjNormalizado,
        now: resolvedAt,
      }),
    ).rejects.toBeInstanceOf(LeadGeocodeCacheInputError);
    await expect(
      saveAvailableLeadGeocode({
        ...identity,
        latitude: 91,
        longitude: 0,
        precision: "registered_address",
        source: "BRASILAPI_NOMINATIM",
        resolvedAt,
        expiresAt,
      }),
    ).rejects.toBeInstanceOf(LeadGeocodeCacheInputError);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("maps and stores postal-code coordinates with explicit precision", async () => {
    mocks.query.mockResolvedValueOnce([
      {
        status: "AVAILABLE",
        latitude: "-3.700000",
        longitude: "-38.500000",
        precision: "REGISTERED_POSTAL_CODE",
        source: "BRASILAPI_CEP_V2",
        resolved_at: resolvedAt,
        expires_at: expiresAt,
      },
    ]);

    await expect(
      findCurrentLeadGeocode({ ...identity, now: resolvedAt }),
    ).resolves.toMatchObject({
      status: "available",
      precision: "registered_postal_code",
      source: "BRASILAPI_CEP_V2",
    });

    mocks.query.mockResolvedValueOnce([]);
    await saveAvailableLeadGeocode({
      ...identity,
      latitude: -3.7,
      longitude: -38.5,
      precision: "registered_postal_code",
      source: "BRASILAPI_CEP_V2",
      resolvedAt,
      expiresAt,
    });
    expect(mocks.query.mock.calls[1]?.[0].values).toEqual(
      expect.arrayContaining([
        "REGISTERED_POSTAL_CODE",
        "BRASILAPI_CEP_V2",
      ]),
    );
  });

  it("defines no schema column for address or provider payload retention", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "db/app/013_lead_registered_geocode_cache_forward.sql",
      ),
      "utf8",
    );
    const tableBody = sql.slice(
      sql.indexOf("CREATE TABLE"),
      sql.indexOf("CREATE INDEX"),
    );

    expect(tableBody).not.toMatch(
      /logradouro|street|numero|number|complemento|bairro|district|cidade|city|uf\b|cep|postal|query|payload|company_name/i,
    );
    expect(tableBody).toMatch(/PRIMARY KEY \(organization_id, cnpj_normalizado\)/i);
    expect(sql).toMatch(/REVOKE DELETE/i);
  });
});
