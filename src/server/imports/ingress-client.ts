import "server-only";

import { getServerEnv } from "../env";
import type { ValidatedUploadFile } from "./upload-file";

const ACKNOWLEDGEMENT_FIELDS = [
  "accepted",
  "message",
  "import_batch_id",
  "row_count",
  "source",
] as const;

const UNKNOWN_RESULT = { kind: "unknown" } as const;

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
  file: ValidatedUploadFile,
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
        file,
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
  file: ValidatedUploadFile,
  fetch: N8nIngressFetch,
  url: string,
  signal: AbortSignal,
): Promise<N8nIngressResult> {
  const formData = new FormData();
  const filePart = new Blob([Uint8Array.from(file.bytes)], {
    type: file.mediaType,
  });

  formData.append("arquivo_csv", filePart, file.filename);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    signal,
  });

  if (response.status !== 202) {
    return UNKNOWN_RESULT;
  }

  const payload: unknown = await response.json();
  const acknowledgement = parseAcknowledgement(payload);

  return acknowledgement === null
    ? UNKNOWN_RESULT
    : { kind: "acknowledged", acknowledgement };
}

function parseAcknowledgement(
  value: unknown,
): N8nIngressAcknowledgement | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const fields = Object.keys(value).sort();
  const expectedFields = [...ACKNOWLEDGEMENT_FIELDS].sort();

  if (
    fields.length !== expectedFields.length ||
    fields.some((field, index) => field !== expectedFields[index])
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
