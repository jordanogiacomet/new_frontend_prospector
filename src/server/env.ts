import "server-only";

import { isIP } from "node:net";

export interface ServerEnv {
  DATABASE_URL: string;
  AUTH_SECRET: string;
  AUTH_OIDC_ISSUER: string;
  AUTH_OIDC_CLIENT_ID: string;
  AUTH_OIDC_CLIENT_SECRET: string;
  AUTH_ALLOWED_ORG_ID: string;
}

export interface ProspectaServerEnv {
  PRODUCER_DATABASE_URL: string;
  APP_DATABASE_URL: string;
  AUTH_ROLE_CLAIM: string;
  AUTH_ROLE_MAPPING: Readonly<Record<string, readonly string[]>>;
  N8N_IMPORT_URL: string;
  N8N_HMAC_KEY_ID: string;
  N8N_HMAC_SECRET: string;
  IMPORT_MAX_BYTES: number;
  IMPORT_PRODUCER_TIMEOUT_MS: number;
  SENSITIVE_URL_HOSTS: readonly string[];
  FEATURE_IMPORTS_ENABLED: boolean;
  FEATURE_BATCH_OBSERVATION_ENABLED: boolean;
  FEATURE_COMMERCIAL_ENABLED: boolean;
  FEATURE_SENSITIVE_CONTENT_ENABLED: boolean;
}

export type ParsedServerEnv = ServerEnv & ProspectaServerEnv;

type EnvironmentInput = Record<string, string | undefined>;

const IMPORT_MAX_BYTES_LIMIT = 10 * 1024 * 1024;
const IMPORT_PATH = "/webhook/prospecta/imports/v1";

const serverOnlyNames = [
  "DATABASE_URL",
  "PRODUCER_DATABASE_URL",
  "APP_DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_OIDC_ISSUER",
  "AUTH_OIDC_CLIENT_ID",
  "AUTH_OIDC_CLIENT_SECRET",
  "AUTH_ALLOWED_ORG_ID",
  "AUTH_ROLE_CLAIM",
  "AUTH_ROLE_MAPPING",
  "N8N_IMPORT_URL",
  "N8N_HMAC_KEY_ID",
  "N8N_HMAC_SECRET",
  "IMPORT_MAX_BYTES",
  "IMPORT_PRODUCER_TIMEOUT_MS",
  "SENSITIVE_URL_HOSTS",
] as const;

function readRequired(
  input: EnvironmentInput,
  name: string,
  errors: string[],
): string {
  const value = input[name];

  if (!value || value.trim() === "") {
    errors.push(`${name} is required`);
    return "";
  }

  return value;
}

function validateDatabaseUrl(
  name: string,
  value: string,
  errors: string[],
): void {
  try {
    const url = new URL(value);
    const hasSupportedProtocol =
      url.protocol === "postgresql:" || url.protocol === "postgres:";

    if (
      !hasSupportedProtocol ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      url.pathname === "/"
    ) {
      errors.push(`${name} must be a complete PostgreSQL URL`);
    }
  } catch {
    errors.push(`${name} must be a complete PostgreSQL URL`);
  }
}

function validateHttpsUrl(
  name: string,
  value: string,
  errors: string[],
  requiredPath?: string,
): void {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (requiredPath !== undefined && url.pathname !== requiredPath)
    ) {
      errors.push(`${name} must be an approved absolute HTTPS URL`);
    }
  } catch {
    errors.push(`${name} must be an approved absolute HTTPS URL`);
  }
}

function parsePositiveInteger(
  name: string,
  value: string,
  errors: string[],
  maximum?: number,
): number {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    errors.push(`${name} must be a positive integer within the approved limit`);
    return 0;
  }

  return parsed;
}

function parseBoolean(
  name: string,
  value: string,
  errors: string[],
): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  errors.push(`${name} must be either true or false`);
  return false;
}

function parseRoleMapping(
  value: string,
  errors: string[],
): Readonly<Record<string, readonly string[]>> {
  try {
    const parsed: unknown = JSON.parse(value);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error();
    }

    const mapping: Record<string, readonly string[]> = {};

    for (const [providerRole, bundles] of Object.entries(parsed)) {
      if (
        providerRole.trim() !== providerRole ||
        providerRole.length === 0 ||
        providerRole.length > 256 ||
        !Array.isArray(bundles) ||
        bundles.length === 0 ||
        !bundles.every(
          (bundle): bundle is string =>
            typeof bundle === "string" &&
            bundle.trim() === bundle &&
            bundle.length > 0 &&
            bundle.length <= 128,
        ) ||
        new Set(bundles).size !== bundles.length
      ) {
        throw new Error();
      }

      mapping[providerRole] = [...bundles];
    }

    if (Object.keys(mapping).length === 0) {
      throw new Error();
    }

    return mapping;
  } catch {
    errors.push("AUTH_ROLE_MAPPING must be a valid role-to-bundle JSON object");
    return {};
  }
}

function normalizeHostname(value: string): string | null {
  if (
    value.length === 0 ||
    value.includes("*") ||
    value.includes("/") ||
    value.includes(":") ||
    value.includes("@") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return null;
  }

  try {
    const url = new URL(`https://${value}`);
    const hostname = url.hostname.toLowerCase();
    const labels = hostname.split(".");

    if (
      url.pathname !== "/" ||
      url.port ||
      isIP(hostname) !== 0 ||
      hostname === "localhost" ||
      hostname.endsWith(".") ||
      hostname.length > 253 ||
      labels.length < 2 ||
      labels.some(
        (label) =>
          label.length === 0 ||
          label.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
    ) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

function parseSensitiveUrlHosts(
  value: string,
  errors: string[],
): readonly string[] {
  const hosts = value.split(",").map((host) => normalizeHostname(host.trim()));

  if (hosts.length === 0 || hosts.some((host) => host === null)) {
    errors.push(
      "SENSITIVE_URL_HOSTS must contain only exact approved hostnames",
    );
    return [];
  }

  return [...new Set(hosts as string[])];
}

function rejectPublicServerSettings(
  input: EnvironmentInput,
  errors: string[],
): void {
  if (
    serverOnlyNames.some(
      (name) => input[`NEXT_PUBLIC_${name}`] !== undefined,
    )
  ) {
    errors.push("Server-only configuration must not use public names");
  }
}

export function parseServerEnv(input: EnvironmentInput): ParsedServerEnv {
  const errors: string[] = [];
  const raw = {
    DATABASE_URL: readRequired(input, "DATABASE_URL", errors),
    PRODUCER_DATABASE_URL: readRequired(
      input,
      "PRODUCER_DATABASE_URL",
      errors,
    ),
    APP_DATABASE_URL: readRequired(input, "APP_DATABASE_URL", errors),
    AUTH_SECRET: readRequired(input, "AUTH_SECRET", errors),
    AUTH_OIDC_ISSUER: readRequired(input, "AUTH_OIDC_ISSUER", errors),
    AUTH_OIDC_CLIENT_ID: readRequired(input, "AUTH_OIDC_CLIENT_ID", errors),
    AUTH_OIDC_CLIENT_SECRET: readRequired(
      input,
      "AUTH_OIDC_CLIENT_SECRET",
      errors,
    ),
    AUTH_ALLOWED_ORG_ID: readRequired(
      input,
      "AUTH_ALLOWED_ORG_ID",
      errors,
    ),
    AUTH_ROLE_CLAIM: readRequired(input, "AUTH_ROLE_CLAIM", errors),
    AUTH_ROLE_MAPPING: readRequired(input, "AUTH_ROLE_MAPPING", errors),
    N8N_IMPORT_URL: readRequired(input, "N8N_IMPORT_URL", errors),
    N8N_HMAC_KEY_ID: readRequired(input, "N8N_HMAC_KEY_ID", errors),
    N8N_HMAC_SECRET: readRequired(input, "N8N_HMAC_SECRET", errors),
    IMPORT_MAX_BYTES: readRequired(input, "IMPORT_MAX_BYTES", errors),
    IMPORT_PRODUCER_TIMEOUT_MS: readRequired(
      input,
      "IMPORT_PRODUCER_TIMEOUT_MS",
      errors,
    ),
    SENSITIVE_URL_HOSTS: readRequired(input, "SENSITIVE_URL_HOSTS", errors),
    FEATURE_IMPORTS_ENABLED: readRequired(
      input,
      "FEATURE_IMPORTS_ENABLED",
      errors,
    ),
    FEATURE_BATCH_OBSERVATION_ENABLED: readRequired(
      input,
      "FEATURE_BATCH_OBSERVATION_ENABLED",
      errors,
    ),
    FEATURE_COMMERCIAL_ENABLED: readRequired(
      input,
      "FEATURE_COMMERCIAL_ENABLED",
      errors,
    ),
    FEATURE_SENSITIVE_CONTENT_ENABLED: readRequired(
      input,
      "FEATURE_SENSITIVE_CONTENT_ENABLED",
      errors,
    ),
  };

  rejectPublicServerSettings(input, errors);

  for (const name of [
    "DATABASE_URL",
    "PRODUCER_DATABASE_URL",
    "APP_DATABASE_URL",
  ] as const) {
    if (raw[name]) {
      validateDatabaseUrl(name, raw[name], errors);
    }
  }

  if (raw.AUTH_SECRET && Buffer.byteLength(raw.AUTH_SECRET, "utf8") < 32) {
    errors.push("AUTH_SECRET must contain at least 32 bytes");
  }

  if (raw.AUTH_OIDC_ISSUER) {
    validateHttpsUrl("AUTH_OIDC_ISSUER", raw.AUTH_OIDC_ISSUER, errors);
  }

  if (
    raw.AUTH_ROLE_CLAIM &&
    (raw.AUTH_ROLE_CLAIM.length > 256 || /\s/.test(raw.AUTH_ROLE_CLAIM))
  ) {
    errors.push("AUTH_ROLE_CLAIM must be a valid claim name");
  }

  if (raw.N8N_IMPORT_URL) {
    validateHttpsUrl(
      "N8N_IMPORT_URL",
      raw.N8N_IMPORT_URL,
      errors,
      IMPORT_PATH,
    );
  }

  if (
    raw.N8N_HMAC_KEY_ID &&
    !/^[A-Za-z0-9._-]{1,128}$/.test(raw.N8N_HMAC_KEY_ID)
  ) {
    errors.push("N8N_HMAC_KEY_ID must be an opaque key identifier");
  }

  if (
    raw.N8N_HMAC_SECRET &&
    Buffer.byteLength(raw.N8N_HMAC_SECRET, "utf8") < 32
  ) {
    errors.push("N8N_HMAC_SECRET must contain at least 32 bytes");
  }

  const environment: ParsedServerEnv = {
    DATABASE_URL: raw.DATABASE_URL,
    PRODUCER_DATABASE_URL: raw.PRODUCER_DATABASE_URL,
    APP_DATABASE_URL: raw.APP_DATABASE_URL,
    AUTH_SECRET: raw.AUTH_SECRET,
    AUTH_OIDC_ISSUER: raw.AUTH_OIDC_ISSUER,
    AUTH_OIDC_CLIENT_ID: raw.AUTH_OIDC_CLIENT_ID,
    AUTH_OIDC_CLIENT_SECRET: raw.AUTH_OIDC_CLIENT_SECRET,
    AUTH_ALLOWED_ORG_ID: raw.AUTH_ALLOWED_ORG_ID,
    AUTH_ROLE_CLAIM: raw.AUTH_ROLE_CLAIM,
    AUTH_ROLE_MAPPING: parseRoleMapping(raw.AUTH_ROLE_MAPPING, errors),
    N8N_IMPORT_URL: raw.N8N_IMPORT_URL,
    N8N_HMAC_KEY_ID: raw.N8N_HMAC_KEY_ID,
    N8N_HMAC_SECRET: raw.N8N_HMAC_SECRET,
    IMPORT_MAX_BYTES: parsePositiveInteger(
      "IMPORT_MAX_BYTES",
      raw.IMPORT_MAX_BYTES,
      errors,
      IMPORT_MAX_BYTES_LIMIT,
    ),
    IMPORT_PRODUCER_TIMEOUT_MS: parsePositiveInteger(
      "IMPORT_PRODUCER_TIMEOUT_MS",
      raw.IMPORT_PRODUCER_TIMEOUT_MS,
      errors,
    ),
    SENSITIVE_URL_HOSTS: parseSensitiveUrlHosts(
      raw.SENSITIVE_URL_HOSTS,
      errors,
    ),
    FEATURE_IMPORTS_ENABLED: parseBoolean(
      "FEATURE_IMPORTS_ENABLED",
      raw.FEATURE_IMPORTS_ENABLED,
      errors,
    ),
    FEATURE_BATCH_OBSERVATION_ENABLED: parseBoolean(
      "FEATURE_BATCH_OBSERVATION_ENABLED",
      raw.FEATURE_BATCH_OBSERVATION_ENABLED,
      errors,
    ),
    FEATURE_COMMERCIAL_ENABLED: parseBoolean(
      "FEATURE_COMMERCIAL_ENABLED",
      raw.FEATURE_COMMERCIAL_ENABLED,
      errors,
    ),
    FEATURE_SENSITIVE_CONTENT_ENABLED: parseBoolean(
      "FEATURE_SENSITIVE_CONTENT_ENABLED",
      raw.FEATURE_SENSITIVE_CONTENT_ENABLED,
      errors,
    ),
  };

  if (errors.length > 0) {
    throw new Error(`Invalid server environment: ${errors.join("; ")}`);
  }

  return environment;
}

export function getServerEnv(
  input: EnvironmentInput = process.env,
): ParsedServerEnv {
  return parseServerEnv(input);
}
