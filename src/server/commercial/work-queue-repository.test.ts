import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ProducerDatabaseUnavailableError extends Error {
    readonly code = "DATABASE_UNAVAILABLE";

    constructor() {
      super("Database temporarily unavailable.");
      this.name = "DatabaseUnavailableError";
    }
  }

  class AppDatabaseUnavailableError extends Error {
    readonly code = "DATABASE_UNAVAILABLE";

    constructor() {
      super("Database temporarily unavailable.");
      this.name = "DatabaseUnavailableError";
    }
  }

  return {
    producerQuery: vi.fn(),
    appQuery: vi.fn(),
    ProducerDatabaseUnavailableError,
    AppDatabaseUnavailableError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../db/producer-client", () => ({
  query: mocks.producerQuery,
  DatabaseUnavailableError: mocks.ProducerDatabaseUnavailableError,
}));
vi.mock("../db/app-client", () => ({
  query: mocks.appQuery,
  DatabaseUnavailableError: mocks.AppDatabaseUnavailableError,
}));

import type { SqlStatement as AppSqlStatement } from "../db/app-client";
import type { SqlStatement as ProducerSqlStatement } from "../db/producer-client";
import {
  CommercialWorkQueueRepositoryInputError,
  listCommercialWorkQueue,
  type ListCommercialWorkQueueInput,
} from "./work-queue-repository";

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const cnpj = "12345678000195";
const otherCnpj = "22345678000196";
const workspaceId = "00000000-0000-4000-8000-000000000033";
const leadRunId = `lr_${"a".repeat(64)}`;
const otherLeadRunId = `lr_${"b".repeat(64)}`;
const validatedAt = new Date("2026-07-09T12:00:00.000Z");
const workspaceCreatedAt = new Date("2026-07-09T12:01:00.000Z");
const workspaceUpdatedAt = new Date("2026-07-09T12:02:00.000Z");

function actor() {
  return { organizationId };
}

function producerRow(
  overrides: Partial<{
    decision_id: string;
    import_batch_id: string | null;
    lead_run_id: string;
    source_row: number | null;
    source_hash: string | null;
    agent_version: string;
    cnpj_normalizado: string;
    nome_fantasia: string | null;
    razao_social: string | null;
    cidade: string | null;
    uf: string | null;
    cnae_descricao: string | null;
    company_domain: string | null;
    trust_score: number | null;
    priority: string | null;
    final_action: string | null;
    trust_status: string | null;
    validated_at: Date | string;
  }> = {},
) {
  return {
    decision_id: overrides.decision_id ?? "9001",
    import_batch_id: overrides.import_batch_id ?? "batch-synthetic-033",
    lead_run_id: overrides.lead_run_id ?? leadRunId,
    source_row: Object.hasOwn(overrides, "source_row")
      ? (overrides.source_row ?? null)
      : 7,
    source_hash: Object.hasOwn(overrides, "source_hash")
      ? (overrides.source_hash ?? null)
      : "sha256:synthetic-source-hash",
    agent_version: overrides.agent_version ?? "agent-synthetic-v1",
    cnpj_normalizado: overrides.cnpj_normalizado ?? cnpj,
    nome_fantasia: Object.hasOwn(overrides, "nome_fantasia")
      ? (overrides.nome_fantasia ?? null)
      : "Empresa Sintetica",
    razao_social: Object.hasOwn(overrides, "razao_social")
      ? (overrides.razao_social ?? null)
      : "Empresa Sintetica Ltda.",
    cidade: Object.hasOwn(overrides, "cidade")
      ? (overrides.cidade ?? null)
      : "Recife",
    uf: Object.hasOwn(overrides, "uf") ? (overrides.uf ?? null) : "PE",
    cnae_descricao: Object.hasOwn(overrides, "cnae_descricao")
      ? (overrides.cnae_descricao ?? null)
      : "Servicos sinteticos",
    company_domain: Object.hasOwn(overrides, "company_domain")
      ? (overrides.company_domain ?? null)
      : "empresa.example",
    trust_score: Object.hasOwn(overrides, "trust_score")
      ? (overrides.trust_score ?? null)
      : 82,
    priority: Object.hasOwn(overrides, "priority")
      ? (overrides.priority ?? null)
      : "B",
    final_action: Object.hasOwn(overrides, "final_action")
      ? (overrides.final_action ?? null)
      : "PROSPECTAR",
    trust_status: Object.hasOwn(overrides, "trust_status")
      ? (overrides.trust_status ?? null)
      : "Revisao Humana",
    validated_at: overrides.validated_at ?? validatedAt,
  };
}

function workspaceRow(
  overrides: Partial<{
    workspace_id: string;
    organization_id: string;
    cnpj_normalizado: string;
    observed_lead_run_id: string;
    responsible_subject: string | null;
    commercial_stage:
      | "NOT_STARTED"
      | "ASSIGNED"
      | "CONTACTED"
      | "FOLLOW_UP"
      | "MEETING"
      | "PAUSED"
      | "CLOSED_WON"
      | "CLOSED_LOST";
    next_action: string | null;
    next_action_due_at: Date | string | null;
    commercial_outcome:
      | "WON"
      | "LOST"
      | "NO_RESPONSE"
      | "NOT_NOW"
      | "DISQUALIFIED"
      | null;
    version: number;
    created_by_subject: string;
    updated_by_subject: string;
    created_at: Date | string;
    updated_at: Date | string;
    archived_at: Date | string | null;
    archived_by_subject: string | null;
  }> = {},
) {
  return {
    workspace_id: overrides.workspace_id ?? workspaceId,
    organization_id: overrides.organization_id ?? organizationId,
    cnpj_normalizado: overrides.cnpj_normalizado ?? cnpj,
    observed_lead_run_id: overrides.observed_lead_run_id ?? leadRunId,
    responsible_subject: Object.hasOwn(overrides, "responsible_subject")
      ? (overrides.responsible_subject ?? null)
      : actorSubject,
    commercial_stage: overrides.commercial_stage ?? "ASSIGNED",
    next_action: Object.hasOwn(overrides, "next_action")
      ? (overrides.next_action ?? null)
      : "Ligar para financeiro",
    next_action_due_at: Object.hasOwn(overrides, "next_action_due_at")
      ? (overrides.next_action_due_at ?? null)
      : "2026-07-10T12:00:00.000Z",
    commercial_outcome: Object.hasOwn(overrides, "commercial_outcome")
      ? (overrides.commercial_outcome ?? null)
      : null,
    version: overrides.version ?? 3,
    created_by_subject: overrides.created_by_subject ?? actorSubject,
    updated_by_subject: overrides.updated_by_subject ?? actorSubject,
    created_at: overrides.created_at ?? workspaceCreatedAt,
    updated_at: overrides.updated_at ?? workspaceUpdatedAt,
    archived_at: Object.hasOwn(overrides, "archived_at")
      ? (overrides.archived_at ?? null)
      : null,
    archived_by_subject: Object.hasOwn(overrides, "archived_by_subject")
      ? (overrides.archived_by_subject ?? null)
      : null,
  };
}

function sourceGuardRows(count: number): { cnpj: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    cnpj: String(index).padStart(14, "0"),
  }));
}

function producerStatements(): ProducerSqlStatement[] {
  return mocks.producerQuery.mock.calls.map(
    (call) => call[0] as ProducerSqlStatement,
  );
}

function appStatements(): AppSqlStatement[] {
  return mocks.appQuery.mock.calls.map(
    (call) => call[0] as AppSqlStatement,
  );
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/commercial/work-queue-repository.ts",
    ),
    "utf8",
  );
}

beforeEach(() => {
  mocks.producerQuery.mockReset();
  mocks.appQuery.mockReset();
});

describe("listCommercialWorkQueue", () => {
  it.each([
    ["missing input", null],
    ["missing actor", {}],
    ["blank organization", { actor: { organizationId: "" } }],
    ["zero page", { actor: actor(), page: 0 }],
    ["oversized page", { actor: actor(), page: 10_001 }],
    ["fractional page size", { actor: actor(), pageSize: 1.5 }],
    ["zero page size", { actor: actor(), pageSize: 0 }],
    [
      "unknown filter",
      { actor: actor(), filters: { q: "Empresa Sintetica" } },
    ],
    [
      "invalid cnpj filter",
      { actor: actor(), filters: { cnpj_normalizado: "12" } },
    ],
    [
      "invalid uf filter",
      { actor: actor(), filters: { uf: "XX" } },
    ],
    [
      "invalid priority filter",
      { actor: actor(), filters: { priority: "A" } },
    ],
    [
      "invalid stage filter",
      { actor: actor(), filters: { commercial_stage: "OPEN" } },
    ],
    [
      "invalid responsible filter",
      { actor: actor(), filters: { responsible_subject: " " } },
    ],
    ["invalid sort", { actor: actor(), sort: "score_desc" }],
  ] as const)(
    "rejects invalid input before database work: %s",
    async (_label, input) => {
      await expect(
        listCommercialWorkQueue(
          input as unknown as ListCommercialWorkQueueInput,
        ),
      ).rejects.toBeInstanceOf(CommercialWorkQueueRepositoryInputError);

      expect(mocks.producerQuery).not.toHaveBeenCalled();
      expect(mocks.appQuery).not.toHaveBeenCalled();
    },
  );

  it("returns an empty available page when approved producer leads have no rows", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result).toEqual({
      kind: "listed",
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      provenance: {
        producer: {
          factSource: "producer_current_leads_v1",
          availability: "AVAILABLE",
        },
        workspace: {
          factSource: "app_lead_workspaces_v1",
          availability: "AVAILABLE",
        },
      },
    });
    expect(mocks.appQuery).not.toHaveBeenCalled();
  });

  it("associates app-owned workspaces by the approved external CNPJ key", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([producerRow()]);
    mocks.appQuery.mockResolvedValueOnce([workspaceRow()]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result.items).toEqual([
      expect.objectContaining({
        companyDomain: "empresa.example",
        producerLead: expect.objectContaining({
          cnpj,
          score: 82,
          priority: "B",
          recommendedAction: "PROSPECTAR",
          trustStatus: "Revisao Humana",
        }),
        workspace: expect.objectContaining({
          workspace_id: workspaceId,
          organization_id: organizationId,
          cnpj_normalizado: cnpj,
          commercial_stage: "ASSIGNED",
        }),
        sources: {
          producer: { factSource: "producer_current_leads_v1" },
          workspace: {
            factSource: "app_lead_workspaces_v1",
            state: "matched",
          },
        },
      }),
    ]);
  });

  it("decorates persisted drafts at every priority but marks only absent B/C drafts for automatic generation", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValueOnce([
        producerRow({ priority: "B" }),
        producerRow({
          decision_id: "9002",
          cnpj_normalizado: otherCnpj,
          lead_run_id: otherLeadRunId,
          priority: "C",
        }),
        producerRow({
          decision_id: "9003",
          cnpj_normalizado: "99888777000166",
          lead_run_id: `lr_${"c".repeat(64)}`,
          priority: "D",
        }),
      ]);
    mocks.appQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          cnpj_normalizado: cnpj,
          observed_lead_run_id: leadRunId,
          status: "READY",
          generation_attempt_id: null,
          message: "Mensagem sintética pronta.",
          lease_expires_at: null,
          retry_after: null,
        },
        {
          cnpj_normalizado: otherCnpj,
          observed_lead_run_id: otherLeadRunId,
          status: "FAILED",
          generation_attempt_id: null,
          message: null,
          lease_expires_at: null,
          retry_after: new Date("2026-08-17T12:05:00.000Z"),
        },
        {
          cnpj_normalizado: "99888777000166",
          observed_lead_run_id: `lr_${"c".repeat(64)}`,
          status: "READY",
          generation_attempt_id: null,
          message: "Mensagem manual da empresa com nota D.",
          lease_expires_at: null,
          retry_after: null,
        },
      ]);

    const result = await listCommercialWorkQueue(
      { actor: actor() },
      {},
      {
        includeApproachDrafts: true,
        now: new Date("2026-08-17T12:00:00.000Z"),
      },
    );

    expect(result.items.map((item) => item.approachDraft)).toEqual([
      { status: "ready", message: "Mensagem sintética pronta." },
      { status: "unavailable", message: null },
      { status: "ready", message: "Mensagem manual da empresa com nota D." },
    ]);
    expect(appStatements()[1]?.values).toEqual([
      organizationId,
      "apollo-profile-fit-v2",
      [cnpj, otherCnpj, "99888777000166"],
      [leadRunId, otherLeadRunId, `lr_${"c".repeat(64)}`],
    ]);
  });

  it("keeps an absent lower-priority draft null while B/C remain automatically claimable", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        producerRow({ priority: "B" }),
        producerRow({
          decision_id: "9002",
          cnpj_normalizado: otherCnpj,
          lead_run_id: otherLeadRunId,
          priority: "E",
        }),
      ]);
    mocks.appQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue(
      { actor: actor() },
      {},
      { includeApproachDrafts: true },
    );

    expect(result.items.map((item) => item.approachDraft)).toEqual([
      { status: "missing", message: null },
      null,
    ]);
  });

  it("withholds all approach-draft state when cache access is not authorized", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([producerRow({ priority: "B" })]);
    mocks.appQuery.mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result.items[0]?.approachDraft).toBeNull();
    expect(mocks.appQuery).toHaveBeenCalledOnce();
  });

  it("withholds an invalid producer company domain", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        producerRow({ company_domain: "https://empresa.example/path" }),
      ]);
    mocks.appQuery.mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result.items[0]?.companyDomain).toBeNull();
  });

  it("selects only the exact company-domain producer columns and fails ambiguous matches closed", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listCommercialWorkQueue({ actor: actor() });

    const statement = producerStatements()[2]?.text ?? "";
    expect(statement).toContain("public.crm_company_history");
    expect(statement).toMatch(/history\.cnpj = lead\.cnpj_normalizado/i);
    expect(statement).toMatch(/COUNT\(DISTINCT/i);
    expect(statement).toMatch(/AS company_domain/i);
    expect(statement).not.toMatch(
      /contact_name|contact_email|contact_phone|latest_status|suppression_level/i,
    );
  });

  it("scopes workspace association by organization_id", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([producerRow()]);
    mocks.appQuery.mockResolvedValueOnce([workspaceRow()]);

    await listCommercialWorkQueue({
      actor: { organizationId: otherOrganizationId },
    });

    expect(appStatements()[0]?.text).toMatch(/organization_id = \$1/i);
    expect(appStatements()[0]?.values).toEqual([
      otherOrganizationId,
      [cnpj],
    ]);
  });

  it("applies page, pageSize, limit, and offset server-side", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 12 }])
      .mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({
      actor: actor(),
      page: 3,
      pageSize: 7,
    });

    expect(result).toMatchObject({
      page: 3,
      pageSize: 7,
      total: 12,
    });
    expect(producerStatements()[2]?.text).toMatch(/LIMIT \$7 OFFSET \$8/i);
    expect(producerStatements()[2]?.values.slice(-2)).toEqual([7, 14]);
  });

  it("caps pageSize at the server-side maximum", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({
      actor: actor(),
      pageSize: 500,
    });

    expect(result.pageSize).toBe(100);
    expect(producerStatements()[2]?.values.slice(-2)).toEqual([100, 0]);
  });

  it("applies the approved sort without interpolating client input", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listCommercialWorkQueue({
      actor: actor(),
      sort: "last_analysis_desc",
    });

    const dataStatement = producerStatements()[2];
    expect(dataStatement?.text).toMatch(
      /ORDER BY lead\.validated_at DESC, lead\.projection_id DESC/i,
    );
    expect(dataStatement?.text).not.toContain("last_analysis_desc");
  });

  it("uses the same bound correlated-batch visibility as the current lead list", async () => {
    const correlatedBatchIds = [
      "synthetic-correlated-batch",
      "batch'); SELECT pg_sleep(1); --",
    ];
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listCommercialWorkQueue(
      {
        actor: actor(),
        page: 3,
        pageSize: 7,
      },
      { includeTestRunsFromImportBatchIds: correlatedBatchIds },
    );

    const [, countStatement, dataStatement] = producerStatements();
    expect(countStatement?.text).toContain(
      "terminal.import_batch_id = ANY($7::text[])",
    );
    expect(dataStatement?.text).toContain(
      "terminal.import_batch_id = ANY($7::text[])",
    );
    expect(dataStatement?.text).toMatch(/LIMIT \$8 OFFSET \$9/i);
    expect(countStatement?.values[6]).toEqual(correlatedBatchIds);
    expect(dataStatement?.values.slice(-3)).toEqual([
      correlatedBatchIds,
      7,
      14,
    ]);
    expect(countStatement?.text).not.toContain(correlatedBatchIds[0]);
    expect(countStatement?.text).not.toContain(correlatedBatchIds[1]);
  });

  it("applies producer filters as bound SQL parameters", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await listCommercialWorkQueue({
      actor: actor(),
      filters: {
        cnpj_normalizado: cnpj,
        uf: "PE",
        priority: "D",
      },
    });

    const [, countStatement, dataStatement] = producerStatements();
    expect(countStatement?.text).toMatch(/lead\.cnpj_normalizado = \$7/i);
    expect(countStatement?.text).toMatch(/lead\.uf = \$8/i);
    expect(countStatement?.text).toMatch(/lead\.priority = \$9/i);
    expect(countStatement?.values).toEqual(
      expect.arrayContaining([cnpj, "PE", "D"]),
    );
    expect(dataStatement?.values).toEqual(
      expect.arrayContaining([cnpj, "PE", "D"]),
    );
    expect(countStatement?.text).not.toContain(cnpj);
  });

  it("uses commercial stage filters through the organization-scoped app source", async () => {
    mocks.appQuery.mockResolvedValueOnce([{ cnpj_normalizado: cnpj }]);
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([producerRow()]);
    mocks.appQuery.mockResolvedValueOnce([workspaceRow()]);

    await listCommercialWorkQueue({
      actor: actor(),
      filters: { commercial_stage: "ASSIGNED" },
    });

    expect(appStatements()[0]?.text).toMatch(/commercial_stage = \$2/i);
    expect(appStatements()[0]?.values).toEqual([
      organizationId,
      "ASSIGNED",
    ]);
    expect(producerStatements()[1]?.text).toMatch(
      /lead\.cnpj_normalizado = ANY\(\$7::text\[\]\)/i,
    );
    expect(producerStatements()[1]?.values[6]).toEqual([cnpj]);
  });

  it("uses an unassigned responsible filter without fabricating a subject", async () => {
    mocks.appQuery.mockResolvedValueOnce([{ cnpj_normalizado: cnpj }]);
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([producerRow()]);
    mocks.appQuery.mockResolvedValueOnce([
      workspaceRow({
        responsible_subject: null,
        commercial_stage: "NOT_STARTED",
      }),
    ]);

    const result = await listCommercialWorkQueue({
      actor: actor(),
      filters: { responsible_subject: null },
    });

    expect(appStatements()[0]?.text).toMatch(/responsible_subject IS NULL/i);
    expect(appStatements()[0]?.values).toEqual([organizationId]);
    expect(result.items[0]?.workspace).toMatchObject({
      responsible_subject: null,
      commercial_stage: "NOT_STARTED",
    });
  });

  it("returns a confirmed empty list when workspace filters match no app rows", async () => {
    mocks.appQuery.mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({
      actor: actor(),
      filters: { responsible_subject: actorSubject },
    });

    expect(result).toMatchObject({
      kind: "listed",
      items: [],
      total: 0,
      provenance: {
        producer: {
          availability: "NOT_QUERIED",
        },
      },
    });
    expect(mocks.producerQuery).not.toHaveBeenCalled();
  });

  it("returns producer leads without workspaces as missing workspace state", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([producerRow()]);
    mocks.appQuery.mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result.items).toEqual([
      expect.objectContaining({
        producerLead: expect.objectContaining({ cnpj }),
        workspace: null,
        sources: expect.objectContaining({
          workspace: {
            factSource: "app_lead_workspaces_v1",
            state: "missing",
          },
        }),
      }),
    ]);
  });

  it("does not create a queue item for a workspace without an approved producer lead", async () => {
    mocks.appQuery.mockResolvedValueOnce([{ cnpj_normalizado: otherCnpj }]);
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listCommercialWorkQueue({
      actor: actor(),
      filters: { commercial_stage: "CONTACTED" },
    });

    expect(result).toMatchObject({
      kind: "listed",
      items: [],
      total: 0,
    });
    expect(mocks.appQuery).toHaveBeenCalledTimes(1);
  });

  it("keeps producer score, action, priority, verdict, and trust semantics unchanged", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        producerRow({
          trust_score: 0,
          priority: "R",
          final_action: "REVISAR_MANUALMENTE",
          trust_status: "Status Sintetico",
        }),
      ]);
    mocks.appQuery.mockResolvedValueOnce([
      workspaceRow({ commercial_stage: "CLOSED_WON" }),
    ]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result.items[0]?.producerLead).toMatchObject({
      score: 0,
      priority: "R",
      recommendedAction: "REVISAR_MANUALMENTE",
      trustStatus: "Status Sintetico",
    });
    expect(result.items[0]?.workspace).toMatchObject({
      commercial_stage: "CLOSED_WON",
    });
  });

  it("keeps producer totals null when the producer source is unavailable", async () => {
    mocks.producerQuery.mockRejectedValueOnce(
      new mocks.ProducerDatabaseUnavailableError(),
    );

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result).toEqual({
      kind: "listed",
      items: [],
      page: 1,
      pageSize: 20,
      total: null,
      provenance: {
        producer: {
          factSource: "producer_current_leads_v1",
          availability: "UNAVAILABLE",
          unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
        },
        workspace: {
          factSource: "app_lead_workspaces_v1",
          availability: "AVAILABLE",
        },
      },
    });
    expect(mocks.appQuery).not.toHaveBeenCalled();
  });

  it("keeps producer totals null when the source guard is exceeded", async () => {
    mocks.producerQuery.mockResolvedValueOnce(sourceGuardRows(1_001));

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result).toMatchObject({
      kind: "listed",
      items: [],
      total: null,
      provenance: {
        producer: {
          availability: "UNAVAILABLE",
          unavailableBasis: "PRODUCER_SOURCE_GUARD_EXCEEDED",
        },
      },
    });
    expect(mocks.producerQuery).toHaveBeenCalledTimes(1);
  });

  it("keeps producer totals null when exact count is unavailable", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1_001 }]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result).toMatchObject({
      kind: "listed",
      items: [],
      total: null,
      provenance: {
        producer: {
          availability: "UNAVAILABLE",
          unavailableBasis: "PRODUCER_SOURCE_UNAVAILABLE",
        },
      },
    });
    expect(mocks.producerQuery).toHaveBeenCalledTimes(2);
  });

  it("propagates app database unavailability as a safe database error", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([producerRow()]);
    mocks.appQuery.mockRejectedValueOnce(
      new mocks.AppDatabaseUnavailableError(),
    );

    const error = await listCommercialWorkQueue({
      actor: actor(),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(mocks.AppDatabaseUnavailableError);
    expect(error).toMatchObject({
      code: "DATABASE_UNAVAILABLE",
      message: "Database temporarily unavailable.",
    });
  });

  it("does not expose sensitive producer content outside the base allowlist", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          ...producerRow(),
          idempotency_key: "idem-sensitive",
          report_json: { raw: "sensitive report" },
          evidences: [{ url: "https://sensitive.example" }],
          email: "person@example.test",
          phone: "+5500000000000",
        },
      ]);
    mocks.appQuery.mockResolvedValueOnce([workspaceRow()]);

    const result = await listCommercialWorkQueue({ actor: actor() });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("idem-sensitive");
    expect(serialized).not.toContain("sensitive report");
    expect(serialized).not.toContain("person@example.test");
    expect(serialized).not.toContain("+5500000000000");
    expect(serialized).not.toContain("evidences");
    expect(serialized).not.toContain("strategicReport");
  });

  it("keeps distinct producer recommendation and commercial stage fields", async () => {
    mocks.producerQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        producerRow({
          final_action: "PROSPECTAR",
          lead_run_id: otherLeadRunId,
        }),
      ]);
    mocks.appQuery.mockResolvedValueOnce([
      workspaceRow({
        observed_lead_run_id: leadRunId,
        commercial_stage: "PAUSED",
      }),
    ]);

    const result = await listCommercialWorkQueue({ actor: actor() });

    expect(result.items[0]?.producerLead.recommendedAction).toBe(
      "PROSPECTAR",
    );
    expect(result.items[0]?.workspace?.commercial_stage).toBe("PAUSED");
    expect(result.items[0]?.workspace?.observed_lead_run_id).toBe(
      leadRunId,
    );
    expect(result.items[0]?.producerLead.lead_run_id).toBe(otherLeadRunId);
  });
});

describe("commercial work queue source restrictions", () => {
  it("contains no app or producer mutation SQL", () => {
    expect(source()).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE)\b/i,
    );
  });

  it("contains no n8n, webhook, or fetch call", () => {
    expect(source()).not.toMatch(/n8n|webhook|fetch\s*\(/i);
  });
});
