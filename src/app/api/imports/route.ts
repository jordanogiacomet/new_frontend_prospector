import { type NextRequest, NextResponse } from "next/server";

import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  paginatedSuccessResponse,
  successResponse,
  type ValidationErrorDetail,
} from "../../../server/api/errors";
import {
  requireApiSession,
  requireSameOrigin,
} from "../../../server/auth/require-api-session";
import { isDemoDataEnabled } from "../../../server/demo/mode";
import {
  listDemoImportBatches,
  submitDemoImport,
} from "../../../server/demo/prospecta-demo-data";
import { getServerEnv } from "../../../server/env";
import { listImportBatches } from "../../../server/imports/batch-read-service";
import {
  submitImport,
  type SubmitImportProducerOutcome,
  type SubmitImportResult,
} from "../../../server/imports/submit-import";
import {
  MAX_UPLOAD_BYTES,
  UploadFileValidationError,
} from "../../../server/imports/upload-file";
import type { ImportSubmissionRecord } from "../../../server/repositories/imports/import-submissions-repository";

const uploadFieldName = "arquivo_csv";
const idempotencyHeaderName = "idempotency-key";
const maximumMultipartBytes = MAX_UPLOAD_BYTES + 64 * 1024;
const defaultPage = 1;
const defaultPageSize = 20;
const maximumPage = 10_000;
const maximumPageSize = 100;

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

interface ImportListQuery {
  readonly page: number;
  readonly pageSize: number;
}

interface ImportSubmissionResponse {
  readonly submissionId: string;
  readonly appStatus: ImportSubmissionRecord["status"];
  readonly statusFactSource: string;
  readonly submittedAt: string;
  readonly producerOutcome: SubmitImportProducerOutcome;
  readonly workflowAcknowledgement: {
    readonly import_batch_id: string;
    readonly row_count: number;
    readonly acknowledgedAt: string;
  } | null;
  readonly durableAcceptance: null;
}

interface ImportRouteErrorResponse {
  readonly status: number;
  readonly body: {
    readonly error: {
      readonly code: string;
      readonly message: string;
      readonly details?: readonly ValidationErrorDetail[];
    };
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requireApiSession();
    requireImportsFeatureEnabled();

    const query = parseImportListQuery(request.nextUrl.searchParams);
    const result = isDemoDataEnabled()
      ? listDemoImportBatches({
          page: query.page,
          pageSize: query.pageSize,
        })
      : await listImportBatches({
          organizationId: authorization.actor.organizationId,
          page: query.page,
          pageSize: query.pageSize,
        });

    return NextResponse.json(
      paginatedSuccessResponse(result.batches, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      }),
      { headers: privateNoStoreHeaders },
    );
  } catch (error) {
    const { body, status } = mapApiError(error);

    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authorization = await requireApiSession();
    requireSameOrigin(request);
    requireImportsFeatureEnabled();

    const idempotencyKey = readIdempotencyKey(request);
    requireMultipartRequest(request);
    requireBoundedContentLength(request);

    const formData = await readFormData(request);
    const file = extractSingleUploadFile(formData);
    const result = isDemoDataEnabled()
      ? await submitDemoImport({
          organizationId: authorization.actor.organizationId,
          actor: authorization.actor,
          idempotencyKey,
          file,
        })
      : await submitImport(
          {
            organizationId: authorization.actor.organizationId,
            actor: authorization.actor,
            idempotencyKey,
            file,
          },
          {
            ingressClient: {
              fetch: globalThis.fetch,
            },
          },
        );

    return importResultResponse(result);
  } catch (error) {
    const { body, status } = mapImportRouteError(error);

    return NextResponse.json(body, {
      status,
      headers: privateNoStoreHeaders,
    });
  }
}

function parseImportListQuery(searchParams: URLSearchParams): ImportListQuery {
  for (const key of searchParams.keys()) {
    if (key !== "page" && key !== "pageSize") {
      throw validationError(key);
    }
  }

  if (searchParams.getAll("page").length > 1) {
    throw validationError("page");
  }

  if (searchParams.getAll("pageSize").length > 1) {
    throw validationError("pageSize");
  }

  return {
    page: parsePositiveIntegerQuery(
      searchParams.get("page"),
      "page",
      defaultPage,
      maximumPage,
    ),
    pageSize: parsePositiveIntegerQuery(
      searchParams.get("pageSize"),
      "pageSize",
      defaultPageSize,
      maximumPageSize,
    ),
  };
}

function parsePositiveIntegerQuery(
  value: string | null,
  field: string,
  fallback: number,
  maximum: number,
): number {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw validationError(field);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw validationError(field);
  }

  return parsed;
}

function requireImportsFeatureEnabled(): void {
  if (!getServerEnv().FEATURE_IMPORTS_ENABLED) {
    throw new SafeApiError("ACCESS_DENIED");
  }
}

function readIdempotencyKey(request: NextRequest): string {
  const value = request.headers.get(idempotencyHeaderName);

  if (
    value === null ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 128
  ) {
    throw validationError("idempotencyKey");
  }

  return value;
}

function requireMultipartRequest(request: NextRequest): void {
  const contentType = request.headers.get("content-type");
  const normalizedContentType = contentType?.toLowerCase();

  if (
    normalizedContentType === undefined ||
    (normalizedContentType !== "multipart/form-data" &&
      !normalizedContentType.startsWith("multipart/form-data;"))
  ) {
    throw validationError("request");
  }
}

function requireBoundedContentLength(request: NextRequest): void {
  const contentLength = request.headers.get("content-length");

  if (contentLength === null) {
    return;
  }

  const parsedLength = Number(contentLength);

  if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
    throw validationError("request");
  }

  if (parsedLength > maximumMultipartBytes) {
    throw new UploadFileValidationError("FILE_TOO_LARGE");
  }
}

async function readFormData(request: NextRequest): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw validationError("request");
  }
}

function extractSingleUploadFile(formData: FormData): File {
  const entries = [...formData.entries()];

  if (entries.length !== 1) {
    throw validationError(uploadFieldName);
  }

  const [[fieldName, value]] = entries;

  if (fieldName !== uploadFieldName || !isFile(value)) {
    throw validationError(uploadFieldName);
  }

  return value;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function importResultResponse(result: SubmitImportResult): NextResponse {
  if (result.kind === "conflict") {
    return NextResponse.json(
      {
        error: {
          code: "IMPORT_IDEMPOTENCY_CONFLICT",
          message: "Este envio conflita com um arquivo já registrado.",
        },
      },
      { status: 409, headers: privateNoStoreHeaders },
    );
  }

  return NextResponse.json(
    successResponse(
      mapSubmissionResponse(result.submission, result.producerOutcome),
      { result: result.kind },
    ),
    { status: 202, headers: privateNoStoreHeaders },
  );
}

function mapSubmissionResponse(
  submission: ImportSubmissionRecord,
  producerOutcome: SubmitImportProducerOutcome,
): ImportSubmissionResponse {
  return {
    submissionId: submission.submissionId,
    appStatus: submission.status,
    statusFactSource: submission.statusFactSource,
    submittedAt: submission.submittedAt.toISOString(),
    producerOutcome,
    workflowAcknowledgement:
      submission.producerAcknowledgement === null
        ? null
        : {
            import_batch_id:
              submission.producerAcknowledgement.import_batch_id,
            row_count: submission.producerAcknowledgement.row_count,
            acknowledgedAt:
              submission.producerAcknowledgement.producerAcknowledgedAt.toISOString(),
          },
    durableAcceptance: null,
  };
}

function mapImportRouteError(error: unknown): ImportRouteErrorResponse {
  if (error instanceof UploadFileValidationError) {
    return uploadValidationErrorResponse(error);
  }

  const mapped = mapApiError(error);

  return {
    status: mapped.status,
    body: mapped.body,
  };
}

function uploadValidationErrorResponse(
  error: UploadFileValidationError,
): ImportRouteErrorResponse {
  return {
    status: error.code === "FILE_TOO_LARGE" ? 413 : 400,
    body: {
      error: {
        code: "VALIDATION_ERROR",
        message: "Revise o arquivo informado.",
        details: [
          {
            field: uploadFieldName,
            message: "Valor inválido.",
          },
        ],
      },
    },
  };
}

function validationError(field: string): ApiValidationError {
  return new ApiValidationError([{ path: [field] }]);
}
