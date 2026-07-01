import "server-only";

export interface ServerEnv {
  DATABASE_URL: string;
  AUTH_SECRET: string;
  AUTH_OIDC_ISSUER: string;
  AUTH_OIDC_CLIENT_ID: string;
  AUTH_OIDC_CLIENT_SECRET: string;
  AUTH_ALLOWED_ORG_ID: string;
}

type EnvironmentInput = Record<string, string | undefined>;

function readRequired(
  input: EnvironmentInput,
  name: keyof ServerEnv,
  errors: string[],
): string {
  const value = input[name];

  if (!value || value.trim() === "") {
    errors.push(`${name} is required`);
    return "";
  }

  return value;
}

function validateDatabaseUrl(value: string, errors: string[]): void {
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
      errors.push("DATABASE_URL must be a complete PostgreSQL URL");
    }
  } catch {
    errors.push("DATABASE_URL must be a complete PostgreSQL URL");
  }
}

function validateOidcIssuer(value: string, errors: string[]): void {
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
      errors.push("AUTH_OIDC_ISSUER must be an absolute HTTPS URL");
    }
  } catch {
    errors.push("AUTH_OIDC_ISSUER must be an absolute HTTPS URL");
  }
}

export function parseServerEnv(input: EnvironmentInput): ServerEnv {
  const errors: string[] = [];
  const environment: ServerEnv = {
    DATABASE_URL: readRequired(input, "DATABASE_URL", errors),
    AUTH_SECRET: readRequired(input, "AUTH_SECRET", errors),
    AUTH_OIDC_ISSUER: readRequired(input, "AUTH_OIDC_ISSUER", errors),
    AUTH_OIDC_CLIENT_ID: readRequired(input, "AUTH_OIDC_CLIENT_ID", errors),
    AUTH_OIDC_CLIENT_SECRET: readRequired(
      input,
      "AUTH_OIDC_CLIENT_SECRET",
      errors,
    ),
    AUTH_ALLOWED_ORG_ID: readRequired(input, "AUTH_ALLOWED_ORG_ID", errors),
  };

  if (environment.DATABASE_URL) {
    validateDatabaseUrl(environment.DATABASE_URL, errors);
  }

  if (environment.AUTH_SECRET && environment.AUTH_SECRET.length < 32) {
    errors.push("AUTH_SECRET must contain at least 32 characters");
  }

  if (environment.AUTH_OIDC_ISSUER) {
    validateOidcIssuer(environment.AUTH_OIDC_ISSUER, errors);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid server environment: ${errors.join("; ")}`);
  }

  return environment;
}

export function getServerEnv(
  input: EnvironmentInput = process.env,
): ServerEnv {
  return parseServerEnv(input);
}
