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
  FEATURE_CONTACT_DATA_ENABLED: boolean;
  FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: boolean;
  CONTACT_DATA_READ_SUBJECTS: readonly string[];
  CONTACT_DATA_GOVERN_SUBJECTS: readonly string[];
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
  N8N_CONTACT_ENRICHMENT_URL: string | undefined;
  N8N_CONTACT_ENRICHMENT_SECRET: string | undefined;
  N8N_CONTACT_CALLBACK_SECRET: string | undefined;
  N8N_CONTACT_ENRICHMENT_V2_URL: string | undefined;
  N8N_CONTACT_ENRICHMENT_V2_SECRET: string | undefined;
  N8N_CONTACT_CALLBACK_V2_SECRET: string | undefined;
  CONTACT_DATA_ENCRYPTION_KEY_BASE64: string | undefined;
  CONTACT_DATA_ENCRYPTION_KEY_ID: string | undefined;
  CONTACT_SUPPRESSION_HMAC_KEY: string | undefined;
  CONTACT_CONTROLLER_LEGAL_NAME: string | undefined;
  CONTACT_CONTROLLER_REGISTRATION: string | undefined;
  CONTACT_PRIVACY_CONTACT: string | undefined;
  IMPORT_MAX_BYTES: number;
  IMPORT_PRODUCER_TIMEOUT_MS: number;
  CONTACT_ENRICHMENT_TIMEOUT_MS: number;
  OPENAI_API_KEY: string | undefined;
  OPENAI_APPROACH_MODEL: string | undefined;
  OPENAI_APPROACH_TIMEOUT_MS: number;
  COMPANY_REGISTRY_API_BASE_URL: string | undefined;
  LEAD_GEOCODING_API_URL: string | undefined;
  LEAD_POSTAL_CODE_API_BASE_URL: string | undefined;
  LEAD_GEOCODING_USER_AGENT: string | undefined;
  LEAD_LOCATION_LOOKUP_TIMEOUT_MS: number;
  SENSITIVE_URL_HOSTS: readonly string[];
  FEATURE_IMPORTS_ENABLED: boolean;
  FEATURE_BATCH_OBSERVATION_ENABLED: boolean;
  FEATURE_COMMERCIAL_ENABLED: boolean;
  FEATURE_SENSITIVE_CONTENT_ENABLED: boolean;
  FEATURE_CONTACT_ENRICHMENT_ENABLED: boolean;
  FEATURE_AI_APPROACH_ENABLED: boolean;
  FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: boolean;
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
const N8N_CONTACT_ENRICHMENT_PATH =
  "/webhook/prospecta/lusha/decision-makers";
const N8N_CONTACT_INTERNAL_HTTP_URL =
  `${N8N_INTERNAL_HTTP_ORIGIN}${N8N_CONTACT_ENRICHMENT_PATH}`;
const N8N_CONTACT_ENRICHMENT_V2_PATH =
  "/webhook/prospecta/lusha/contact-enrichment-v2";

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
  "N8N_CONTACT_ENRICHMENT_URL",
  "N8N_CONTACT_ENRICHMENT_SECRET",
  "N8N_CONTACT_CALLBACK_SECRET",
  "N8N_CONTACT_ENRICHMENT_V2_URL",
  "N8N_CONTACT_ENRICHMENT_V2_SECRET",
  "N8N_CONTACT_CALLBACK_V2_SECRET",
  "CONTACT_DATA_ENCRYPTION_KEY_BASE64",
  "CONTACT_DATA_ENCRYPTION_KEY_ID",
  "CONTACT_SUPPRESSION_HMAC_KEY",
  "CONTACT_DATA_READ_SUBJECTS",
  "CONTACT_DATA_GOVERN_SUBJECTS",
  "CONTACT_CONTROLLER_LEGAL_NAME",
  "CONTACT_CONTROLLER_REGISTRATION",
  "CONTACT_PRIVACY_CONTACT",
  "IMPORT_MAX_BYTES",
  "IMPORT_PRODUCER_TIMEOUT_MS",
  "CONTACT_ENRICHMENT_TIMEOUT_MS",
  "OPENAI_API_KEY",
  "OPENAI_APPROACH_MODEL",
  "OPENAI_APPROACH_TIMEOUT_MS",
  "COMPANY_REGISTRY_API_BASE_URL",
  "LEAD_GEOCODING_API_URL",
  "LEAD_POSTAL_CODE_API_BASE_URL",
  "LEAD_GEOCODING_USER_AGENT",
  "LEAD_LOCATION_LOOKUP_TIMEOUT_MS",
  "SENSITIVE_URL_HOSTS",
  "FEATURE_IMPORTS_ENABLED",
  "FEATURE_BATCH_OBSERVATION_ENABLED",
  "FEATURE_COMMERCIAL_ENABLED",
  "FEATURE_SENSITIVE_CONTENT_ENABLED",
  "FEATURE_CONTACT_ENRICHMENT_ENABLED",
  "FEATURE_AI_APPROACH_ENABLED",
  "FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED",
  "FEATURE_CONTACT_DATA_ENABLED",
  "FEATURE_REGISTERED_ADDRESS_MAP_ENABLED",
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

function validateN8nContactEnrichmentUrl(
  value: string,
  demo3LocalRuntimeEnabled: boolean,
  errors: string[],
): void {
  try {
    const url = new URL(value);
    const isApprovedHttps =
      url.protocol === "https:" &&
      url.pathname === N8N_CONTACT_ENRICHMENT_PATH;
    const isApprovedDemo3Http =
      demo3LocalRuntimeEnabled && value === N8N_CONTACT_INTERNAL_HTTP_URL;

    if (
      (!isApprovedHttps && !isApprovedDemo3Http) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      errors.push(
        "N8N_CONTACT_ENRICHMENT_URL must be the approved HTTPS path or exact Demo 3 target",
      );
    }
  } catch {
    errors.push(
      "N8N_CONTACT_ENRICHMENT_URL must be the approved HTTPS path or exact Demo 3 target",
    );
  }
}

function validateN8nContactEnrichmentV2Url(
  value: string,
  errors: string[],
): void {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.pathname !== N8N_CONTACT_ENRICHMENT_V2_PATH ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      errors.push(
        "N8N_CONTACT_ENRICHMENT_V2_URL must be the approved HTTPS v2 path",
      );
    }
  } catch {
    errors.push(
      "N8N_CONTACT_ENRICHMENT_V2_URL must be the approved HTTPS v2 path",
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

function parseExactSubjects(
  name: string,
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
      `${name} must contain only exact non-empty subjects`,
    );
    return [];
  }

  return [...new Set(subjects)];
}

function validateContactPrivacyContact(
  value: string,
  errors: string[],
): void {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  let isHttpsUrl = false;

  try {
    const url = new URL(value);
    isHttpsUrl =
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash;
  } catch {
    // A plain email address remains a supported privacy contact.
  }

  if (!isEmail && !isHttpsUrl) {
    errors.push(
      "CONTACT_PRIVACY_CONTACT must be an email address or approved HTTPS URL",
    );
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
    N8N_CONTACT_ENRICHMENT_URL: readOptional(
      input,
      "N8N_CONTACT_ENRICHMENT_URL",
    ),
    N8N_CONTACT_ENRICHMENT_SECRET: readOptional(
      input,
      "N8N_CONTACT_ENRICHMENT_SECRET",
    ),
    N8N_CONTACT_CALLBACK_SECRET: readOptional(
      input,
      "N8N_CONTACT_CALLBACK_SECRET",
    ),
    N8N_CONTACT_ENRICHMENT_V2_URL: readOptional(
      input,
      "N8N_CONTACT_ENRICHMENT_V2_URL",
    ),
    N8N_CONTACT_ENRICHMENT_V2_SECRET: readOptional(
      input,
      "N8N_CONTACT_ENRICHMENT_V2_SECRET",
    ),
    N8N_CONTACT_CALLBACK_V2_SECRET: readOptional(
      input,
      "N8N_CONTACT_CALLBACK_V2_SECRET",
    ),
    CONTACT_DATA_ENCRYPTION_KEY_BASE64: readOptional(
      input,
      "CONTACT_DATA_ENCRYPTION_KEY_BASE64",
    ),
    CONTACT_DATA_ENCRYPTION_KEY_ID: readOptional(
      input,
      "CONTACT_DATA_ENCRYPTION_KEY_ID",
    ),
    CONTACT_SUPPRESSION_HMAC_KEY: readOptional(
      input,
      "CONTACT_SUPPRESSION_HMAC_KEY",
    ),
    CONTACT_DATA_READ_SUBJECTS: readOptional(
      input,
      "CONTACT_DATA_READ_SUBJECTS",
    ),
    CONTACT_DATA_GOVERN_SUBJECTS: readOptional(
      input,
      "CONTACT_DATA_GOVERN_SUBJECTS",
    ),
    CONTACT_CONTROLLER_LEGAL_NAME: readOptional(
      input,
      "CONTACT_CONTROLLER_LEGAL_NAME",
    ),
    CONTACT_CONTROLLER_REGISTRATION: readOptional(
      input,
      "CONTACT_CONTROLLER_REGISTRATION",
    ),
    CONTACT_PRIVACY_CONTACT: readOptional(
      input,
      "CONTACT_PRIVACY_CONTACT",
    ),
    IMPORT_MAX_BYTES: readRequired(input, "IMPORT_MAX_BYTES", errors),
    IMPORT_PRODUCER_TIMEOUT_MS: readRequired(
      input,
      "IMPORT_PRODUCER_TIMEOUT_MS",
      errors,
    ),
    CONTACT_ENRICHMENT_TIMEOUT_MS: readOptional(
      input,
      "CONTACT_ENRICHMENT_TIMEOUT_MS",
    ),
    OPENAI_API_KEY: readOptional(input, "OPENAI_API_KEY"),
    OPENAI_APPROACH_MODEL: readOptional(
      input,
      "OPENAI_APPROACH_MODEL",
    ),
    OPENAI_APPROACH_TIMEOUT_MS: readOptional(
      input,
      "OPENAI_APPROACH_TIMEOUT_MS",
    ),
    COMPANY_REGISTRY_API_BASE_URL: readOptional(
      input,
      "COMPANY_REGISTRY_API_BASE_URL",
    ),
    LEAD_GEOCODING_API_URL: readOptional(
      input,
      "LEAD_GEOCODING_API_URL",
    ),
    LEAD_POSTAL_CODE_API_BASE_URL: readOptional(
      input,
      "LEAD_POSTAL_CODE_API_BASE_URL",
    ),
    LEAD_GEOCODING_USER_AGENT: readOptional(
      input,
      "LEAD_GEOCODING_USER_AGENT",
    ),
    LEAD_LOCATION_LOOKUP_TIMEOUT_MS: readOptional(
      input,
      "LEAD_LOCATION_LOOKUP_TIMEOUT_MS",
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
    FEATURE_CONTACT_ENRICHMENT_ENABLED: readOptional(
      input,
      "FEATURE_CONTACT_ENRICHMENT_ENABLED",
    ),
    FEATURE_AI_APPROACH_ENABLED: readOptional(
      input,
      "FEATURE_AI_APPROACH_ENABLED",
    ),
    FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: readOptional(
      input,
      "FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED",
    ),
    FEATURE_CONTACT_DATA_ENABLED: readOptional(
      input,
      "FEATURE_CONTACT_DATA_ENABLED",
    ),
    FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: readOptional(
      input,
      "FEATURE_REGISTERED_ADDRESS_MAP_ENABLED",
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

  const contactEnrichmentEnabled = parseOptionalBoolean(
    "FEATURE_CONTACT_ENRICHMENT_ENABLED",
    raw.FEATURE_CONTACT_ENRICHMENT_ENABLED,
    errors,
  );
  const aiApproachEnabled = parseOptionalBoolean(
    "FEATURE_AI_APPROACH_ENABLED",
    raw.FEATURE_AI_APPROACH_ENABLED,
    errors,
  );
  const aiApproachAutoQueueEnabled = parseOptionalBoolean(
    "FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED",
    raw.FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED,
    errors,
  );
  const contactDataEnabled = parseOptionalBoolean(
    "FEATURE_CONTACT_DATA_ENABLED",
    raw.FEATURE_CONTACT_DATA_ENABLED,
    errors,
  );
  const registeredAddressMapEnabled = parseOptionalBoolean(
    "FEATURE_REGISTERED_ADDRESS_MAP_ENABLED",
    raw.FEATURE_REGISTERED_ADDRESS_MAP_ENABLED,
    errors,
  );
  const contactDataReadSubjects = parseExactSubjects(
    "CONTACT_DATA_READ_SUBJECTS",
    raw.CONTACT_DATA_READ_SUBJECTS,
    errors,
  );
  const contactDataGovernSubjects = parseExactSubjects(
    "CONTACT_DATA_GOVERN_SUBJECTS",
    raw.CONTACT_DATA_GOVERN_SUBJECTS,
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

  if (raw.N8N_CONTACT_ENRICHMENT_URL) {
    validateN8nContactEnrichmentUrl(
      raw.N8N_CONTACT_ENRICHMENT_URL,
      demo3LocalRuntimeEnabled,
      errors,
    );
  }

  if (raw.N8N_CONTACT_ENRICHMENT_V2_URL) {
    validateN8nContactEnrichmentV2Url(
      raw.N8N_CONTACT_ENRICHMENT_V2_URL,
      errors,
    );
  }

  for (const name of [
    "COMPANY_REGISTRY_API_BASE_URL",
    "LEAD_GEOCODING_API_URL",
    "LEAD_POSTAL_CODE_API_BASE_URL",
  ] as const) {
    const value = raw[name];
    if (value !== undefined) {
      validateHttpsUrl(name, value, errors);
    }
  }

  if (registeredAddressMapEnabled) {
    for (const name of [
      "COMPANY_REGISTRY_API_BASE_URL",
      "LEAD_GEOCODING_API_URL",
      "LEAD_POSTAL_CODE_API_BASE_URL",
      "LEAD_GEOCODING_USER_AGENT",
    ] as const) {
      if (raw[name] === undefined) {
        errors.push(`${name} is required when registered-address map is enabled`);
      }
    }
  }

  if (
    raw.LEAD_GEOCODING_USER_AGENT !== undefined &&
    (!/^Prospecta[A-Za-z0-9 .\-\/]{1,80} \(contact: [^\s@]+@[^\s@]+\.[^\s@]+\)$/.test(
      raw.LEAD_GEOCODING_USER_AGENT,
    ) ||
      /[\u0000-\u001f\u007f]/.test(raw.LEAD_GEOCODING_USER_AGENT))
  ) {
    errors.push(
      "LEAD_GEOCODING_USER_AGENT must identify Prospecta and a monitored contact email",
    );
  }

  if (contactEnrichmentEnabled) {
    for (const name of [
      "N8N_CONTACT_ENRICHMENT_URL",
      "N8N_CONTACT_ENRICHMENT_SECRET",
      "N8N_CONTACT_CALLBACK_SECRET",
    ] as const) {
      if (raw[name] === undefined) {
        errors.push(`${name} is required when contact enrichment is enabled`);
      }
    }
  }

  if (
    raw.OPENAI_API_KEY !== undefined &&
    (Buffer.byteLength(raw.OPENAI_API_KEY, "utf8") < 20 ||
      raw.OPENAI_API_KEY.length > 512 ||
      /\s|[\u0000-\u001f\u007f]/.test(raw.OPENAI_API_KEY))
  ) {
    errors.push("OPENAI_API_KEY is invalid");
  }

  if (
    raw.OPENAI_APPROACH_MODEL !== undefined &&
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(
      raw.OPENAI_APPROACH_MODEL,
    )
  ) {
    errors.push("OPENAI_APPROACH_MODEL is invalid");
  }

  if (aiApproachEnabled) {
    for (const name of [
      "OPENAI_API_KEY",
      "OPENAI_APPROACH_MODEL",
    ] as const) {
      if (raw[name] === undefined) {
        errors.push(`${name} is required when AI approach is enabled`);
      }
    }

    if (raw.OPENAI_API_KEY?.toLowerCase().includes("replace-")) {
      errors.push("OPENAI_API_KEY must not use a placeholder value");
    }
  }

  if (aiApproachAutoQueueEnabled && !aiApproachEnabled) {
    errors.push(
      "FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED requires FEATURE_AI_APPROACH_ENABLED",
    );
  }

  if (contactDataEnabled) {
    if (!contactEnrichmentEnabled) {
      errors.push(
        "FEATURE_CONTACT_DATA_ENABLED requires FEATURE_CONTACT_ENRICHMENT_ENABLED",
      );
    }

    for (const name of [
      "N8N_CONTACT_ENRICHMENT_V2_URL",
      "N8N_CONTACT_ENRICHMENT_V2_SECRET",
      "N8N_CONTACT_CALLBACK_V2_SECRET",
      "CONTACT_DATA_ENCRYPTION_KEY_BASE64",
      "CONTACT_DATA_ENCRYPTION_KEY_ID",
      "CONTACT_SUPPRESSION_HMAC_KEY",
      "CONTACT_CONTROLLER_LEGAL_NAME",
      "CONTACT_PRIVACY_CONTACT",
    ] as const) {
      if (raw[name] === undefined) {
        errors.push(`${name} is required when contact data is enabled`);
      }
    }

    if (contactDataReadSubjects.length === 0) {
      errors.push(
        "CONTACT_DATA_READ_SUBJECTS requires at least one exact subject when contact data is enabled",
      );
    }
    if (contactDataGovernSubjects.length === 0) {
      errors.push(
        "CONTACT_DATA_GOVERN_SUBJECTS requires at least one exact subject when contact data is enabled",
      );
    }

    for (const name of [
      "N8N_CONTACT_ENRICHMENT_V2_SECRET",
      "N8N_CONTACT_CALLBACK_V2_SECRET",
      "CONTACT_SUPPRESSION_HMAC_KEY",
    ] as const) {
      if (raw[name]?.toLowerCase().includes("replace-")) {
        errors.push(`${name} must not use a placeholder value`);
      }
    }
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

  for (const name of [
    "N8N_CONTACT_ENRICHMENT_SECRET",
    "N8N_CONTACT_CALLBACK_SECRET",
  ] as const) {
    const value = raw[name];

    if (value && Buffer.byteLength(value, "utf8") < 32) {
      errors.push(`${name} must contain at least 32 bytes`);
    }
  }

  for (const name of [
    "N8N_CONTACT_ENRICHMENT_V2_SECRET",
    "N8N_CONTACT_CALLBACK_V2_SECRET",
    "CONTACT_SUPPRESSION_HMAC_KEY",
  ] as const) {
    const value = raw[name];

    if (value && Buffer.byteLength(value, "utf8") < 32) {
      errors.push(`${name} must contain at least 32 bytes`);
    }
  }

  if (raw.CONTACT_DATA_ENCRYPTION_KEY_BASE64) {
    const key = Buffer.from(raw.CONTACT_DATA_ENCRYPTION_KEY_BASE64, "base64");
    const canonical = key.toString("base64");

    if (
      key.byteLength !== 32 ||
      canonical !== raw.CONTACT_DATA_ENCRYPTION_KEY_BASE64 ||
      (contactDataEnabled && key.equals(Buffer.alloc(32)))
    ) {
      errors.push(
        "CONTACT_DATA_ENCRYPTION_KEY_BASE64 must be canonical base64 for exactly 32 bytes",
      );
    }
  }

  if (
    raw.CONTACT_DATA_ENCRYPTION_KEY_ID &&
    !/^[A-Za-z0-9._-]{1,64}$/.test(raw.CONTACT_DATA_ENCRYPTION_KEY_ID)
  ) {
    errors.push("CONTACT_DATA_ENCRYPTION_KEY_ID must be an opaque key identifier");
  }

  if (
    raw.CONTACT_CONTROLLER_LEGAL_NAME &&
    (raw.CONTACT_CONTROLLER_LEGAL_NAME.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(raw.CONTACT_CONTROLLER_LEGAL_NAME))
  ) {
    errors.push("CONTACT_CONTROLLER_LEGAL_NAME is invalid");
  }

  if (
    raw.CONTACT_CONTROLLER_REGISTRATION &&
    !/^[A-Za-z0-9 .\-\/]{3,64}$/.test(raw.CONTACT_CONTROLLER_REGISTRATION)
  ) {
    errors.push("CONTACT_CONTROLLER_REGISTRATION is invalid");
  }

  if (raw.CONTACT_PRIVACY_CONTACT) {
    validateContactPrivacyContact(raw.CONTACT_PRIVACY_CONTACT, errors);
  }

  if (
    raw.N8N_CONTACT_ENRICHMENT_SECRET &&
    (raw.N8N_CONTACT_ENRICHMENT_SECRET === raw.AUTH_SECRET ||
      raw.N8N_CONTACT_ENRICHMENT_SECRET === raw.N8N_IMPORT_EVENT_SECRET)
  ) {
    errors.push("N8N_CONTACT_ENRICHMENT_SECRET must be distinct");
  }

  if (
    raw.N8N_CONTACT_CALLBACK_SECRET &&
    (raw.N8N_CONTACT_CALLBACK_SECRET === raw.AUTH_SECRET ||
      raw.N8N_CONTACT_CALLBACK_SECRET === raw.N8N_IMPORT_EVENT_SECRET ||
      raw.N8N_CONTACT_CALLBACK_SECRET ===
        raw.N8N_CONTACT_ENRICHMENT_SECRET)
  ) {
    errors.push("N8N_CONTACT_CALLBACK_SECRET must be distinct");
  }

  const contactV2Secrets = [
    raw.N8N_CONTACT_ENRICHMENT_V2_SECRET,
    raw.N8N_CONTACT_CALLBACK_V2_SECRET,
    raw.CONTACT_SUPPRESSION_HMAC_KEY,
  ].filter((value): value is string => value !== undefined);
  const protectedSecrets = [
    raw.AUTH_SECRET,
    raw.N8N_IMPORT_EVENT_SECRET,
    raw.N8N_CONTACT_ENRICHMENT_SECRET,
    raw.N8N_CONTACT_CALLBACK_SECRET,
    ...contactV2Secrets,
  ].filter((value): value is string => value !== undefined);

  if (new Set(protectedSecrets).size !== protectedSecrets.length) {
    errors.push("Contact v2 secrets must be distinct from all other secrets");
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
    COSTS_READ_SUBJECTS: parseExactSubjects(
      "COSTS_READ_SUBJECTS",
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
    N8N_CONTACT_ENRICHMENT_URL: raw.N8N_CONTACT_ENRICHMENT_URL,
    N8N_CONTACT_ENRICHMENT_SECRET: raw.N8N_CONTACT_ENRICHMENT_SECRET,
    N8N_CONTACT_CALLBACK_SECRET: raw.N8N_CONTACT_CALLBACK_SECRET,
    N8N_CONTACT_ENRICHMENT_V2_URL:
      raw.N8N_CONTACT_ENRICHMENT_V2_URL,
    N8N_CONTACT_ENRICHMENT_V2_SECRET:
      raw.N8N_CONTACT_ENRICHMENT_V2_SECRET,
    N8N_CONTACT_CALLBACK_V2_SECRET:
      raw.N8N_CONTACT_CALLBACK_V2_SECRET,
    CONTACT_DATA_ENCRYPTION_KEY_BASE64:
      raw.CONTACT_DATA_ENCRYPTION_KEY_BASE64,
    CONTACT_DATA_ENCRYPTION_KEY_ID:
      raw.CONTACT_DATA_ENCRYPTION_KEY_ID,
    CONTACT_SUPPRESSION_HMAC_KEY:
      raw.CONTACT_SUPPRESSION_HMAC_KEY,
    CONTACT_DATA_READ_SUBJECTS: contactDataReadSubjects,
    CONTACT_DATA_GOVERN_SUBJECTS: contactDataGovernSubjects,
    CONTACT_CONTROLLER_LEGAL_NAME:
      raw.CONTACT_CONTROLLER_LEGAL_NAME,
    CONTACT_CONTROLLER_REGISTRATION:
      raw.CONTACT_CONTROLLER_REGISTRATION,
    CONTACT_PRIVACY_CONTACT: raw.CONTACT_PRIVACY_CONTACT,
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
    CONTACT_ENRICHMENT_TIMEOUT_MS: parsePositiveInteger(
      "CONTACT_ENRICHMENT_TIMEOUT_MS",
      raw.CONTACT_ENRICHMENT_TIMEOUT_MS ?? "15000",
      errors,
    ),
    OPENAI_API_KEY: raw.OPENAI_API_KEY,
    OPENAI_APPROACH_MODEL: raw.OPENAI_APPROACH_MODEL,
    OPENAI_APPROACH_TIMEOUT_MS: parsePositiveInteger(
      "OPENAI_APPROACH_TIMEOUT_MS",
      raw.OPENAI_APPROACH_TIMEOUT_MS ?? "20000",
      errors,
      60_000,
    ),
    COMPANY_REGISTRY_API_BASE_URL: raw.COMPANY_REGISTRY_API_BASE_URL,
    LEAD_GEOCODING_API_URL: raw.LEAD_GEOCODING_API_URL,
    LEAD_POSTAL_CODE_API_BASE_URL: raw.LEAD_POSTAL_CODE_API_BASE_URL,
    LEAD_GEOCODING_USER_AGENT: raw.LEAD_GEOCODING_USER_AGENT,
    LEAD_LOCATION_LOOKUP_TIMEOUT_MS: parsePositiveInteger(
      "LEAD_LOCATION_LOOKUP_TIMEOUT_MS",
      raw.LEAD_LOCATION_LOOKUP_TIMEOUT_MS ?? "4000",
      errors,
      10_000,
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
    FEATURE_CONTACT_ENRICHMENT_ENABLED: contactEnrichmentEnabled,
    FEATURE_AI_APPROACH_ENABLED: aiApproachEnabled,
    FEATURE_AI_APPROACH_AUTO_QUEUE_ENABLED: aiApproachAutoQueueEnabled,
    FEATURE_CONTACT_DATA_ENABLED: contactDataEnabled,
    FEATURE_REGISTERED_ADDRESS_MAP_ENABLED: registeredAddressMapEnabled,
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
