import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  recordLegacyWorkflowClose: vi.fn(),
  recordLegacyWorkflowStart: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock(
  "../../../../server/repositories/imports/legacy-workflow-close-repository",
  () => ({
    recordLegacyWorkflowClose: mocks.recordLegacyWorkflowClose,
  }),
);
vi.mock(
  "../../../../server/repositories/imports/legacy-workflow-start-repository",
  () => ({
    recordLegacyWorkflowStart: mocks.recordLegacyWorkflowStart,
  }),
);

import type { NextRequest } from "next/server";
import { POST } from "./route";

const secret = "synthetic-callback-secret-at-least-32-bytes";
const body = {
  import_batch_id: "empresaqui_2026-07-22T13:50:05.504Z",
  event_type: "BATCH_CLOSED",
  occurred_at: "2026-07-22T14:20:05.504Z",
  payload: {
    closed: true,
    status: "COMPLETED",
    row_count_expected: 2,
    source: "EmpresaAqui",
    pipeline_version: "v7.4",
  },
} as const;
const acceptedRowBody = {
  import_batch_id: "empresaqui_2026-07-22T13:50:05.504Z",
  event_type: "ACCEPTED_ROW",
  occurred_at: "2026-07-22T13:51:05.504Z",
  source_row: 1,
  lead_run_id: "lead-run-synthetic-001",
  idempotency_key: "empresaqui:synthetic:001",
  cnpj_normalizado: "12345678000195",
  payload: {
    accepted: true,
    source: "EmpresaAqui",
    test_case_id: null,
    pre_trust_status: "LOW_RISK",
    company: {
      cnpj: "12345678000195",
      razao_social: "Empresa Sintética Ltda.",
      nome_fantasia: "Empresa Sintética",
    },
  },
} as const;

function request(overrides: {
  readonly authorization?: string;
  readonly contentType?: string;
  readonly json?: unknown;
} = {}): { readonly request: NextRequest; readonly json: ReturnType<typeof vi.fn> } {
  const json = vi.fn().mockResolvedValue(overrides.json ?? body);
  const headers = new Headers();

  if (overrides.authorization !== undefined) {
    headers.set("X-Prospecta-N8N-Secret", overrides.authorization);
  }
  headers.set("Content-Type", overrides.contentType ?? "application/json");

  return {
    request: { headers, json } as unknown as NextRequest,
    json,
  };
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json();
}

beforeEach(() => {
  mocks.getServerEnv.mockReset();
  mocks.recordLegacyWorkflowClose.mockReset();
  mocks.recordLegacyWorkflowStart.mockReset();
  mocks.getServerEnv.mockReturnValue({
    AUTH_ALLOWED_ORG_ID: "org-synthetic-a",
    FEATURE_IMPORTS_ENABLED: true,
    N8N_IMPORT_EVENT_SECRET: secret,
  });
  mocks.recordLegacyWorkflowClose.mockResolvedValue({
    kind: "recorded",
    submissionCount: 1,
  });
  mocks.recordLegacyWorkflowStart.mockResolvedValue({
    kind: "recorded",
    submissionCount: 1,
  });
});

describe("POST /api/imports/events", () => {
  it("returns 503 before reading the body when the receiver is disabled", async () => {
    mocks.getServerEnv.mockReturnValue({
      AUTH_ALLOWED_ORG_ID: "org-synthetic-a",
      FEATURE_IMPORTS_ENABLED: true,
      N8N_IMPORT_EVENT_SECRET: undefined,
    });
    const callback = request({ authorization: secret });

    const response = await POST(callback.request);

    expect(response.status).toBe(503);
    expect(callback.json).not.toHaveBeenCalled();
    expect(mocks.recordLegacyWorkflowClose).not.toHaveBeenCalled();
    expect(mocks.recordLegacyWorkflowStart).not.toHaveBeenCalled();
  });

  it.each([undefined, "wrong-secret-that-is-at-least-32-bytes"])(
    "returns 401 before reading the body for an invalid machine secret",
    async (authorization) => {
      const callback = request({ authorization });

      const response = await POST(callback.request);

      expect(response.status).toBe(401);
      expect(callback.json).not.toHaveBeenCalled();
      expect(mocks.recordLegacyWorkflowClose).not.toHaveBeenCalled();
      expect(mocks.recordLegacyWorkflowStart).not.toHaveBeenCalled();
      expect(await responseBody(response)).toEqual({
        error: {
          code: "IMPORT_EVENT_UNAUTHORIZED",
          message: "Evento de importação não autorizado.",
        },
      });
    },
  );

  it("rejects a non-JSON request before parsing or database work", async () => {
    const callback = request({
      authorization: secret,
      contentType: "text/plain",
    });

    const response = await POST(callback.request);

    expect(response.status).toBe(400);
    expect(callback.json).not.toHaveBeenCalled();
    expect(mocks.recordLegacyWorkflowClose).not.toHaveBeenCalled();
    expect(mocks.recordLegacyWorkflowStart).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, event_type: "TERMINAL_OUTCOME" },
    { ...body, import_batch_id: " batch" },
    { ...body, occurred_at: "not-a-date" },
    { ...body, payload: { ...body.payload, closed: false } },
    { ...body, payload: { ...body.payload, row_count_expected: 0 } },
    { ...body, unexpected: true },
  ])("rejects a malformed or unsupported callback", async (json) => {
    const callback = request({ authorization: secret, json });

    const response = await POST(callback.request);

    expect(response.status).toBe(400);
    expect(mocks.recordLegacyWorkflowClose).not.toHaveBeenCalled();
    expect(mocks.recordLegacyWorkflowStart).not.toHaveBeenCalled();
  });

  it.each([
    { ...acceptedRowBody, source_row: 0 },
    { ...acceptedRowBody, occurred_at: "not-a-date" },
    {
      ...acceptedRowBody,
      payload: { ...acceptedRowBody.payload, accepted: false },
    },
    {
      ...acceptedRowBody,
      payload: { ...acceptedRowBody.payload, source: "Other" },
    },
    { ...acceptedRowBody, unexpected: true },
  ])("rejects a malformed accepted-row callback", async (json) => {
    const callback = request({ authorization: secret, json });

    const response = await POST(callback.request);

    expect(response.status).toBe(400);
    expect(mocks.recordLegacyWorkflowClose).not.toHaveBeenCalled();
    expect(mocks.recordLegacyWorkflowStart).not.toHaveBeenCalled();
  });

  it("records a valid close report under the configured organization", async () => {
    const callback = request({ authorization: secret });

    const response = await POST(callback.request);

    expect(response.status).toBe(200);
    expect(mocks.recordLegacyWorkflowClose).toHaveBeenCalledWith({
      organizationId: "org-synthetic-a",
      importBatchId: body.import_batch_id,
      occurredAt: new Date(body.occurred_at),
      rowCountExpected: 2,
    });
    expect(await responseBody(response)).toEqual({
      data: { recorded: true, replayed: false },
    });
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
  });

  it("returns a successful idempotent result for an exact replay", async () => {
    mocks.recordLegacyWorkflowClose.mockResolvedValue({
      kind: "replayed",
      submissionCount: 1,
    });

    const response = await POST(request({ authorization: secret }).request);

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      data: { recorded: false, replayed: true },
    });
  });

  it("records only the accepted-row batch, time and source row under the configured organization", async () => {
    const response = await POST(
      request({ authorization: secret, json: acceptedRowBody }).request,
    );

    expect(response.status).toBe(200);
    expect(mocks.recordLegacyWorkflowStart).toHaveBeenCalledWith({
      organizationId: "org-synthetic-a",
      importBatchId: acceptedRowBody.import_batch_id,
      occurredAt: new Date(acceptedRowBody.occurred_at),
      sourceRow: acceptedRowBody.source_row,
    });
    expect(mocks.recordLegacyWorkflowClose).not.toHaveBeenCalled();
    expect(await responseBody(response)).toEqual({
      data: { recorded: true, replayed: false },
    });
  });

  it("passes a missing row identity as null without retaining company or producer payloads", async () => {
    const response = await POST(request({
      authorization: secret,
      json: { ...acceptedRowBody, source_row: null },
    }).request);

    expect(response.status).toBe(200);
    expect(mocks.recordLegacyWorkflowStart).toHaveBeenCalledExactlyOnceWith({
      organizationId: "org-synthetic-a",
      importBatchId: acceptedRowBody.import_batch_id,
      occurredAt: new Date(acceptedRowBody.occurred_at),
      sourceRow: null,
    });
    expect(JSON.stringify(mocks.recordLegacyWorkflowStart.mock.calls)).not.toMatch(
      /cnpj|lead_run_id|idempotency_key|razao_social|nome_fantasia|payload/i,
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid row identity %s before database work",
    async (source_row) => {
      const response = await POST(request({
        authorization: secret,
        json: { ...acceptedRowBody, source_row },
      }).request);

      expect(response.status).toBe(400);
      expect(mocks.recordLegacyWorkflowStart).not.toHaveBeenCalled();
      expect(mocks.recordLegacyWorkflowClose).not.toHaveBeenCalled();
    },
  );

  it("authenticates an individual company receipt before parsing or persistence", async () => {
    const callback = request({
      authorization: "wrong-synthetic-secret-at-least-32-bytes",
      json: acceptedRowBody,
    });

    expect((await POST(callback.request)).status).toBe(401);
    expect(callback.json).not.toHaveBeenCalled();
    expect(mocks.recordLegacyWorkflowStart).not.toHaveBeenCalled();
  });

  it("accepts a later accepted-row callback as an idempotent replay", async () => {
    mocks.recordLegacyWorkflowStart.mockResolvedValue({
      kind: "replayed",
      submissionCount: 1,
    });

    const response = await POST(
      request({
        authorization: secret,
        json: {
          ...acceptedRowBody,
          occurred_at: "2026-07-22T13:55:05.504Z",
          source_row: 2,
        },
      }).request,
    );

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      data: { recorded: false, replayed: true },
    });
  });

  it("maps a safe accepted-row correlation failure", async () => {
    mocks.recordLegacyWorkflowStart.mockResolvedValue({
      kind: "not_found",
      error: {
        code: "IMPORT_WORKFLOW_START_NOT_FOUND",
        httpStatus: 404,
        message: "Import workflow start correlation was not found.",
      },
    });

    const response = await POST(
      request({ authorization: secret, json: acceptedRowBody }).request,
    );

    expect(response.status).toBe(404);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "IMPORT_WORKFLOW_START_NOT_FOUND" },
    });
  });

  it("maps a safe accepted-row persistence conflict", async () => {
    mocks.recordLegacyWorkflowStart.mockResolvedValue({
      kind: "conflict",
      error: {
        code: "IMPORT_WORKFLOW_START_CONFLICT",
        httpStatus: 409,
        message: "Import workflow start facts conflict with the submission.",
      },
    });

    const response = await POST(
      request({ authorization: secret, json: acceptedRowBody }).request,
    );

    expect(response.status).toBe(409);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "IMPORT_WORKFLOW_START_CONFLICT" },
    });
  });

  it("uses a generic safe error when accepted-row persistence is unavailable", async () => {
    mocks.recordLegacyWorkflowStart.mockRejectedValue(
      new Error("synthetic database failure"),
    );

    const response = await POST(
      request({ authorization: secret, json: acceptedRowBody }).request,
    );

    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({
      error: {
        code: "IMPORT_EVENT_UNAVAILABLE",
        message: "Não foi possível registrar o evento de importação agora.",
      },
    });
  });

  it.each([
    {
      result: {
        kind: "not_found",
        error: { code: "IMPORT_WORKFLOW_CLOSE_NOT_FOUND", httpStatus: 404 },
      },
      status: 404,
      code: "IMPORT_WORKFLOW_CLOSE_NOT_FOUND",
    },
    {
      result: {
        kind: "conflict",
        error: { code: "IMPORT_WORKFLOW_CLOSE_CONFLICT", httpStatus: 409 },
      },
      status: 409,
      code: "IMPORT_WORKFLOW_CLOSE_CONFLICT",
    },
  ])("maps safe correlation failures", async ({ result, status, code }) => {
    mocks.recordLegacyWorkflowClose.mockResolvedValue(result);

    const response = await POST(request({ authorization: secret }).request);

    expect(response.status).toBe(status);
    expect(await responseBody(response)).toMatchObject({
      error: { code },
    });
  });
});
