import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool, type QueryResultRow } from "pg";

export const VERSIONED_CONTRACT = "prospecta-import-v1";
export const VERSIONED_PATHS = [
  "/webhook/prospecta/empresaqui/import/v1",
  "/webhook-test/prospecta/empresaqui/import/v1",
] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 30_000;
const encoder = new TextEncoder();

export interface VersionedAcceptance {
  readonly accepted: true;
  readonly import_batch_id: string;
  readonly message: "Lote aceito para processamento.";
  readonly row_count: number;
  readonly source: "EmpresaAqui";
}

export interface ContractResponse {
  readonly bodyText: string;
  readonly contentType: string;
  readonly elapsedMs: number;
  readonly receivedAt: Date;
  readonly startedAt: Date;
  readonly status: number;
}

export interface UploadIdentity {
  readonly fileSha256: string;
  readonly idempotencyKey: string;
  readonly submissionId: string;
}

export interface SendUploadOptions {
  readonly bytes: Uint8Array;
  readonly contractVersion?: string;
  readonly declaredSha256?: string;
  readonly fieldName?: string;
  readonly filename?: string;
  readonly identity?: UploadIdentity;
  readonly mediaType?: string;
  readonly omitFields?: ReadonlySet<
    "contract_version" | "file_sha256" | "idempotency_key" | "submission_id"
  >;
  readonly timeoutMs?: number;
}

interface RemoteInspectionEvidence {
  readonly active: boolean;
  readonly artifact_sha256: string;
  readonly inspected_at: string;
  readonly target_url: string;
  readonly version_id: string;
  readonly webhook_path: string;
  readonly workflow_id: string;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function newUploadIdentity(bytes: Uint8Array): UploadIdentity {
  return {
    fileSha256: sha256(bytes),
    idempotencyKey: `contract-${randomUUID()}`,
    submissionId: randomUUID(),
  };
}

export function syntheticCsv(rows = 2): Uint8Array {
  const suffix = randomUUID().slice(0, 8);
  const body = Array.from({ length: rows }, (_, index) =>
    [
      "00000000000000",
      `Empresa Sintetica Versionada ${suffix} ${index + 1}`,
      "ATIVA",
    ].join(";"),
  ).join("\n");

  return encoder.encode(`CNPJ;Razão;Situação Cad.\n${body}\n`);
}

export function exactSizeCsv(byteLength: number): Uint8Array {
  const prefix = encoder.encode(
    "CNPJ;Razão;Situação Cad.;extra\n00000000000000;Empresa Sintetica Limite;ATIVA;",
  );
  const suffix = encoder.encode("\n");
  const paddingLength = byteLength - prefix.byteLength - suffix.byteLength;

  if (paddingLength < 0) {
    throw new Error("Synthetic contract fixture size is too small");
  }

  const bytes = new Uint8Array(byteLength);
  bytes.set(prefix);
  bytes.fill("x".charCodeAt(0), prefix.byteLength, prefix.byteLength + paddingLength);
  bytes.set(suffix, prefix.byteLength + paddingLength);
  return bytes;
}

export async function sendVersionedUpload(
  target: URL,
  options: SendUploadOptions,
): Promise<ContractResponse> {
  const identity = options.identity ?? newUploadIdentity(options.bytes);
  const omitted = options.omitFields ?? new Set();
  const form = new FormData();
  const bodyBytes = Uint8Array.from(options.bytes);

  form.append(
    options.fieldName ?? "arquivo_csv",
    new Blob([bodyBytes.buffer], {
      type: options.mediaType ?? "text/csv",
    }),
    options.filename ?? "synthetic-versioned-contract.csv",
  );

  if (!omitted.has("submission_id")) {
    form.append("submission_id", identity.submissionId);
  }
  if (!omitted.has("idempotency_key")) {
    form.append("idempotency_key", identity.idempotencyKey);
  }
  if (!omitted.has("file_sha256")) {
    form.append(
      "file_sha256",
      options.declaredSha256 ?? identity.fileSha256,
    );
  }
  if (!omitted.has("contract_version")) {
    form.append(
      "contract_version",
      options.contractVersion ?? VERSIONED_CONTRACT,
    );
  }

  const startedAt = new Date();
  const startedAtMonotonic = performance.now();
  const response = await fetch(target, {
    body: form,
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });
  const bodyText = await response.text();

  return {
    bodyText,
    contentType: response.headers.get("content-type") ?? "",
    elapsedMs: Math.round(performance.now() - startedAtMonotonic),
    receivedAt: new Date(),
    startedAt,
    status: response.status,
  };
}

export async function sendGet(target: URL): Promise<ContractResponse> {
  const startedAt = new Date();
  const startedAtMonotonic = performance.now();
  const response = await fetch(target, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const bodyText = await response.text();

  return {
    bodyText,
    contentType: response.headers.get("content-type") ?? "",
    elapsedMs: Math.round(performance.now() - startedAtMonotonic),
    receivedAt: new Date(),
    startedAt,
    status: response.status,
  };
}

export function parseAcceptance(
  response: ContractResponse,
): VersionedAcceptance {
  let value: unknown;

  try {
    value = JSON.parse(response.bodyText);
  } catch {
    throw new Error("Versioned ingress response was not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Versioned ingress response was not a JSON object");
  }

  const body = value as Record<string, unknown>;
  const exactKeys = [
    "accepted",
    "import_batch_id",
    "message",
    "row_count",
    "source",
  ].sort();

  if (
    JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(exactKeys) ||
    body.accepted !== true ||
    body.message !== "Lote aceito para processamento." ||
    typeof body.import_batch_id !== "string" ||
    !/^ib_[0-9a-f]{64}$/.test(body.import_batch_id) ||
    !Number.isInteger(body.row_count) ||
    Number(body.row_count) < 1 ||
    body.source !== "EmpresaAqui"
  ) {
    throw new Error("Versioned ingress response did not match the exact schema");
  }

  return body as unknown as VersionedAcceptance;
}

export function isSafeClientFailure(response: ContractResponse): boolean {
  if (response.status < 400 || response.status > 499) {
    return false;
  }

  return (
    encoder.encode(response.bodyText).byteLength <= 2_048 &&
    [
      /authorization/i,
      /bearer/i,
      /company_validation/i,
      /credential/i,
      /node_modules/i,
      /postgres/i,
      /select\s+.+\s+from/i,
      /stack/i,
      /workflow[_ -]?execution/i,
    ].every((pattern) => !pattern.test(response.bodyText))
  );
}

export function responseSummary(response: ContractResponse): string {
  return [
    `status=${response.status}`,
    `content-type=${response.contentType || "missing"}`,
    `response-bytes=${encoder.encode(response.bodyText).byteLength}`,
    `elapsed-ms=${response.elapsedMs}`,
  ].join(", ");
}

export function readInspectionEvidence(
  evidencePath: string,
): RemoteInspectionEvidence {
  let value: unknown;

  try {
    value = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    throw new Error("Authorized versioned workflow inspection evidence is unreadable");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Authorized versioned workflow inspection evidence is invalid");
  }

  return value as RemoteInspectionEvidence;
}

export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export class ReadOnlyProducerEvidence {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      application_name: "prospecta-versioned-contract",
      connectionString,
      max: 1,
      query_timeout: 5_000,
      statement_timeout: 5_000,
    });
  }

  async query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[],
  ): Promise<readonly Row[]> {
    try {
      return (await this.pool.query<Row>(text, [...values])).rows;
    } catch {
      throw new Error("Approved producer contract evidence source is unavailable");
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
