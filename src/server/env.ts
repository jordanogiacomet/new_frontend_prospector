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
  FEATURE_COSTS_ENABLED: boolean;
  COSTS_READ_SUBJECTS: readonly string[];
  DEMO2_FULL_ACCESS_ENABLED: boolean;
  DEMO2_K8S_RUNTIME_ENABLED: boolean;
  DEMO3_LOCAL_RUNTIME_ENABLED: boolean;
}

export interface ProspectaServerEnv {
  PRODUCER_DATABASE_URL: string;
  APP_DATABASE_URL: string;
  N8N_IMPORT_URL: string;
  N8N_HMAC_KEY_ID: string | undefined;
  N8N_HMAC_SECRET: string | undefined;
  N8N_IMPORT_EVENT_SECRET: string | undefined;
  IMPORT_MAX_BYTES: number;
  IMPORT_PRODUCER_TIMEOUT_MS: number;
  SENSITIVE_URL_HOSTS: readonly string[];
  FEATURE_IMPORTS_ENABLED: boolean;
  FEATURE_BATCH_OBSERVATION_ENABLED: boolean;
  FEATURE_COMMERCIAL_ENABLED: boolean;
  FEATURE_SENSITIVE_CONTENT_ENABLED: boolean;
  FEATURE_DEMO_DATA_ENABLED: boolean;
}

export type ParsedServerEnv = ServerEnv & ProspectaServerEnv;

type EnvironmentInput = Record<string, string | undefined>;

const IMPORT_MAX_BYTES_LIMIT = 10 * 1024 * 1024;
const N8N_IMPORT_PATHS = new Set([
  "/webhook/empresaqui/import",
  "/webhook-test/empresaqui/import",
  "/webhook/prospecta/empresaqui/import/v1",
  "/webhook-test/prospecta/empresaqui/import/v1",
]);
const N8N_INTERNAL_HTTP_ORIGIN = "http://192.168.0.20:30098";
const N8N_INTERNAL_HTTP_PATH = "/webhook/empresaqui/import";

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
  "FEATURE_COSTS_ENABLED",
  "COSTS_READ_SUBJECTS",
  "DEMO2_FULL_ACCESS_ENABLED",
  "DEMO2_K8S_RUNTIME_ENABLED",
  "DEMO3_LOCAL_RUNTIME_ENABLED",
  "AUTH_ROLE_CLAIM",
  "AUTH_ROLE_MAPPING",
  "N8N_IMPORT_URL",
  "N8N_HMAC_KEY_ID",
  "N8N_HMAC_SECRET",
  "N8N_IMPORT_EVENT_SECRET",
  "IMPORT_MAX_BYTES",
  "IMPORT_PRODUCER_TIMEOUT_MS",
  "SENSITIVE_URL_HOSTS",
  "FEATURE_IMPORTS_ENABLED",
  "FEATURE_BATCH_OBSERVATION_ENABLED",
  "FEATURE_COMMERCIAL_ENABLED",
  "FEATURE_SENSITIVE_CONTENT_ENABLED",
  "FEATURE_DEMO_DATA_ENABLED",
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
    const isApprovedHttps =
      url.protocol === "https:" && N8N_IMPORT_PATHS.has(url.pathname);
    const isApprovedInternalHttp =
      url.protocol === "http:" &&
      url.origin === N8N_INTERNAL_HTTP_ORIGIN &&
      url.pathname === N8N_INTERNAL_HTTP_PATH;

    if (
      (!isApprovedHttps && !isApprovedInternalHttp) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.hostname
    ) {
      errors.push(
        "N8N_IMPORT_URL must be an approved HTTPS URL or the exact internal HTTP target",
      );
    }
  } catch {
    errors.push(
      "N8N_IMPORT_URL must be an approved HTTPS URL or the exact internal HTTP target",
    );
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

function parseCostsReadSubjects(
  value: string | undefined,
  errors: string[],
): readonly string[] {
  if (value === undefined || value === "") {
    return [];
  }

  const subjects = value.split(",");

  if (
    subjects.some(
      (subject) => subject === "" || subject.trim() !== subject,
    )
  ) {
    errors.push(
      "COSTS_READ_SUBJECTS must contain only exact non-empty subjects",
    );
    return [];
  }

  return [...new Set(subjects)];
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
  value: string | undefined,
  errors: string[],
): readonly string[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }

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
    N8N_IMPORT_EVENT_SECRET: readOptional(
      input,
      "N8N_IMPORT_EVENT_SECRET",
    ),
    IMPORT_MAX_BYTES: readRequired(input, "IMPORT_MAX_BYTES", errors),
    IMPORT_PRODUCER_TIMEOUT_MS: readRequired(
      input,
      "IMPORT_PRODUCER_TIMEOUT_MS",
      errors,
    ),
    SENSITIVE_URL_HOSTS: readOptional(input, "SENSITIVE_URL_HOSTS"),
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
    FEATURE_DEMO_DATA_ENABLED: readOptional(
      input,
      "FEATURE_DEMO_DATA_ENABLED",
    ),
    FEATURE_COSTS_ENABLED: readOptional(input, "FEATURE_COSTS_ENABLED"),
    COSTS_READ_SUBJECTS: readOptional(input, "COSTS_READ_SUBJECTS"),
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

  const demoDataEnabled = parseOptionalBoolean(
    "FEATURE_DEMO_DATA_ENABLED",
    raw.FEATURE_DEMO_DATA_ENABLED,
    errors,
  );

  const costsEnabled = parseOptionalBoolean(
    "FEATURE_COSTS_ENABLED",
    raw.FEATURE_COSTS_ENABLED,
    errors,
  );

  const commercialEnabled = parseBoolean(
    "FEATURE_COMMERCIAL_ENABLED",
    raw.FEATURE_COMMERCIAL_ENABLED,
    errors,
  );

  const authDevelopmentBypassEnabled = parseOptionalBoolean(
    "AUTH_DEV_BYPASS_ENABLED",
    input.AUTH_DEV_BYPASS_ENABLED,
    errors,
  );

  const demo2FullAccessEnabled = parseOptionalBoolean(
    "DEMO2_FULL_ACCESS_ENABLED",
    input.DEMO2_FULL_ACCESS_ENABLED,
    errors,
  );

  const demo2K8sRuntimeEnabled = parseOptionalBoolean(
    "DEMO2_K8S_RUNTIME_ENABLED",
    input.DEMO2_K8S_RUNTIME_ENABLED,
    errors,
  );

  const demo3LocalRuntimeEnabled = parseOptionalBoolean(
    "DEMO3_LOCAL_RUNTIME_ENABLED",
    input.DEMO3_LOCAL_RUNTIME_ENABLED,
    errors,
  );

  const isApprovedDemo2Runtime =
    input.NODE_ENV === "development" || demo2K8sRuntimeEnabled;

  if (
    authDevelopmentBypassEnabled &&
    input.NODE_ENV === "production" &&
    !demoDataEnabled &&
    !demo2K8sRuntimeEnabled &&
    !demo3LocalRuntimeEnabled
  ) {
    errors.push("AUTH_DEV_BYPASS_ENABLED is forbidden in production");
  }

  if (
    demo2FullAccessEnabled &&
    (!authDevelopmentBypassEnabled ||
      !isApprovedDemo2Runtime ||
      demoDataEnabled)
  ) {
    errors.push(
      "DEMO2_FULL_ACCESS_ENABLED is limited to an approved Demo 2 test runtime",
    );
  }

  if (demo2K8sRuntimeEnabled && !demo2FullAccessEnabled) {
    errors.push(
      "DEMO2_K8S_RUNTIME_ENABLED requires DEMO2_FULL_ACCESS_ENABLED",
    );
  }

  if (
    demo3LocalRuntimeEnabled &&
    (input.NODE_ENV !== "production" ||
      !authDevelopmentBypassEnabled ||
      demoDataEnabled ||
      !commercialEnabled ||
      demo2FullAccessEnabled ||
      demo2K8sRuntimeEnabled)
  ) {
    errors.push(
      "DEMO3_LOCAL_RUNTIME_ENABLED requires the isolated pre-production profile",
    );
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

  if (
    raw.N8N_IMPORT_EVENT_SECRET &&
    Buffer.byteLength(raw.N8N_IMPORT_EVENT_SECRET, "utf8") < 32
  ) {
    errors.push("N8N_IMPORT_EVENT_SECRET must contain at least 32 bytes");
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
    FEATURE_COSTS_ENABLED: costsEnabled,
    COSTS_READ_SUBJECTS: parseCostsReadSubjects(
      raw.COSTS_READ_SUBJECTS,
      errors,
    ),
    DEMO2_FULL_ACCESS_ENABLED: demo2FullAccessEnabled,
    DEMO2_K8S_RUNTIME_ENABLED: demo2K8sRuntimeEnabled,
    DEMO3_LOCAL_RUNTIME_ENABLED: demo3LocalRuntimeEnabled,
    N8N_IMPORT_URL: raw.N8N_IMPORT_URL,
    N8N_HMAC_KEY_ID: raw.N8N_HMAC_KEY_ID,
    N8N_HMAC_SECRET: raw.N8N_HMAC_SECRET,
    N8N_IMPORT_EVENT_SECRET: raw.N8N_IMPORT_EVENT_SECRET,
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
    FEATURE_COMMERCIAL_ENABLED: commercialEnabled,
    FEATURE_SENSITIVE_CONTENT_ENABLED: parseBoolean(
      "FEATURE_SENSITIVE_CONTENT_ENABLED",
      raw.FEATURE_SENSITIVE_CONTENT_ENABLED,
      errors,
    ),
    FEATURE_DEMO_DATA_ENABLED: demoDataEnabled,
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
