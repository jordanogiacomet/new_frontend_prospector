import "server-only";

import { randomUUID } from "node:crypto";

import { ZodError, type ZodIssue } from "zod";

export interface SuccessResponse<Data> {
  data: Data;
}

export interface SuccessResponseWithMeta<
  Data,
  Meta extends object,
> extends SuccessResponse<Data> {
  meta: Meta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ValidationErrorDetail {
  field: string;
  message: "Valor inválido.";
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_DENIED"
  | "LEAD_NOT_FOUND"
  | "HISTORY_UNAVAILABLE"
  | "DATA_SOURCE_UNAVAILABLE"
  | "UNEXPECTED_ERROR";

type SafeApiErrorCode = Exclude<
  ApiErrorCode,
  "VALIDATION_ERROR" | "UNEXPECTED_ERROR"
>;

interface ValidationErrorEnvelope {
  error: {
    code: "VALIDATION_ERROR";
    message: "Revise os filtros informados.";
    details: ValidationErrorDetail[];
  };
}

interface NonValidationErrorEnvelope {
  error: {
    code: Exclude<ApiErrorCode, "VALIDATION_ERROR">;
    message: string;
    details?: never;
  };
}

export type ApiErrorEnvelope =
  | ValidationErrorEnvelope
  | NonValidationErrorEnvelope;

export interface MappedApiError {
  status: 400 | 401 | 403 | 404 | 500 | 503;
  body: ApiErrorEnvelope;
  logContext: {
    correlationId: string;
    category: ApiErrorCode;
  };
}

interface ValidationIssueInput {
  readonly path?: readonly PropertyKey[];
  readonly keys?: readonly unknown[];
  readonly message?: unknown;
}

const errorDefinitions = {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Entre para acessar os dados.",
  },
  ACCESS_DENIED: {
    status: 403,
    message: "Você não tem acesso a esta área.",
  },
  LEAD_NOT_FOUND: {
    status: 404,
    message: "Empresa não encontrada.",
  },
  HISTORY_UNAVAILABLE: {
    status: 503,
    message: "O histórico não está disponível no momento.",
  },
  DATA_SOURCE_UNAVAILABLE: {
    status: 503,
    message: "Não foi possível consultar os dados agora.",
  },
  UNEXPECTED_ERROR: {
    status: 500,
    message: "Ocorreu um erro inesperado. Tente novamente.",
  },
} as const satisfies Record<
  Exclude<ApiErrorCode, "VALIDATION_ERROR">,
  { status: MappedApiError["status"]; message: string }
>;

const safeFieldSegment = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const maximumValidationDetails = 20;

export function successResponse<Data>(data: Data): SuccessResponse<Data>;
export function successResponse<Data, Meta extends object>(
  data: Data,
  meta: Meta,
): SuccessResponseWithMeta<Data, Meta>;
export function successResponse<Data, Meta extends object>(
  data: Data,
  meta?: Meta,
): SuccessResponse<Data> | SuccessResponseWithMeta<Data, Meta> {
  if (meta === undefined) {
    return { data };
  }

  return { data, meta };
}

export function paginatedSuccessResponse<
  Data,
  Meta extends PaginationMeta,
>(
  data: Data[],
  meta: Meta,
): SuccessResponseWithMeta<Data[], Meta> {
  return { data, meta };
}

export class SafeApiError extends Error {
  readonly code: SafeApiErrorCode;

  constructor(code: SafeApiErrorCode) {
    super(errorDefinitions[code].message);
    this.name = "SafeApiError";
    this.code = code;
  }
}

export class ApiValidationError extends Error {
  readonly fields: readonly string[];

  constructor(issues: readonly ValidationIssueInput[]) {
    super("Request validation failed.");
    this.name = "ApiValidationError";
    this.fields = extractSafeFields(issues);
  }
}

export function mapApiError(error: unknown): MappedApiError {
  if (error instanceof ApiValidationError) {
    return mapValidationError(error.fields);
  }

  if (error instanceof ZodError) {
    return mapValidationError(extractSafeFields(error.issues));
  }

  if (error instanceof SafeApiError) {
    return mapKnownError(error.code);
  }

  if (isDatabaseUnavailableError(error)) {
    return mapKnownError("DATA_SOURCE_UNAVAILABLE");
  }

  return mapKnownError("UNEXPECTED_ERROR");
}

function mapValidationError(fields: readonly string[]): MappedApiError {
  const safeFields = fields.length > 0 ? fields : ["request"];

  return {
    status: 400,
    body: {
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise os filtros informados.",
        details: safeFields.map((field) => ({
          field,
          message: "Valor inválido.",
        })),
      },
    },
    logContext: createLogContext("VALIDATION_ERROR"),
  };
}

function mapKnownError(
  code: Exclude<ApiErrorCode, "VALIDATION_ERROR">,
): MappedApiError {
  const definition = errorDefinitions[code];

  return {
    status: definition.status,
    body: {
      error: {
        code,
        message: definition.message,
      },
    },
    logContext: createLogContext(code),
  };
}

function createLogContext(category: ApiErrorCode): MappedApiError["logContext"] {
  return {
    correlationId: randomUUID(),
    category,
  };
}

function extractSafeFields(
  issues: readonly ValidationIssueInput[] | readonly ZodIssue[],
): string[] {
  const fields = new Set<string>();

  for (const issue of issues) {
    const paths = issuePaths(issue);

    for (const path of paths) {
      fields.add(sanitizeFieldPath(path));

      if (fields.size === maximumValidationDetails) {
        return [...fields];
      }
    }
  }

  return [...fields];
}

function issuePaths(issue: ValidationIssueInput): readonly PropertyKey[][] {
  if (issue.path && issue.path.length > 0) {
    return [issue.path.slice()];
  }

  if (issue.keys) {
    const safeKeys = issue.keys.filter(
      (key): key is string => typeof key === "string",
    );

    if (safeKeys.length > 0) {
      return safeKeys.map((key) => [key]);
    }
  }

  return [[]];
}

function sanitizeFieldPath(path: readonly PropertyKey[]): string {
  if (path.length === 0 || path.length > 4) {
    return "request";
  }

  const segments: string[] = [];

  for (const segment of path) {
    if (typeof segment === "string" && safeFieldSegment.test(segment)) {
      segments.push(segment);
      continue;
    }

    if (
      typeof segment === "number" &&
      Number.isSafeInteger(segment) &&
      segment >= 0 &&
      segment <= 9_999
    ) {
      segments.push(String(segment));
      continue;
    }

    return "request";
  }

  return segments.join(".");
}

function isDatabaseUnavailableError(error: unknown): boolean {
  try {
    return (
      error instanceof Error &&
      error.name === "DatabaseUnavailableError" &&
      "code" in error &&
      error.code === "DATABASE_UNAVAILABLE"
    );
  } catch {
    return false;
  }
}
