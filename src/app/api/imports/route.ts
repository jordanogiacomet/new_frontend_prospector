import { type NextRequest, NextResponse } from "next/server";

import {
  ApiValidationError,
  SafeApiError,
  mapApiError,
  successResponse,
  type ValidationErrorDetail,
} from "../../../server/api/errors";
import {
  requireApiSession,
  requireSameOrigin,
} from "../../../server/auth/require-api-session";
import { getServerEnv } from "../../../server/env";
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

const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store",
} as const;

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
    const result = await submitImport(
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
