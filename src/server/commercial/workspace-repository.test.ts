import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: {
    query: vi.fn(),
  },
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

import type { AppDatabaseTransaction, SqlStatement } from "../db/app-client";
import {
  LeadWorkspaceRepositoryInputError,
  createLeadWorkspace,
  getLeadWorkspace,
  updateLeadWorkspace,
  type CommercialWorkspaceActorContext,
} from "./workspace-repository";

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const actorIssuer = "https://identity.synthetic.test/tenant";
const requestCorrelationId = "00000000-0000-4000-8000-000000000829";
const otherSubject = "oidc|synthetic-seller";
const cnpj = "12345678000195";
const leadRunId = `lr_${"a".repeat(64)}`;
const workspaceId = "00000000-0000-4000-8000-000000000029";
const createdAt = new Date("2026-07-09T10:00:00.000Z");
const updatedAt = new Date("2026-07-09T10:01:00.000Z");
const nextActionDueAt = "2026-07-10T12:00:00.000Z";

function installTransactionMock(): void {
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
}

function actor(
  overrides: Partial<CommercialWorkspaceActorContext> = {},
): CommercialWorkspaceActorContext {
  return {
    organizationId: overrides.organizationId ?? organizationId,
    actorSubject: overrides.actorSubject ?? actorSubject,
    actorIssuer: overrides.actorIssuer ?? actorIssuer,
    requestCorrelationId:
      overrides.requestCorrelationId ?? requestCorrelationId,
    authorizationBasis:
      overrides.authorizationBasis ?? "verified_oidc",
    permissions: overrides.permissions,
  };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    cnpj_normalizado: cnpj,
    observed_lead_run_id: leadRunId,
    ...overrides,
  };
}

const invalidCreateInputCases: ReadonlyArray<
  readonly [
    string,
    {
      readonly actor?: CommercialWorkspaceActorContext;
      readonly request?: Record<string, unknown>;
    },
  ]
> = [
  ["invalid actor organization", { actor: actor({ organizationId: "" }) }],
  ["invalid actor subject", { actor: actor({ actorSubject: " " }) }],
  ["invalid actor issuer", { actor: actor({ actorIssuer: " " }) }],
  [
    "invalid request correlation",
    { actor: actor({ requestCorrelationId: "not-a-uuid" }) },
  ],
  [
    "mismatched authorization basis",
    { actor: actor({ authorizationBasis: "local_demo3" }) },
  ],
  [
    "invalid cnpj",
    { request: createRequest({ cnpj_normalizado: "not-a-cnpj" }) },
  ],
  [
    "invalid lead run",
    { request: createRequest({ observed_lead_run_id: "lead-run" }) },
  ],
];

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
      : "oidc|synthetic-owner",
    commercial_stage: overrides.commercial_stage ?? "ASSIGNED",
    next_action: Object.hasOwn(overrides, "next_action")
      ? (overrides.next_action ?? null)
      : "Ligar para financeiro",
    next_action_due_at: Object.hasOwn(overrides, "next_action_due_at")
      ? (overrides.next_action_due_at ?? null)
      : null,
    commercial_outcome: Object.hasOwn(overrides, "commercial_outcome")
      ? (overrides.commercial_outcome ?? null)
      : null,
    version: overrides.version ?? 1,
    created_by_subject: overrides.created_by_subject ?? actorSubject,
    updated_by_subject: overrides.updated_by_subject ?? actorSubject,
    created_at: overrides.created_at ?? createdAt,
    updated_at: overrides.updated_at ?? updatedAt,
    archived_at: Object.hasOwn(overrides, "archived_at")
      ? (overrides.archived_at ?? null)
      : null,
    archived_by_subject: Object.hasOwn(overrides, "archived_by_subject")
      ? (overrides.archived_by_subject ?? null)
      : null,
  };
}

function statements(): SqlStatement[] {
  return mocks.client.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function readStatements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/commercial/workspace-repository.ts",
    ),
    "utf8",
  );
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.query.mockReset();
  mocks.transaction.mockReset();
  installTransactionMock();
});

describe("createLeadWorkspace", () => {
  it("creates an unassigned workspace with organization and actor from context", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceRow({
          responsible_subject: null,
          commercial_stage: "NOT_STARTED",
          next_action: null,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await createLeadWorkspace({
      actor: actor(),
      request: createRequest(),
    });

    expect(result).toMatchObject({
      kind: "created",
      workspace: {
        organization_id: organizationId,
        cnpj_normalizado: cnpj,
        observed_lead_run_id: leadRunId,
        responsible_subject: null,
        commercial_stage: "NOT_STARTED",
        version: 1,
        created_by_subject: actorSubject,
        updated_by_subject: actorSubject,
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(statements()[0]?.text).toMatch(
      /INSERT INTO prospecting_app\.lead_workspaces/i,
    );
    expect(statements()[1]?.text).toMatch(
      /INSERT INTO prospecting_app\.commercial_audit_events/i,
    );
    expect(statements()[0]?.values).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      organizationId,
      cnpj,
      leadRunId,
      null,
      "NOT_STARTED",
      null,
      null,
      actorSubject,
    ]);
  });

  it("creates an assigned workspace when responsible_subject is supplied", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceRow({
          responsible_subject: otherSubject,
          commercial_stage: "ASSIGNED",
          next_action_due_at: new Date(nextActionDueAt),
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await createLeadWorkspace({
      actor: actor(),
      request: createRequest({
        responsible_subject: otherSubject,
        next_action: "Agendar conversa",
        next_action_due_at: nextActionDueAt,
      }),
    });

    expect(result).toMatchObject({
      kind: "created",
      workspace: {
        responsible_subject: otherSubject,
        commercial_stage: "ASSIGNED",
        next_action_due_at: nextActionDueAt,
      },
    });
    expect(statements()[0]?.values).toEqual([
      expect.any(String),
      organizationId,
      cnpj,
      leadRunId,
      otherSubject,
      "ASSIGNED",
      "Agendar conversa",
      nextActionDueAt,
      actorSubject,
    ]);
  });

  it("returns a safe conflict when an active workspace already exists", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    const result = await createLeadWorkspace({
      actor: actor(),
      request: createRequest(),
    });

    expect(result).toEqual({
      kind: "conflict",
      error: {
        code: "LEAD_WORKSPACE_ALREADY_EXISTS",
        httpStatus: 409,
        message: "A commercial workspace already exists for this company.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/INSERT|prospecting_app|\$1/i);
  });

  it("rejects server-controlled request fields before database work", async () => {
    await expect(
      createLeadWorkspace({
        actor: actor(),
        request: createRequest({
          organization_id: otherOrganizationId,
          created_by_subject: "oidc|attacker",
        }),
      }),
    ).rejects.toBeInstanceOf(LeadWorkspaceRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(invalidCreateInputCases)(
    "rejects %s before database work",
    async (_label, input) => {
      await expect(
        createLeadWorkspace({
          actor: input.actor ?? actor(),
          request: input.request ?? createRequest(),
        }),
      ).rejects.toBeInstanceOf(LeadWorkspaceRepositoryInputError);

      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
});

describe("getLeadWorkspace", () => {
  it("reads a workspace by organization_id and workspace_id", async () => {
    mocks.query.mockResolvedValueOnce([workspaceRow()]);

    const result = await getLeadWorkspace({
      actor: actor(),
      workspaceId,
    });

    expect(result).toEqual({
      kind: "found",
      workspace: {
        workspace_id: workspaceId,
        organization_id: organizationId,
        cnpj_normalizado: cnpj,
        observed_lead_run_id: leadRunId,
        responsible_subject: "oidc|synthetic-owner",
        commercial_stage: "ASSIGNED",
        next_action: "Ligar para financeiro",
        next_action_due_at: null,
        commercial_outcome: null,
        version: 1,
        created_by_subject: actorSubject,
        updated_by_subject: actorSubject,
        created_at: createdAt.toISOString(),
        updated_at: updatedAt.toISOString(),
        archived_at: null,
        archived_by_subject: null,
      },
    });
    expect(readStatements()[0]?.text).toMatch(
      /WHERE organization_id = \$1\s+AND workspace_id = \$2/i,
    );
    expect(readStatements()[0]?.values).toEqual([
      organizationId,
      workspaceId,
    ]);
  });

  it("fails closed for cross-organization reads", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await getLeadWorkspace({
      actor: actor({ organizationId: otherOrganizationId }),
      workspaceId,
    });

    expect(result).toMatchObject({ kind: "not_found" });
    expect(readStatements()[0]?.values).toEqual([
      otherOrganizationId,
      workspaceId,
    ]);
  });

  it("rejects invalid workspace ids before database work", async () => {
    await expect(
      getLeadWorkspace({
        actor: actor(),
        workspaceId: "not-a-uuid",
      }),
    ).rejects.toBeInstanceOf(LeadWorkspaceRepositoryInputError);

    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("updateLeadWorkspace", () => {
  it("returns stale_version for an old expected_version without writing audit", async () => {
    mocks.client.query.mockResolvedValueOnce([workspaceRow({ version: 2 })]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: "Enviar proposta",
      },
    });

    expect(result).toEqual({
      kind: "stale_version",
      error: {
        code: "LEAD_WORKSPACE_VERSION_CONFLICT",
        httpStatus: 409,
        message: "Commercial workspace changed. Refresh before saving.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("updates with the expected version and increments version", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow({ version: 1 })])
      .mockResolvedValueOnce([
        workspaceRow({
          version: 2,
          updated_by_subject: actorSubject,
          next_action: "Enviar proposta",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: "Enviar proposta",
      },
    });

    expect(result).toMatchObject({
      kind: "updated",
      workspace: {
        version: 2,
        updated_by_subject: actorSubject,
        next_action: "Enviar proposta",
      },
    });
    expect(statements()[0]?.text).toMatch(/FOR UPDATE/i);
    expect(statements()[1]?.text).toMatch(/version = version \+ 1/i);
    expect(statements()[1]?.values).toEqual([
      organizationId,
      workspaceId,
      "oidc|synthetic-owner",
      "ASSIGNED",
      "Enviar proposta",
      null,
      null,
      actorSubject,
      1,
    ]);
    expect(statements()[2]?.values[7]).toBe("NEXT_ACTION_CHANGED");
  });

  it("allows claiming an unassigned NOT_STARTED workspace and audits the stage assignment", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceRow({
          responsible_subject: null,
          commercial_stage: "NOT_STARTED",
        }),
      ])
      .mockResolvedValueOnce([
        workspaceRow({
          responsible_subject: actorSubject,
          commercial_stage: "ASSIGNED",
          version: 2,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        responsible_subject: actorSubject,
      },
    });

    expect(result).toMatchObject({
      kind: "updated",
      workspace: {
        responsible_subject: actorSubject,
        commercial_stage: "ASSIGNED",
      },
    });
    expect(statements()[1]?.values).toEqual([
      organizationId,
      workspaceId,
      actorSubject,
      "ASSIGNED",
      "Ligar para financeiro",
      null,
      null,
      actorSubject,
      1,
    ]);
    expect(statements()[2]?.values[7]).toBe("WORKSPACE_ASSIGNED");
  });

  it("rejects assigning an unassigned workspace to another subject without assign permission", async () => {
    mocks.client.query.mockResolvedValueOnce([
      workspaceRow({
        responsible_subject: null,
        commercial_stage: "NOT_STARTED",
      }),
    ]);

    const result = await updateLeadWorkspace({
      actor: actor({ permissions: ["commercial:write"] }),
      workspaceId,
      request: {
        expected_version: 1,
        responsible_subject: otherSubject,
      },
    });

    expect(result).toEqual({
      kind: "assignment_conflict",
      error: {
        code: "LEAD_WORKSPACE_ASSIGNMENT_CONFLICT",
        httpStatus: 409,
        message:
          "Commercial workspace assignment changed. Refresh before saving.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
    expect(statements()[0]?.text).toMatch(/FOR UPDATE/i);
  });

  it("rejects replacing an existing responsible_subject without assign permission", async () => {
    mocks.client.query.mockResolvedValueOnce([
      workspaceRow({ responsible_subject: "oidc|synthetic-owner" }),
    ]);

    const result = await updateLeadWorkspace({
      actor: actor({ permissions: ["commercial:write"] }),
      workspaceId,
      request: {
        expected_version: 1,
        responsible_subject: otherSubject,
      },
    });

    expect(result).toEqual({
      kind: "assignment_conflict",
      error: {
        code: "LEAD_WORKSPACE_ASSIGNMENT_CONFLICT",
        httpStatus: 409,
        message:
          "Commercial workspace assignment changed. Refresh before saving.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("allows replacing an existing responsible_subject with assign permission", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceRow({ responsible_subject: "oidc|synthetic-owner" }),
      ])
      .mockResolvedValueOnce([
        workspaceRow({
          responsible_subject: otherSubject,
          version: 2,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await updateLeadWorkspace({
      actor: actor({ permissions: ["commercial:assign"] }),
      workspaceId,
      request: {
        expected_version: 1,
        responsible_subject: otherSubject,
      },
    });

    expect(result).toMatchObject({
      kind: "updated",
      workspace: {
        responsible_subject: otherSubject,
        version: 2,
      },
    });
    expect(statements()[2]?.values[7]).toBe("WORKSPACE_ASSIGNED");
  });

  it("applies a valid stage transition and audits it", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow({ commercial_stage: "ASSIGNED" })])
      .mockResolvedValueOnce([
        workspaceRow({ commercial_stage: "CONTACTED", version: 2 }),
      ])
      .mockResolvedValueOnce([]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "CONTACTED",
      },
    });

    expect(result).toMatchObject({
      kind: "updated",
      workspace: { commercial_stage: "CONTACTED" },
    });
    expect(statements()[2]?.values[7]).toBe("STAGE_CHANGED");
    expect(statements()[2]?.values[9]).toMatchObject({
      commercial_stage: "ASSIGNED",
    });
    expect(statements()[2]?.values[10]).toMatchObject({
      commercial_stage: "CONTACTED",
    });
  });

  it("rejects an invalid stage transition without update or audit", async () => {
    mocks.client.query.mockResolvedValueOnce([
      workspaceRow({ commercial_stage: "ASSIGNED" }),
    ]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "FOLLOW_UP",
      },
    });

    expect(result).toMatchObject({
      kind: "invalid_transition",
      error: { reason: "UNLISTED_TRANSITION" },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("does not reopen CLOSED_WON", async () => {
    mocks.client.query.mockResolvedValueOnce([
      workspaceRow({ commercial_stage: "CLOSED_WON" }),
    ]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "CONTACTED",
      },
    });

    expect(result).toMatchObject({
      kind: "invalid_transition",
      error: { reason: "TERMINAL_STAGE" },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("does not treat an explicitly repeated stage as a valid transition", async () => {
    mocks.client.query.mockResolvedValueOnce([
      workspaceRow({ commercial_stage: "ASSIGNED" }),
    ]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "ASSIGNED",
      },
    });

    expect(result).toMatchObject({
      kind: "invalid_transition",
      error: { reason: "SAME_STAGE" },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("accepts null next_action and next_action_due_at", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceRow({
          next_action: "Ligar para financeiro",
          next_action_due_at: new Date(nextActionDueAt),
        }),
      ])
      .mockResolvedValueOnce([
        workspaceRow({
          next_action: null,
          next_action_due_at: null,
          version: 2,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: null,
        next_action_due_at: null,
      },
    });

    expect(result).toMatchObject({
      kind: "updated",
      workspace: {
        next_action: null,
        next_action_due_at: null,
      },
    });
    expect(statements()[1]?.values[4]).toBeNull();
    expect(statements()[1]?.values[5]).toBeNull();
  });

  it("rejects oversized next_action before database work", async () => {
    await expect(
      updateLeadWorkspace({
        actor: actor(),
        workspaceId,
        request: {
          expected_version: 1,
          next_action: "x".repeat(501),
        },
      }),
    ).rejects.toBeInstanceOf(LeadWorkspaceRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("accepts approved commercial_outcome values", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow({ commercial_stage: "CONTACTED" })])
      .mockResolvedValueOnce([
        workspaceRow({
          commercial_stage: "CLOSED_WON",
          commercial_outcome: "WON",
          version: 2,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "CLOSED_WON",
        commercial_outcome: "WON",
      },
    });

    expect(result).toMatchObject({
      kind: "updated",
      workspace: {
        commercial_stage: "CLOSED_WON",
        commercial_outcome: "WON",
      },
    });
    expect(statements()[1]?.values[6]).toBe("WON");
  });

  it("rejects unapproved commercial_outcome values before database work", async () => {
    await expect(
      updateLeadWorkspace({
        actor: actor(),
        workspaceId,
        request: {
          expected_version: 1,
          commercial_outcome: "MAYBE",
        },
      }),
    ).rejects.toBeInstanceOf(LeadWorkspaceRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("fails closed for cross-organization updates", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    const result = await updateLeadWorkspace({
      actor: actor({ organizationId: otherOrganizationId }),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: "Enviar proposta",
      },
    });

    expect(result).toMatchObject({ kind: "not_found" });
    expect(statements()[0]?.values).toEqual([
      otherOrganizationId,
      workspaceId,
    ]);
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("uses only allowlisted audit metadata keys", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow({ commercial_stage: "ASSIGNED" })])
      .mockResolvedValueOnce([
        workspaceRow({ commercial_stage: "CONTACTED", version: 2 }),
      ])
      .mockResolvedValueOnce([]);

    await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        commercial_stage: "CONTACTED",
      },
    });

    const auditValues = statements()[2]?.values;
    const previousMetadata = Object.keys(
      auditValues?.[9] as Record<string, unknown>,
    );
    const newMetadata = Object.keys(
      auditValues?.[10] as Record<string, unknown>,
    );
    const metadata = Object.keys(auditValues?.[11] as Record<string, unknown>);

    expect(previousMetadata).toEqual(
      expect.arrayContaining([
        "commercial_stage",
        "responsible_subject",
        "next_action_present",
        "next_action_due_at",
        "commercial_outcome",
        "version",
        "archived_at",
      ]),
    );
    expect(newMetadata).toEqual(previousMetadata);
    expect(metadata.sort()).toEqual(
      ["field", "from", "source", "to", "workspace_id"].sort(),
    );
    expect(JSON.stringify(auditValues)).not.toMatch(
      /note_body|csv_bytes|raw_csv|report_body|raw_report|payload|secret|sql_params|request_body/i,
    );
  });

  it("records next-action presence without copying free text into audit", async () => {
    const previousText = "AUDIT_PREVIOUS_FREE_TEXT_CANARY";
    const nextText = "AUDIT_NEXT_FREE_TEXT_CANARY";
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceRow({ next_action: previousText }),
      ])
      .mockResolvedValueOnce([
        workspaceRow({ next_action: nextText, version: 2 }),
      ])
      .mockResolvedValueOnce([]);

    await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: nextText,
      },
    });

    const auditValues = statements()[2]?.values;
    expect(auditValues?.[9]).toMatchObject({ next_action_present: true });
    expect(auditValues?.[10]).toMatchObject({ next_action_present: true });
    expect(auditValues?.[11]).toMatchObject({
      field: "next_action",
      from: true,
      to: true,
    });
    expect(JSON.stringify(auditValues)).not.toContain(previousText);
    expect(JSON.stringify(auditValues)).not.toContain(nextText);
  });

  it("propagates audit insert failure after the workspace update statement", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce([
        workspaceRow({ next_action: "Enviar proposta", version: 2 }),
      ])
      .mockRejectedValueOnce(new Error("synthetic audit failure"));

    await expect(
      updateLeadWorkspace({
        actor: actor(),
        workspaceId,
        request: {
          expected_version: 1,
          next_action: "Enviar proposta",
        },
      }),
    ).rejects.toThrow("synthetic audit failure");

    expect(statements()[1]?.text).toMatch(
      /UPDATE prospecting_app\.lead_workspaces/i,
    );
    expect(statements()[2]?.text).toMatch(
      /INSERT INTO prospecting_app\.commercial_audit_events/i,
    );
  });
});

describe("workspace repository boundaries", () => {
  it("uses only the app-owned database client and app-owned schema", () => {
    expect(source()).toContain("../db/app-client");
    expect(source()).toMatch(/prospecting_app\.lead_workspaces/);
    expect(source()).toMatch(/prospecting_app\.commercial_audit_events/);
    expect(source()).not.toMatch(
      /producer-client|PRODUCER_DATABASE_URL|company_validations|company_validation_runs|n8n|webhook|fetch\(/i,
    );
  });

  it("uses parameterized statements without embedding caller-controlled values", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce([
        workspaceRow({ next_action: "Enviar proposta", version: 2 }),
      ])
      .mockResolvedValueOnce([]);

    await updateLeadWorkspace({
      actor: actor(),
      workspaceId,
      request: {
        expected_version: 1,
        next_action: "Enviar proposta",
      },
    });

    for (const statement of statements()) {
      expect(statement).toEqual({
        text: expect.any(String),
        values: expect.any(Array),
      });
      expect(statement.text).not.toContain(organizationId);
      expect(statement.text).not.toContain(workspaceId);
      expect(statement.text).not.toContain("Enviar proposta");
      expect(statement.text).not.toContain(actorSubject);
    }
  });
});
