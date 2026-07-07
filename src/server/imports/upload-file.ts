import "server-only";

import { createHash } from "node:crypto";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const APPROVED_CSV_MEDIA_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
] as const;

export type UploadFileErrorCode =
  | "INVALID_FILENAME"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_SIZE"
  | "FILE_TOO_LARGE"
  | "INVALID_UTF8"
  | "NUL_BYTE"
  | "EMPTY_HEADER";

export interface UploadFileInput {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ValidatedUploadFile {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export class UploadFileValidationError extends Error {
  readonly code: UploadFileErrorCode;

  constructor(code: UploadFileErrorCode) {
    super("CSV upload validation failed.");
    this.name = "UploadFileValidationError";
    this.code = code;
  }
}

export async function validateAndHashUploadFile(
  file: UploadFileInput,
): Promise<ValidatedUploadFile> {
  validateFilename(file.name);
  const mediaType = validateMediaType(file.type);
  validateReportedSize(file.size);

  const bytes = Uint8Array.from(new Uint8Array(await file.arrayBuffer()));

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadFileValidationError("FILE_TOO_LARGE");
  }

  if (bytes.includes(0)) {
    throw new UploadFileValidationError("NUL_BYTE");
  }

  const content = decodeUtf8(bytes);
  validateHeader(content);

  return {
    bytes,
    filename: file.name,
    mediaType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
  };
}

function validateFilename(filename: string): void {
  const hasCsvExtension =
    /^[^/\\\0]+\.csv$/i.test(filename) && !/^\.csv$/i.test(filename);

  if (!hasCsvExtension) {
    throw new UploadFileValidationError("INVALID_FILENAME");
  }
}

function validateMediaType(mediaType: string): string {
  const normalized = mediaType.split(";", 1)[0].trim().toLowerCase();

  if (
    !APPROVED_CSV_MEDIA_TYPES.includes(
      normalized as (typeof APPROVED_CSV_MEDIA_TYPES)[number],
    )
  ) {
    throw new UploadFileValidationError("UNSUPPORTED_MEDIA_TYPE");
  }

  return normalized;
}

function validateReportedSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new UploadFileValidationError("INVALID_SIZE");
  }

  if (size > MAX_UPLOAD_BYTES) {
    throw new UploadFileValidationError("FILE_TOO_LARGE");
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new UploadFileValidationError("INVALID_UTF8");
  }
}

function validateHeader(content: string): void {
  const lineBreakIndex = content.search(/[\r\n]/);
  const header =
    lineBreakIndex === -1 ? content : content.slice(0, lineBreakIndex);
  const withoutBom = header.replace(/^\uFEFF/, "");

  if (withoutBom.trim().length === 0) {
    throw new UploadFileValidationError("EMPTY_HEADER");
  }
}
