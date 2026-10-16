import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiAuthorizationContext } from "../../../../../server/auth/require-api-session";
import type { LeadDetail } from "../../../../../types/leads";

const mocks = vi.hoisted(() => ({
  generateLeadApproachMessage: vi.fn(),
  getDemoLeadDetail: vi.fn(),
  getLeadDetail: vi.fn(),
  getSensitiveContentAccess: vi.fn(),
  getServerEnv: vi.fn(),
  isDemoDataEnabled: vi.fn(),
  listLeadApproachDraftStates: vi.fn(),
  prepareLeadApproachMessage: vi.fn(),
  requirePermission: vi.fn(),
  requireSameOrigin: vi.fn(),
  resolveLeadReadVisibility: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../../server/auth/require-api-session", () => ({
  requirePermission: mocks.requirePermission,
  requireSameOrigin: mocks.requireSameOrigin,
}));
vi.mock("../../../../../server/demo/mode", () => ({
  isDemoDataEnabled: mocks.isDemoDataEnabled,
}));
vi.mock("../../../../../server/demo/prospecta-demo-data", () => ({
  getDemoLeadDetail: mocks.getDemoLeadDetail,
}));
vi.mock("../../../../../server/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("../../../../../server/leads/lead-read-visibility", () => ({
  resolveLeadReadVisibility: mocks.resolveLeadReadVisibility,
}));
vi.mock(
  "../../../../../server/lead-approach/generate-lead-approach",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../../../../server/lead-approach/generate-lead-approach")
    >()),
    generateLeadApproachMessage: mocks.generateLeadApproachMessage,
  }),
);
vi.mock(
  "../../../../../server/lead-approach/lead-approach-draft-repository",
  () => ({
    listLeadApproachDraftStates: mocks.listLeadApproachDraftStates,
  }),
);
vi.mock(
  "../../../../../server/lead-approach/prepare-lead-approach",
  () => ({
    prepareLeadApproachMessage: mocks.prepareLeadApproachMessage,
  }),
);
vi.mock("../../../../../server/repositories/lead-detail-repository", () => ({
  getLeadDetail: mocks.getLeadDetail,
}));
vi.mock("../../../../../server/sensitive-content/access", () => ({
  getSensitiveContentAccess: mocks.getSensitiveContentAccess,
}));

import { SafeApiError } from "../../../../../server/api/errors";
import { LeadApproachGenerationError } from "../../../../../server/lead-approach/generate-lead-approach";
import { GET, POST } from "./route";

const cnpj = "11222333000181";
const leadRunId = `lr_${"a".repeat(64)}`;
const actor = {
  issuer: "urn:synthetic",
  subject: "synthetic-subject",
  organizationId: "synthetic-organization",
  permissions: ["leads:read", "sensitive:read"],
} as const;
const authorization: ApiAuthorizationContext = {
  status: "authorized",
  actor,
};
const sensitiveAccess = {
  enabled: true,
  allowedUrlHosts: [],
  now: new Date("2026-08-17T12:00:00.000Z"),
};
const detail = {
  cnpj,
  lead_run_id: leadRunId,
  companyName: "Empresa Aurora Sintética",
  tradeName: "Aurora",
  legalName: "Empresa Aurora Sintética Ltda.",
  sector: "Serviços empresariais",
  strategicReport: {
    status: "available",
    content: "Oportunidade: ampliar contratos recorrentes",
  },
} as LeadDetail;
const environment = {
  FEATURE_AI_APPROACH_ENABLED: true,
  OPENAI_API_KEY: "sk-synthetic-openai-key-never-use-in-production",
  OPENAI_APPROACH_MODEL: "configured-model-id",
  OPENAI_APPROACH_TIMEOUT_MS: 20_000,
};

function request(query = `?leadRunId=${leadRunId}`): NextRequest {
  return new NextRequest(
    `https://prospecta.example.test/api/leads/${cnpj}/approach-message${query}`,
    {
      method: "POST",
      headers: { Origin: "https://prospecta.example.test" },
    },
  );
}

function getRequest(query = `?leadRunId=${leadRunId}`): NextRequest {
  return new NextRequest(
    `https://prospecta.example.test/api/leads/${cnpj}/approach-message${query}`,
    { method: "GET" },
  );
}

function context(value = cnpj) {
  return { params: Promise.resolve({ cnpj: value }) };
}

describe("POST /api/leads/:cnpj/approach-message", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requirePermission.mockResolvedValue(authorization);
    mocks.getServerEnv.mockReturnValue(environment);
    mocks.isDemoDataEnabled.mockReturnValue(false);
    mocks.getSensitiveContentAccess.mockReturnValue(sensitiveAccess);
    mocks.resolveLeadReadVisibility.mockResolvedValue({});
    mocks.getLeadDetail.mockResolvedValue(detail);
    mocks.generateLeadApproachMessage.mockResolvedValue({
      message: "Mensagem sintética segura para a Empresa Aurora Sintética.",
    });
    mocks.prepareLeadApproachMessage.mockResolvedValue({
      status: "ready",
      message: "Mensagem sintética segura para a Empresa Aurora Sintética.",
    });
  });

  it("authorizes both permissions and same origin before config, validation, reads or generation", async () => {
    mocks.requirePermission.mockRejectedValue(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );
    const denied = request("?leadRunId=invalid");
    const json = vi.spyOn(denied, "json");

    const response = await POST(denied, context("invalid"));

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).toHaveBeenCalledWith("leads:read");
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getLeadDetail).not.toHaveBeenCalled();
    expect(mocks.generateLeadApproachMessage).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue({
      ...authorization,
      actor: { ...actor, permissions: ["leads:read"] },
    });
    const withoutSensitive = await POST(request(), context());
    expect(withoutSensitive.status).toBe(403);
    expect(mocks.requireSameOrigin).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue(authorization);
    mocks.requireSameOrigin.mockImplementation(() => {
      throw new SafeApiError("ACCESS_DENIED");
    });
    const crossOrigin = await POST(request(), context());
    expect(crossOrigin.status).toBe(403);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getLeadDetail).not.toHaveBeenCalled();
  });

  it("fails closed before producer reads when the feature is not configured", async () => {
    for (const disabled of [
      { ...environment, FEATURE_AI_APPROACH_ENABLED: false },
      { ...environment, OPENAI_API_KEY: undefined },
      { ...environment, OPENAI_APPROACH_MODEL: undefined },
    ]) {
      mocks.getServerEnv.mockReturnValueOnce(disabled);
      const response = await POST(request(), context());

      expect(response.status).toBe(403);
    }

    expect(mocks.getLeadDetail).not.toHaveBeenCalled();
    expect(mocks.generateLeadApproachMessage).not.toHaveBeenCalled();
  });

  it("re-reads the authorized selected run and returns only the generated message", async () => {
    const generatedMessage =
      "Olá! Uma mensagem sintética e personalizada para a Empresa Aurora Sintética.";
    mocks.prepareLeadApproachMessage.mockResolvedValue({
      status: "ready",
      message: generatedMessage,
    });
    const incoming = request();
    const json = vi.spyOn(incoming, "json");

    const response = await POST(incoming, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(json).not.toHaveBeenCalled();
    expect(mocks.getSensitiveContentAccess).toHaveBeenCalledWith(actor);
    expect(mocks.getLeadDetail).toHaveBeenCalledWith(
      cnpj,
      leadRunId,
      sensitiveAccess,
      {},
    );
    expect(mocks.prepareLeadApproachMessage).toHaveBeenCalledWith(
      detail,
      {
        organizationId: actor.organizationId,
        actorSubject: actor.subject,
      },
      {
        apiKey: environment.OPENAI_API_KEY,
        model: environment.OPENAI_APPROACH_MODEL,
        timeoutMilliseconds: environment.OPENAI_APPROACH_TIMEOUT_MS,
      },
    );
    expect(await response.json()).toEqual({
      data: { message: generatedMessage },
    });
  });

  it("returns an honest preparing response when another request owns the claim", async () => {
    mocks.prepareLeadApproachMessage.mockResolvedValue({
      status: "preparing",
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      data: { status: "preparing" },
    });
    expect(mocks.generateLeadApproachMessage).not.toHaveBeenCalled();
  });

  it("uses synthetic demo detail without a producer read", async () => {
    mocks.isDemoDataEnabled.mockReturnValue(true);
    mocks.getDemoLeadDetail.mockReturnValue(detail);

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.getDemoLeadDetail).toHaveBeenCalledWith(cnpj, leadRunId);
    expect(mocks.getLeadDetail).not.toHaveBeenCalled();
    expect(mocks.generateLeadApproachMessage).toHaveBeenCalledOnce();
    expect(mocks.prepareLeadApproachMessage).not.toHaveBeenCalled();
  });

  it("returns safe validation and not-found envelopes", async () => {
    const invalid = await POST(request(), context("invalid"));
    expect(invalid.status).toBe(400);
    expect(mocks.getLeadDetail).not.toHaveBeenCalled();

    mocks.getLeadDetail.mockResolvedValue(null);
    const missing = await POST(request(), context());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: { code: "LEAD_NOT_FOUND", message: "Empresa não encontrada." },
    });
  });

  it("maps provider failures to a fixed unavailable response", async () => {
    mocks.prepareLeadApproachMessage.mockRejectedValue(
      new LeadApproachGenerationError(),
    );

    const response = await POST(request(), context());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: {
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Não foi possível consultar os dados agora.",
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/openai|model|report|prompt/i);
    expect(mocks.prepareLeadApproachMessage).toHaveBeenCalledOnce();
  });
});

describe("GET /api/leads/:cnpj/approach-message", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.requirePermission.mockResolvedValue(authorization);
    mocks.isDemoDataEnabled.mockReturnValue(false);
    mocks.listLeadApproachDraftStates.mockResolvedValue([]);
  });

  it("authorizes both read permissions before validation or cache access", async () => {
    mocks.requirePermission.mockRejectedValue(
      new SafeApiError("AUTHENTICATION_REQUIRED"),
    );

    const unauthenticated = await GET(getRequest("?leadRunId=invalid"), context("invalid"));

    expect(unauthenticated.status).toBe(401);
    expect(mocks.listLeadApproachDraftStates).not.toHaveBeenCalled();

    mocks.requirePermission.mockResolvedValue({
      ...authorization,
      actor: { ...actor, permissions: ["leads:read"] },
    });

    const denied = await GET(getRequest(), context());

    expect(denied.status).toBe(403);
    expect(mocks.listLeadApproachDraftStates).not.toHaveBeenCalled();
  });

  it("returns the exact ready cache entry without producer, config or provider access", async () => {
    const persistedMessage =
      "Mensagem persistida e compartilhada para a Empresa Aurora Sintética.";
    mocks.listLeadApproachDraftStates.mockResolvedValue([
      {
        cnpjNormalizado: cnpj,
        observedLeadRunId: leadRunId,
        status: "ready",
        message: persistedMessage,
      },
    ]);

    const response = await GET(getRequest(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: { status: "ready", message: persistedMessage },
    });
    expect(mocks.listLeadApproachDraftStates).toHaveBeenCalledWith({
      organizationId: actor.organizationId,
      generatorVersion: "apollo-profile-fit-v2",
      identities: [{ cnpjNormalizado: cnpj, observedLeadRunId: leadRunId }],
      now: expect.any(Date),
    });
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getLeadDetail).not.toHaveBeenCalled();
    expect(mocks.generateLeadApproachMessage).not.toHaveBeenCalled();
    expect(mocks.prepareLeadApproachMessage).not.toHaveBeenCalled();
  });

  it("returns missing without persistent reads in synthetic demo mode", async () => {
    mocks.isDemoDataEnabled.mockReturnValue(true);

    const response = await GET(getRequest(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { status: "missing", message: null },
    });
    expect(mocks.listLeadApproachDraftStates).not.toHaveBeenCalled();
  });

  it("returns safe validation errors before cache access", async () => {
    const response = await GET(getRequest("?leadRunId=invalid"), context("invalid"));

    expect(response.status).toBe(400);
    expect(mocks.listLeadApproachDraftStates).not.toHaveBeenCalled();
  });
});
