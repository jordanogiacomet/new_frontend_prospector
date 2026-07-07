import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  APPROVED_CSV_MEDIA_TYPES,
  MAX_UPLOAD_BYTES,
  UploadFileValidationError,
  validateAndHashUploadFile,
  type UploadFileInput,
} from "./upload-file";

const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

function upload(
  content: Uint8Array,
  overrides: Partial<Omit<UploadFileInput, "arrayBuffer">> = {},
): UploadFileInput & { arrayBuffer: ReturnType<typeof vi.fn> } {
  const arrayBuffer = vi.fn(async () => Uint8Array.from(content).buffer);

  return {
    name: overrides.name ?? "empresas-sinteticas.csv",
    type: overrides.type ?? "text/csv",
    size: overrides.size ?? content.byteLength,
    arrayBuffer,
  };
}

async function expectError(
  file: UploadFileInput,
  code: UploadFileValidationError["code"],
): Promise<void> {
  await expect(validateAndHashUploadFile(file)).rejects.toMatchObject({
    name: "UploadFileValidationError",
    message: "CSV upload validation failed.",
    code,
  });
}

describe("validateAndHashUploadFile", () => {
  it("accepts a valid synthetic CSV", async () => {
    const content = bytes(
      "CNPJ;Razão\n00000000000000;Empresa Sintética\n",
    );
    const result = await validateAndHashUploadFile(
      upload(content),
    );

    expect(result).toMatchObject({
      filename: "empresas-sinteticas.csv",
      mediaType: "text/csv",
      sizeBytes: content.byteLength,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("accepts an uppercase CSV extension", async () => {
    await expect(
      validateAndHashUploadFile(
        upload(bytes("header\n"), { name: "EMPRESAS.CSV" }),
      ),
    ).resolves.toMatchObject({ filename: "EMPRESAS.CSV" });
  });

  it.each(APPROVED_CSV_MEDIA_TYPES)(
    "accepts approved media type %s",
    async (type) => {
      await expect(
        validateAndHashUploadFile(upload(bytes("header\n"), { type })),
      ).resolves.toMatchObject({ mediaType: type });
    },
  );

  it("accepts and normalizes a media type charset parameter", async () => {
    await expect(
      validateAndHashUploadFile(
        upload(bytes("header\n"), { type: "Text/CSV; charset=UTF-8" }),
      ),
    ).resolves.toMatchObject({ mediaType: "text/csv" });
  });

  it("accepts exactly 10 MiB", async () => {
    const content = new Uint8Array(MAX_UPLOAD_BYTES);
    content.fill(0x78);
    content.set(bytes("header\n"));

    await expect(
      validateAndHashUploadFile(upload(content)),
    ).resolves.toMatchObject({ sizeBytes: MAX_UPLOAD_BYTES });
  });

  it("rejects a reported size above 10 MiB before reading bytes", async () => {
    const file = upload(bytes("header\n"), {
      size: MAX_UPLOAD_BYTES + 1,
    });

    await expectError(file, "FILE_TOO_LARGE");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects actual bytes above 10 MiB even when reported size is smaller", async () => {
    const content = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    content.fill(0x78);
    content.set(bytes("header\n"));

    await expectError(upload(content, { size: 1 }), "FILE_TOO_LARGE");
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid reported size %s",
    async (size) => {
      await expectError(upload(bytes("header\n"), { size }), "INVALID_SIZE");
    },
  );

  it.each([
    "",
    ".csv",
    "empresas.txt",
    "empresas.csv.exe",
    "empresas.csv ",
    "../empresas.csv",
    "pasta\\empresas.csv",
    "empresas\0.csv",
  ])("rejects invalid filename %s", async (name) => {
    await expectError(upload(bytes("header\n"), { name }), "INVALID_FILENAME");
  });

  it.each([
    "",
    "text/plain",
    "application/json",
    "application/octet-stream",
  ])("rejects unapproved media type %s", async (type) => {
    await expectError(
      upload(bytes("header\n"), { type }),
      "UNSUPPORTED_MEDIA_TYPE",
    );
  });

  it("rejects an empty file", async () => {
    await expectError(upload(new Uint8Array()), "EMPTY_HEADER");
  });

  it.each(["\nvalue\n", "\r\nvalue\r\n", "   \nvalue\n"])(
    "rejects an empty or whitespace header",
    async (content) => {
      await expectError(upload(bytes(content)), "EMPTY_HEADER");
    },
  );

  it("rejects a BOM-only header", async () => {
    await expectError(upload(bytes("\uFEFF\nvalue\n")), "EMPTY_HEADER");
  });

  it("accepts a UTF-8 BOM before a non-empty header", async () => {
    await expect(
      validateAndHashUploadFile(upload(bytes("\uFEFFCNPJ;Razão\n"))),
    ).resolves.toMatchObject({ sizeBytes: 15 });
  });

  it("rejects malformed UTF-8", async () => {
    await expectError(
      upload(new Uint8Array([0x43, 0x4e, 0x50, 0x4a, 0x0a, 0xff])),
      "INVALID_UTF8",
    );
  });

  it("rejects a NUL byte", async () => {
    await expectError(
      upload(new Uint8Array([0x43, 0x4e, 0x50, 0x4a, 0x00, 0x0a])),
      "NUL_BYTE",
    );
  });

  it("accepts a non-empty header without data rows", async () => {
    await expect(
      validateAndHashUploadFile(upload(bytes("CNPJ;Razão\n"))),
    ).resolves.toMatchObject({ sizeBytes: 12 });
  });

  it("calculates SHA-256 over the exact bytes", async () => {
    const result = await validateAndHashUploadFile(upload(bytes("abc")));

    expect(result.sha256).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("returns the exact CRLF bytes without normalization", async () => {
    const content = bytes("header\r\nvalue\r\n");
    const result = await validateAndHashUploadFile(upload(content));

    expect([...result.bytes]).toEqual([...content]);
  });

  it("returns BOM and accented UTF-8 bytes unchanged", async () => {
    const content = bytes("\uFEFFRazão\nAção\n");
    const result = await validateAndHashUploadFile(upload(content));

    expect([...result.bytes]).toEqual([...content]);
  });

  it("does not parse delimiters, rows, CNPJ, or business rules", async () => {
    const content = bytes(
      "qualquer,cabecalho\nvalor sem documento,regra inexistente\n",
    );

    const result = await validateAndHashUploadFile(upload(content));

    expect([...result.bytes]).toEqual([...content]);
  });

  it("reads the file bytes exactly once", async () => {
    const file = upload(bytes("header\nvalue\n"));

    await validateAndHashUploadFile(file);

    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("is server-only and contains no business or producer integration logic", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/imports/upload-file.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only";');
    expect(source).not.toMatch(
      /\bcnpj\b|fetch\(|N8N|webhook|postgres|database|idempotency|score|qualif/i,
    );
  });
});
