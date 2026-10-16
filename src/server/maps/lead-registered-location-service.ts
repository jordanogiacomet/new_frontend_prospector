import "server-only";

import {
  findCurrentLeadGeocode,
  saveAvailableLeadGeocode,
  saveUnavailableLeadGeocode,
  type LeadGeocodeCacheRecord,
  type LeadGeocodePrecision,
} from "./lead-geocode-cache-repository";
import { scheduleNominatimRequest } from "./nominatim-rate-limiter";

const availableCacheMilliseconds = 90 * 24 * 60 * 60 * 1_000;
const unavailableCacheMilliseconds = 24 * 60 * 60 * 1_000;
const brazilBounds = {
  north: 6,
  east: -32,
  south: -34,
  west: -74,
} as const;

interface RegisteredAddress {
  readonly street: string;
  readonly number: string;
  readonly city: string;
  readonly uf: string;
  readonly postalCode: string | null;
}

export interface RegisteredLocationCoordinates {
  readonly latitude: number;
  readonly longitude: number;
  readonly precision: LeadGeocodePrecision;
}

export interface LeadRegisteredLocationConfiguration {
  readonly enabled: boolean;
  readonly companyRegistryApiBaseUrl: string | undefined;
  readonly geocodingApiUrl: string | undefined;
  readonly postalCodeApiBaseUrl: string | undefined;
  readonly geocodingUserAgent: string | undefined;
  readonly timeoutMilliseconds: number;
}

interface LeadRegisteredLocationInput {
  readonly organizationId: string;
  readonly cnpjNormalizado: string;
  readonly configuration: LeadRegisteredLocationConfiguration;
}

export interface LeadRegisteredLocationDependencies {
  readonly fetch: typeof globalThis.fetch;
  readonly findCache: typeof findCurrentLeadGeocode;
  readonly saveAvailable: typeof saveAvailableLeadGeocode;
  readonly saveUnavailable: typeof saveUnavailableLeadGeocode;
  readonly now: () => Date;
  readonly scheduleGeocoder: typeof scheduleNominatimRequest;
}

const defaultDependencies: LeadRegisteredLocationDependencies = {
  fetch: globalThis.fetch,
  findCache: findCurrentLeadGeocode,
  saveAvailable: saveAvailableLeadGeocode,
  saveUnavailable: saveUnavailableLeadGeocode,
  now: () => new Date(),
  scheduleGeocoder: scheduleNominatimRequest,
};

export async function resolveLeadRegisteredLocation(
  input: LeadRegisteredLocationInput,
  dependencies: LeadRegisteredLocationDependencies = defaultDependencies,
): Promise<RegisteredLocationCoordinates | null> {
  if (!input.configuration.enabled) {
    return null;
  }
  validateInput(input);

  const now = dependencies.now();
  let cached: LeadGeocodeCacheRecord | null;
  try {
    cached = await dependencies.findCache({
      organizationId: input.organizationId,
      cnpjNormalizado: input.cnpjNormalizado,
      now,
    });
  } catch {
    // Public Nominatim use requires caching. Fail closed before provider work
    // when the durable app-owned cache cannot be read.
    return null;
  }

  if (cached?.status === "available") {
    return {
      latitude: cached.latitude,
      longitude: cached.longitude,
      precision: cached.precision,
    };
  }
  if (cached?.status === "unavailable") {
    return null;
  }

  const coordinates = await requestRegisteredCoordinates(
    input,
    dependencies,
  );
  const resolvedAt = dependencies.now();

  try {
    if (coordinates === null) {
      await dependencies.saveUnavailable({
        organizationId: input.organizationId,
        cnpjNormalizado: input.cnpjNormalizado,
        resolvedAt,
        expiresAt: new Date(
          resolvedAt.getTime() + unavailableCacheMilliseconds,
        ),
      });
      return null;
    }

    const expiresAt = new Date(
      resolvedAt.getTime() + availableCacheMilliseconds,
    );
    const cacheRecord = {
      organizationId: input.organizationId,
      cnpjNormalizado: input.cnpjNormalizado,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      resolvedAt,
      expiresAt,
    } as const;
    if (coordinates.precision === "registered_address") {
      await dependencies.saveAvailable({
        ...cacheRecord,
        precision: coordinates.precision,
        source: coordinates.source,
      });
    } else {
      await dependencies.saveAvailable({
        ...cacheRecord,
        precision: coordinates.precision,
        source: coordinates.source,
      });
    }
    return {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      precision: coordinates.precision,
    };
  } catch {
    // Do not expose a provider result that the required cache could not retain.
    return null;
  }
}

async function requestRegisteredCoordinates(
  input: LeadRegisteredLocationInput,
  dependencies: LeadRegisteredLocationDependencies,
): Promise<ResolvedRegisteredLocationCoordinates | null> {
  const {
    companyRegistryApiBaseUrl,
    geocodingApiUrl,
    postalCodeApiBaseUrl,
    geocodingUserAgent,
    timeoutMilliseconds,
  } = input.configuration;
  if (
    companyRegistryApiBaseUrl === undefined ||
    geocodingApiUrl === undefined ||
    postalCodeApiBaseUrl === undefined ||
    geocodingUserAgent === undefined
  ) {
    return null;
  }

  try {
    const registryUrl = new URL(
      `${companyRegistryApiBaseUrl.replace(/\/$/, "")}/${input.cnpjNormalizado}`,
    );
    const registryResponse = await dependencies.fetch(registryUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": geocodingUserAgent,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
    if (!registryResponse.ok) {
      return null;
    }

    const registryPayload = await readBoundedJson(registryResponse);
    const address = parseRegisteredAddress(registryPayload);
    if (address === null) {
      return null;
    }

    const addressCoordinates = await requestAddressCoordinates({
      address,
      dependencies,
      geocodingApiUrl,
      geocodingUserAgent,
      timeoutMilliseconds,
    });
    if (addressCoordinates !== null) {
      return {
        ...addressCoordinates,
        precision: "registered_address",
        source: "BRASILAPI_NOMINATIM",
      };
    }

    const postalCoordinates = await requestPostalCoordinates({
      dependencies,
      geocodingUserAgent,
      postalCode: address.postalCode,
      postalCodeApiBaseUrl,
      timeoutMilliseconds,
    });
    return postalCoordinates === null
      ? null
      : {
          ...postalCoordinates,
          precision: "registered_postal_code",
          source: "BRASILAPI_CEP_V2",
        };
  } catch {
    return null;
  }
}

type ResolvedRegisteredLocationCoordinates =
  RegisteredLocationCoordinatesWithoutPrecision &
    (
      | {
          readonly precision: "registered_address";
          readonly source: "BRASILAPI_NOMINATIM";
        }
      | {
          readonly precision: "registered_postal_code";
          readonly source: "BRASILAPI_CEP_V2";
        }
    );

interface ProviderRequestInput {
  readonly dependencies: LeadRegisteredLocationDependencies;
  readonly geocodingUserAgent: string;
  readonly timeoutMilliseconds: number;
}

async function requestAddressCoordinates(
  input: ProviderRequestInput & {
    readonly address: RegisteredAddress;
    readonly geocodingApiUrl: string;
  },
): Promise<RegisteredLocationCoordinatesWithoutPrecision | null> {
  try {
    const geocodingUrl = buildGeocodingUrl(
      input.geocodingApiUrl,
      input.address,
    );
    const response = await input.dependencies.scheduleGeocoder(() =>
      input.dependencies.fetch(geocodingUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Language": "pt-BR",
          "User-Agent": input.geocodingUserAgent,
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(input.timeoutMilliseconds),
      }),
    );
    return response.ok
      ? parseGeocodingCoordinates(await readBoundedJson(response))
      : null;
  } catch {
    return null;
  }
}

async function requestPostalCoordinates(
  input: ProviderRequestInput & {
    readonly postalCode: string | null;
    readonly postalCodeApiBaseUrl: string;
  },
): Promise<RegisteredLocationCoordinatesWithoutPrecision | null> {
  if (input.postalCode === null) {
    return null;
  }

  try {
    const url = new URL(
      `${input.postalCodeApiBaseUrl.replace(/\/$/, "")}/${input.postalCode}`,
    );
    const response = await input.dependencies.fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": input.geocodingUserAgent,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMilliseconds),
    });
    return response.ok
      ? parsePostalCoordinates(await readBoundedJson(response))
      : null;
  } catch {
    return null;
  }
}

type RegisteredLocationCoordinatesWithoutPrecision = Omit<
  RegisteredLocationCoordinates,
  "precision"
>;

function buildGeocodingUrl(
  endpoint: string,
  address: RegisteredAddress,
): URL {
  const url = new URL(endpoint);
  url.searchParams.set("street", `${address.number} ${address.street}`);
  url.searchParams.set("city", address.city);
  url.searchParams.set("state", address.uf);
  if (address.postalCode !== null) {
    url.searchParams.set("postalcode", address.postalCode);
  }
  url.searchParams.set("country", "Brasil");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("layer", "address");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("limit", "1");
  return url;
}

function parseRegisteredAddress(value: unknown): RegisteredAddress | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const street = parseText(record.logradouro, 200);
  const number = parseText(record.numero, 40);
  const city = parseText(record.municipio, 120);
  const uf = parseText(record.uf, 2)?.toUpperCase() ?? null;
  const postalCode = parseOptionalPostalCode(record.cep);
  if (
    street === null ||
    number === null ||
    city === null ||
    uf === null ||
    !/^[A-Z]{2}$/.test(uf)
  ) {
    return null;
  }

  return { street, number, city, uf, postalCode };
}

function parseText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length === 0 ||
    normalized.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function parseOptionalPostalCode(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\D/g, "");
  return /^\d{8}$/.test(normalized) ? normalized : null;
}

function parseGeocodingCoordinates(
  value: unknown,
): RegisteredLocationCoordinatesWithoutPrecision | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const first = value[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    return null;
  }
  const record = first as Record<string, unknown>;
  return parseCoordinatePair(record.lat, record.lon);
}

function parsePostalCoordinates(
  value: unknown,
): RegisteredLocationCoordinatesWithoutPrecision | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const location = (value as Record<string, unknown>).location;
  if (
    typeof location !== "object" ||
    location === null ||
    Array.isArray(location)
  ) {
    return null;
  }
  const coordinates = (location as Record<string, unknown>).coordinates;
  if (
    typeof coordinates !== "object" ||
    coordinates === null ||
    Array.isArray(coordinates)
  ) {
    return null;
  }
  const record = coordinates as Record<string, unknown>;
  return parseCoordinatePair(record.latitude, record.longitude);
}

function parseCoordinatePair(
  rawLatitude: unknown,
  rawLongitude: unknown,
): RegisteredLocationCoordinatesWithoutPrecision | null {
  const latitude = parseCoordinate(rawLatitude);
  const longitude = parseCoordinate(rawLongitude);
  if (
    latitude === null ||
    longitude === null ||
    latitude < brazilBounds.south ||
    latitude > brazilBounds.north ||
    longitude < brazilBounds.west ||
    longitude > brazilBounds.east
  ) {
    return null;
  }

  return { latitude, longitude };
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readBoundedJson(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get("content-type") ?? "";
  const rawLength = response.headers.get("content-length");
  const contentLength = rawLength === null ? null : Number(rawLength);
  if (
    !contentType.toLowerCase().includes("application/json") ||
    (contentLength !== null &&
      (!Number.isSafeInteger(contentLength) || contentLength > 256_000))
  ) {
    return null;
  }

  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 256_000) {
    return null;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function validateInput(input: LeadRegisteredLocationInput): void {
  if (
    input.organizationId.length === 0 ||
    input.organizationId.length > 128 ||
    input.organizationId.trim() !== input.organizationId ||
    !/^\d{14}$/.test(input.cnpjNormalizado) ||
    !Number.isSafeInteger(input.configuration.timeoutMilliseconds) ||
    input.configuration.timeoutMilliseconds <= 0 ||
    input.configuration.timeoutMilliseconds > 10_000
  ) {
    throw new LeadRegisteredLocationInputError();
  }
}

export class LeadRegisteredLocationInputError extends Error {
  constructor() {
    super("Invalid registered lead location input.");
    this.name = "LeadRegisteredLocationInputError";
  }
}
