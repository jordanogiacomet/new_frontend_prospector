import "server-only";

export class BoundedJsonError extends Error {
  readonly code = "BOUNDED_JSON_INVALID";

  constructor() {
    super("Invalid bounded JSON request.");
    this.name = "BoundedJsonError";
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<{ readonly body: unknown; readonly exactBytes: Buffer }> {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new BoundedJsonError();
  }

  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > maximumBytes
    ) {
      throw new BoundedJsonError();
    }
  }

  const reader = request.body?.getReader();
  if (reader === undefined) throw new BoundedJsonError();

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) throw new BoundedJsonError();
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof BoundedJsonError) throw error;
    throw new BoundedJsonError();
  }

  const exactBytes = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
  if (exactBytes.byteLength === 0) throw new BoundedJsonError();

  try {
    return {
      body: JSON.parse(exactBytes.toString("utf8")) as unknown,
      exactBytes,
    };
  } catch {
    throw new BoundedJsonError();
  }
}

