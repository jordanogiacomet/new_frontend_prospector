import "server-only";

import { query } from "../db/app-client";

const unavailableCacheSource = "BRASILAPI_NOMINATIM_CEP_V2" as const;

export type LeadGeocodePrecision =
  | "registered_address"
  | "registered_postal_code";
export type LeadGeocodeSource =
  | "BRASILAPI_NOMINATIM"
  | "BRASILAPI_CEP_V2";

type StoredGeocodeStatus = "AVAILABLE" | "UNAVAILABLE";

interface LeadGeocodeCacheRow {
  readonly status: StoredGeocodeStatus;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly precision:
    | "REGISTERED_ADDRESS"
    | "REGISTERED_POSTAL_CODE"
    | null;
  readonly source: LeadGeocodeSource | typeof unavailableCacheSource;
  readonly resolved_at: Date;
  readonly expires_at: Date;
}

export type LeadGeocodeCacheRecord =
  | {
      readonly status: "available";
      readonly latitude: number;
      readonly longitude: number;
      readonly precision: LeadGeocodePrecision;
      readonly source: LeadGeocodeSource;
      readonly resolvedAt: Date;
      readonly expiresAt: Date;
    }
  | {
      readonly status: "unavailable";
      readonly source: typeof unavailableCacheSource;
      readonly resolvedAt: Date;
      readonly expiresAt: Date;
    };

interface CacheIdentity {
  readonly organizationId: string;
  readonly cnpjNormalizado: string;
}

interface SaveAvailableLeadGeocodeBase extends CacheIdentity {
  readonly latitude: number;
  readonly longitude: number;
  readonly resolvedAt: Date;
  readonly expiresAt: Date;
}

export type SaveAvailableLeadGeocodeInput =
  | (SaveAvailableLeadGeocodeBase & {
      readonly precision: "registered_address";
      readonly source: "BRASILAPI_NOMINATIM";
    })
  | (SaveAvailableLeadGeocodeBase & {
      readonly precision: "registered_postal_code";
      readonly source: "BRASILAPI_CEP_V2";
    });

export interface SaveUnavailableLeadGeocodeInput extends CacheIdentity {
  readonly resolvedAt: Date;
  readonly expiresAt: Date;
}

export async function findCurrentLeadGeocode(
  input: CacheIdentity & { readonly now: Date },
): Promise<LeadGeocodeCacheRecord | null> {
  validateIdentity(input);
  validateDate(input.now);

  const rows = await query<LeadGeocodeCacheRow>({
    text: `
      SELECT
        status,
        latitude,
        longitude,
        precision,
        source,
        resolved_at,
        expires_at
      FROM prospecting_app.lead_registered_geocode_cache
      WHERE organization_id = $1
        AND cnpj_normalizado = $2
        AND expires_at > $3
    `,
    values: [input.organizationId, input.cnpjNormalizado, input.now],
  });

  return rows[0] === undefined ? null : mapRow(rows[0]);
}

export async function saveAvailableLeadGeocode(
  input: SaveAvailableLeadGeocodeInput,
): Promise<void> {
  validateIdentity(input);
  validateCoordinate(input.latitude, -90, 90);
  validateCoordinate(input.longitude, -180, 180);
  validateTimes(input.resolvedAt, input.expiresAt);

  await upsertCache({
    ...input,
    status: "AVAILABLE",
    precision:
      input.precision === "registered_address"
        ? "REGISTERED_ADDRESS"
        : "REGISTERED_POSTAL_CODE",
  });
}

export async function saveUnavailableLeadGeocode(
  input: SaveUnavailableLeadGeocodeInput,
): Promise<void> {
  validateIdentity(input);
  validateTimes(input.resolvedAt, input.expiresAt);

  await upsertCache({
    ...input,
    status: "UNAVAILABLE",
    latitude: null,
    longitude: null,
    precision: null,
    source: unavailableCacheSource,
  });
}

async function upsertCache(input: CacheIdentity & {
  readonly status: StoredGeocodeStatus;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly precision:
    | "REGISTERED_ADDRESS"
    | "REGISTERED_POSTAL_CODE"
    | null;
  readonly source: LeadGeocodeSource | typeof unavailableCacheSource;
  readonly resolvedAt: Date;
  readonly expiresAt: Date;
}): Promise<void> {
  await query({
    text: `
      INSERT INTO prospecting_app.lead_registered_geocode_cache (
        organization_id,
        cnpj_normalizado,
        status,
        latitude,
        longitude,
        precision,
        source,
        resolved_at,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (organization_id, cnpj_normalizado) DO UPDATE
      SET status = EXCLUDED.status,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          precision = EXCLUDED.precision,
          source = EXCLUDED.source,
          resolved_at = EXCLUDED.resolved_at,
          expires_at = EXCLUDED.expires_at
    `,
    values: [
      input.organizationId,
      input.cnpjNormalizado,
      input.status,
      input.latitude,
      input.longitude,
      input.precision,
      input.source,
      input.resolvedAt,
      input.expiresAt,
    ],
  });
}

function mapRow(row: LeadGeocodeCacheRow): LeadGeocodeCacheRecord {
  if (row.status === "UNAVAILABLE") {
    if (
      row.source !== unavailableCacheSource ||
      row.latitude !== null ||
      row.longitude !== null ||
      row.precision !== null
    ) {
      throw new LeadGeocodeCacheInputError();
    }
    return {
      status: "unavailable",
      source: unavailableCacheSource,
      resolvedAt: row.resolved_at,
      expiresAt: row.expires_at,
    };
  }

  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (
    !isAvailableSourcePrecision(row.source, row.precision) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new LeadGeocodeCacheInputError();
  }

  return {
    status: "available",
    latitude,
    longitude,
    precision:
      row.precision === "REGISTERED_ADDRESS"
        ? "registered_address"
        : "registered_postal_code",
    source: row.source,
    resolvedAt: row.resolved_at,
    expiresAt: row.expires_at,
  };
}

function isAvailableSourcePrecision(
  source: LeadGeocodeCacheRow["source"],
  precision: LeadGeocodeCacheRow["precision"],
): source is LeadGeocodeSource {
  return (
    (source === "BRASILAPI_NOMINATIM" &&
      precision === "REGISTERED_ADDRESS") ||
    (source === "BRASILAPI_CEP_V2" &&
      precision === "REGISTERED_POSTAL_CODE")
  );
}

function validateIdentity(input: CacheIdentity): void {
  if (
    input.organizationId.length === 0 ||
    input.organizationId.length > 128 ||
    input.organizationId.trim() !== input.organizationId ||
    !/^\d{14}$/.test(input.cnpjNormalizado)
  ) {
    throw new LeadGeocodeCacheInputError();
  }
}

function validateCoordinate(
  value: number,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new LeadGeocodeCacheInputError();
  }
}

function validateDate(value: Date): void {
  if (!Number.isFinite(value.getTime())) {
    throw new LeadGeocodeCacheInputError();
  }
}

function validateTimes(resolvedAt: Date, expiresAt: Date): void {
  validateDate(resolvedAt);
  validateDate(expiresAt);
  if (expiresAt.getTime() <= resolvedAt.getTime()) {
    throw new LeadGeocodeCacheInputError();
  }
}

export class LeadGeocodeCacheInputError extends Error {
  constructor() {
    super("Invalid lead geocode cache input.");
    this.name = "LeadGeocodeCacheInputError";
  }
}
