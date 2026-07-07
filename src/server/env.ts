import "server-only";

import { isIP } from "node:net";

export interface ServerEnv {
  DATABASE_URL: string;
  AUTH_SECRET: string;
  AUTH_OIDC_ISSUER: string;
  AUTH_OIDC_CLIENT_ID: string;
  AUTH_OIDC_CLIENT_SECRET: string;
  AUTH_ALLOWED_ORG_ID: string;
  AUTH_DEV_BYPASS_ENABLED: boolean;
}

export interface ProspectaServerEnv {
  PRODUCER_DATABASE_URL: string;
  APP_DATABASE_URL: string;
  N8N_IMPORT_URL: string;
  N8N_HMAC_KEY_ID: string | undefined;
  N8N_HMAC_SECRET: string | undefined;
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
const N8N_IMPORT_PATHS = new Set([
  "/webhook/empresaqui/import",
  "/webhook-test/empresaqui/import",
]);

const serverOnlyNames = [
  "DATABASE_URL",
  "PRODUCER_DATABASE_URL",
  "APP_DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_OIDC_ISSUER",
  "AUTH_OIDC_CLIENT_ID",
  "AUTH_OIDC_CLIENT_SECRET",
  "AUTH_ALLOWED_ORG_ID",
  "AUTH_DEV_BYPASS_ENABLED",
  "AUTH_ROLE_CLAIM",
  "AUTH_ROLE_MAPPING",
  "N8N_IMPORT_URL",
  "N8N_HMAC_KEY_ID",
  "N8N_HMAC_SECRET",
  "IMPORT_MAX_BYTES",
  "IMPORT_PRODUCER_TIMEOUT_MS",
  "SENSITIVE_URL_HOSTS",
  "FEATURE_IMPORTS_ENABLED",
  "FEATURE_BATCH_OBSERVATION_ENABLED",
  "FEATURE_COMMERCIAL_ENABLED",
  "FEATURE_SENSITIVE_CONTENT_ENABLED",
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

function readOptional(
  input: EnvironmentInput,
  name: string,
): string | undefined {
  const value = input[name];

  return value === undefined || value.trim() === ""
    ? undefined
    : value;
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
): void {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      errors.push(`${name} must be an approved HTTPS URL`);
    }
  } catch {
    errors.push(`${name} must be an approved HTTPS URL`);
  }
}

function validateN8nImportUrl(value: string, errors: string[]): void {
  try {
    const url = new URL(value);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !N8N_IMPORT_PATHS.has(url.pathname)
    ) {
      errors.push("N8N_IMPORT_URL must be an approved HTTP or HTTPS URL");
    }
  } catch {
    errors.push("N8N_IMPORT_URL must be an approved HTTP or HTTPS URL");
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

function parseOptionalBoolean(
  name: string,
  value: string | undefined,
  errors: string[],
): boolean {
  return value === undefined ? false : parseBoolean(name, value, errors);
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
    N8N_IMPORT_URL: readRequired(input, "N8N_IMPORT_URL", errors),
    N8N_HMAC_KEY_ID: readOptional(input, "N8N_HMAC_KEY_ID"),
    N8N_HMAC_SECRET: readOptional(input, "N8N_HMAC_SECRET"),
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

  const authDevelopmentBypassEnabled = parseOptionalBoolean(
    "AUTH_DEV_BYPASS_ENABLED",
    input.AUTH_DEV_BYPASS_ENABLED,
    errors,
  );

  if (
    authDevelopmentBypassEnabled &&
    input.NODE_ENV === "production"
  ) {
    errors.push("AUTH_DEV_BYPASS_ENABLED is forbidden in production");
  }

  if (raw.N8N_IMPORT_URL) {
    validateN8nImportUrl(raw.N8N_IMPORT_URL, errors);
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
    AUTH_DEV_BYPASS_ENABLED: authDevelopmentBypassEnabled,
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
