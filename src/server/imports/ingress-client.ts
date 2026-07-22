import "server-only";

import { getServerEnv } from "../env";
import type { ValidatedUploadFile } from "./upload-file";

const UNKNOWN_RESULT = { kind: "unknown" } as const;
const VERSIONED_CONTRACT = "prospecta-import-v1";
const VERSIONED_INGRESS_PATHS = new Set([
  "/webhook/prospecta/empresaqui/import/v1",
  "/webhook-test/prospecta/empresaqui/import/v1",
]);
const VERSIONED_RESPONSE_FIELDS = [
  "accepted",
  "import_batch_id",
  "message",
  "row_count",
  "source",
] as const;

export interface N8nIngressSubmission {
  readonly file: ValidatedUploadFile;
  readonly submissionId: string;
  readonly idempotencyKey: string;
  readonly contractVersion: string;
}

export interface N8nIngressAcknowledgement {
  readonly accepted: true;
  readonly message: string;
  readonly import_batch_id: string;
  readonly row_count: number;
  readonly source: string;
}

export type N8nIngressResult =
  | {
      readonly kind: "acknowledged";
      readonly acknowledgement: N8nIngressAcknowledgement;
    }
  | typeof UNKNOWN_RESULT;

export type N8nIngressFetch = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "json">>;

export interface N8nIngressClientDependencies {
  readonly fetch: N8nIngressFetch;
}

export async function submitToN8nIngress(
  submission: N8nIngressSubmission,
  dependencies: N8nIngressClientDependencies,
): Promise<N8nIngressResult> {
  const environment = getServerEnv();
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutResult = new Promise<typeof UNKNOWN_RESULT>((resolve) => {
    timeoutId = setTimeout(() => {
      abortController.abort();
      resolve(UNKNOWN_RESULT);
    }, environment.IMPORT_PRODUCER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      requestAcknowledgement(
        submission,
        dependencies.fetch,
        environment.N8N_IMPORT_URL,
        abortController.signal,
      ),
      timeoutResult,
    ]);
  } catch {
    return UNKNOWN_RESULT;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function requestAcknowledgement(
  submission: N8nIngressSubmission,
  fetch: N8nIngressFetch,
  url: string,
  signal: AbortSignal,
): Promise<N8nIngressResult> {
  const isVersioned = isVersionedIngressUrl(url);

  if (isVersioned && !isValidVersionedSubmission(submission)) {
    return UNKNOWN_RESULT;
  }

  const formData = new FormData();
  const filePart = new Blob([Uint8Array.from(submission.file.bytes)], {
    type: submission.file.mediaType,
  });

  formData.append("arquivo_csv", filePart, submission.file.filename);

  if (isVersioned) {
    formData.append("submission_id", submission.submissionId);
    formData.append("idempotency_key", submission.idempotencyKey);
    formData.append("file_sha256", submission.file.sha256);
    formData.append("contract_version", submission.contractVersion);
  }

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    signal,
  });

  if (response.status !== 202) {
    return UNKNOWN_RESULT;
  }

  const payload: unknown = await response.json();
  const acknowledgement = isVersioned
    ? parseVersionedAcknowledgement(payload)
    : parseLegacyAcknowledgement(payload);

  return acknowledgement === null
    ? UNKNOWN_RESULT
    : { kind: "acknowledged", acknowledgement };
}

function parseLegacyAcknowledgement(
  value: unknown,
): N8nIngressAcknowledgement | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    candidate.accepted !== true ||
    typeof candidate.message !== "string" ||
    typeof candidate.import_batch_id !== "string" ||
    candidate.import_batch_id.trim().length === 0 ||
    !Number.isSafeInteger(candidate.row_count) ||
    (candidate.row_count as number) < 0 ||
    typeof candidate.source !== "string"
  ) {
    return null;
  }

  return {
    accepted: true,
    message: candidate.message,
    import_batch_id: candidate.import_batch_id,
    row_count: candidate.row_count as number,
    source: candidate.source,
  };
}

function parseVersionedAcknowledgement(
  value: unknown,
): N8nIngressAcknowledgement | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const fields = Object.keys(candidate).sort();
  const expectedFields = [...VERSIONED_RESPONSE_FIELDS].sort();

  if (
    fields.length !== expectedFields.length ||
    fields.some((field, index) => field !== expectedFields[index]) ||
    candidate.accepted !== true ||
    candidate.message !== "Lote aceito para processamento." ||
    typeof candidate.import_batch_id !== "string" ||
    !/^ib_[0-9a-f]{64}$/.test(candidate.import_batch_id) ||
    !Number.isSafeInteger(candidate.row_count) ||
    (candidate.row_count as number) < 1 ||
    candidate.source !== "EmpresaAqui"
  ) {
    return null;
  }

  return {
    accepted: true,
    message: candidate.message,
    import_batch_id: candidate.import_batch_id,
    row_count: candidate.row_count as number,
    source: candidate.source,
  };
}

function isVersionedIngressUrl(url: string): boolean {
  try {
    return VERSIONED_INGRESS_PATHS.has(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isValidVersionedSubmission(
  submission: N8nIngressSubmission,
): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      submission.submissionId,
    ) &&
    submission.idempotencyKey.length > 0 &&
    submission.idempotencyKey.length <= 128 &&
    submission.idempotencyKey.trim() === submission.idempotencyKey &&
    /^[0-9a-f]{64}$/.test(submission.file.sha256) &&
    submission.contractVersion === VERSIONED_CONTRACT
  );
}
