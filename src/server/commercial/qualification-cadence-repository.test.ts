import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn() },
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

import type { CommercialAuditActorContext } from "../../types/commercial";
import type { AppDatabaseTransaction, SqlStatement } from "../db/app-client";
import {
  QualificationCadenceRepositoryInputError,
  getQualificationCadence,
  recordQualificationContact,
  startQualificationCadence,
} from "./qualification-cadence-repository";

const organizationId = "org-synthetic-cadence";
const otherOrganizationId = "org-synthetic-other";
const workspaceId = "00000000-0000-4000-8000-000000000701";
const actorSubject = "oidc|synthetic-manager";
const actorIssuer = "https://identity.synthetic.test/tenant";
const requestCorrelationId = "00000000-0000-4000-8000-000000000702";
const leadRunId = `lr_${"a".repeat(64)}`;

function actor(
  overrides: Partial<CommercialAuditActorContext> = {},
): CommercialAuditActorContext {
  return {
    organizationId: overrides.organizationId ?? organizationId,
    actorSubject: overrides.actorSubject ?? actorSubject,
    actorIssuer: overrides.actorIssuer ?? actorIssuer,
    requestCorrelationId:
      overrides.requestCorrelationId ?? requestCorrelationId,
    authorizationBasis: overrides.authorizationBasis ?? "verified_oidc",
  };
}

function workspaceRow(
  overrides: Partial<{
    commercial_stage:
      | "NOT_STARTED"
      | "ASSIGNED"
      | "CONTACTED"
      | "FOLLOW_UP"
      | "MEETING"
      | "PAUSED"
      | "CLOSED_WON"
      | "CLOSED_LOST";
    commercial_outcome: "WON" | "LOST" | "NO_RESPONSE" | "NOT_NOW" | "DISQUALIFIED" | null;
    next_action: string | null;
    next_action_due_at: string | null;
  }> = {},
) {
  return {
    workspace_id: workspaceId,
    organization_id: organizationId,
    observed_lead_run_id: leadRunId,
    responsible_subject: actorSubject,
    commercial_stage: overrides.commercial_stage ?? "ASSIGNED",
    next_action: overrides.next_action ?? null,
    next_action_due_at: overrides.next_action_due_at ?? null,
    commercial_outcome: overrides.commercial_outcome ?? null,
    version: 1,
  };
}

function contactRow(
  contactNumber: 1 | 2 | 3 | 4,
  overrides: Partial<{
    state: "PENDING" | "COMPLETED" | "CANCELLED";
    outcome:
      | "NO_RESPONSE"
      | "RESPONDED"
      | "FOLLOW_UP_LATER"
      | "QUALIFIED"
      | "NOT_INTERESTED"
      | "WRONG_CONTACT"
      | "OTHER_RESPONSE"
      | null;
    channel: "CALL" | "EMAIL" | "WHATSAPP" | "OTHER" | null;
    summary: string | null;
    completed_at: Date | string | null;
    scheduled_at: Date | string;
  }> = {},
) {
  const state = overrides.state ?? "PENDING";

  return {
    qualification_contact_id: `00000000-0000-4000-8000-00000000071${contactNumber}`,
    contact_number: contactNumber,
    scheduled_at:
      overrides.scheduled_at ??
      new Date(`2026-08-${String(10 + contactNumber).padStart(2, "0")}T12:00:00.000Z`),
    state,
    outcome:
      overrides.outcome === undefined
        ? state === "COMPLETED"
          ? "NO_RESPONSE"
          : null
        : overrides.outcome,
    channel:
      overrides.channel === undefined
        ? state === "COMPLETED"
          ? "WHATSAPP"
          : null
        : overrides.channel,
    summary: overrides.summary === undefined ? null : overrides.summary,
    completed_at:
      overrides.completed_at === undefined
        ? state === "COMPLETED"
          ? new Date("2026-08-11T15:00:00.000Z")
          : null
        : overrides.completed_at,
  };
}

function pendingContacts() {
  return [contactRow(1), contactRow(2), contactRow(3), contactRow(4)];
}

function statements(): readonly SqlStatement[] {
  return mocks.client.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function readStatements(): readonly SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function installTransactionMock(): void {
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
}

function source(): string {
  return readFileSync(
    resolve(
      process.cwd(),
      "src/server/commercial/qualification-cadence-repository.ts",
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

describe("getQualificationCadence", () => {
  it("returns NOT_STARTED for an existing workspace without cadence rows", async () => {
    mocks.query.mockResolvedValueOnce([workspaceRow()]).mockResolvedValueOnce([]);

    await expect(
      getQualificationCadence({
        actor: { organizationId },
        workspaceId,
      }),
    ).resolves.toEqual({
      kind: "found",
      cadence: {
        status: "NOT_STARTED",
        current_contact_number: null,
        contacts: [],
      },
    });
    expect(readStatements()[0]?.values).toEqual([organizationId, workspaceId]);
    expect(readStatements()[1]?.values).toEqual([organizationId, workspaceId]);
  });

  it("maps exactly four ordered contacts and derives the current step", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce([
        contactRow(1, { state: "COMPLETED", outcome: "RESPONDED" }),
        contactRow(2),
        contactRow(3),
        contactRow(4),
      ]);

    const result = await getQualificationCadence({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toMatchObject({
      kind: "found",
      cadence: {
        status: "ACTIVE",
        current_contact_number: 2,
        contacts: [
          { contact_number: 1, state: "COMPLETED", outcome: "RESPONDED" },
          { contact_number: 2, state: "PENDING" },
          { contact_number: 3, state: "PENDING" },
          { contact_number: 4, state: "PENDING" },
        ],
      },
    });
  });

  it("fails closed for a cross-organization workspace", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await getQualificationCadence({
      actor: { organizationId: otherOrganizationId },
      workspaceId,
    });

    expect(result).toMatchObject({ kind: "not_found" });
    expect(readStatements()[0]?.values).toEqual([
      otherOrganizationId,
      workspaceId,
    ]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});

describe("startQualificationCadence", () => {
  it("creates four evenly spaced contacts plus one audited task", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(pendingContacts());

    const result = await startQualificationCadence({
      actor: actor(),
      workspaceId,
      request: {
        action: "start",
        start_at: "2026-08-11T12:00:00Z",
        interval_days: 3,
      },
    });

    expect(result).toMatchObject({
      kind: "started",
      cadence: { status: "ACTIVE", current_contact_number: 1 },
    });
    expect(statements()[0]?.text).toMatch(/FOR UPDATE/i);
    expect(statements()[2]?.text).toMatch(
      /INSERT INTO prospecting_app\.lead_qualification_contacts/i,
    );
    expect(statements()[2]?.values).toEqual(
      expect.arrayContaining([
        "2026-08-11T12:00:00.000Z",
        "2026-08-14T12:00:00.000Z",
        "2026-08-17T12:00:00.000Z",
        "2026-08-20T12:00:00.000Z",
      ]),
    );
    expect(statements()[3]?.text).toMatch(
      /INSERT INTO prospecting_app\.lead_activities/i,
    );
    expect(statements()[3]?.values).toEqual(
      expect.arrayContaining([
        "TASK",
        "Cadência de qualificação iniciada",
      ]),
    );
    expect(statements()[4]?.text).toMatch(
      /INSERT INTO prospecting_app\.commercial_audit_events/i,
    );
  });

  it("returns a conflict without writes when a cadence already exists", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce(pendingContacts());

    const result = await startQualificationCadence({
      actor: actor(),
      workspaceId,
      request: {
        action: "start",
        start_at: "2026-08-11T12:00:00Z",
        interval_days: 3,
      },
    });

    expect(result).toMatchObject({ kind: "conflict" });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });
});

describe("recordQualificationContact", () => {
  it("records no response and advances to the next contact", async () => {
    const after = [
      contactRow(1, { state: "COMPLETED", outcome: "NO_RESPONSE" }),
      contactRow(2),
      contactRow(3),
      contactRow(4),
    ];
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce(pendingContacts())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(after);

    const result = await recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 1,
        occurred_at: "2026-08-11T15:00:00Z",
        channel: "WHATSAPP",
        outcome: "NO_RESPONSE",
        summary: "Mensagem enviada sem retorno.",
      },
    });

    expect(result).toMatchObject({
      kind: "recorded",
      cadence: { status: "ACTIVE", current_contact_number: 2 },
      pipelineAction: {
        kind: "automatic",
        reasonCode: "QUALIFICATION_NO_RESPONSE_FOLLOW_UP",
        changes: {
          commercialStage: "FOLLOW_UP",
          nextAction: "Realizar o 2º contato de qualificação",
          nextActionDueAt: "2026-08-12T12:00:00.000Z",
        },
      },
    });
    expect(statements()[2]?.text).toMatch(/INSERT INTO prospecting_app\.lead_activities/i);
    expect(statements()[3]?.text).toMatch(/UPDATE prospecting_app\.lead_qualification_contacts/i);
    expect(statements()[4]?.values).not.toContain("Mensagem enviada sem retorno.");
    expect(
      statements().find((statement) =>
        /UPDATE prospecting_app\.lead_workspaces/i.test(statement.text),
      )?.values,
    ).toEqual(
      expect.arrayContaining([
        "FOLLOW_UP",
        "Realizar o 2º contato de qualificação",
        "2026-08-12T12:00:00.000Z",
      ]),
    );
    const workspaceAudit = statements().find(
      (statement) =>
        /INSERT INTO prospecting_app\.commercial_audit_events/i.test(
          statement.text,
        ) &&
        statement.values.some(
          (value) =>
            typeof value === "object" &&
            value !== null &&
            "reason_code" in value &&
            value.reason_code ===
              "QUALIFICATION_NO_RESPONSE_FOLLOW_UP",
        ),
    );
    expect(workspaceAudit).toBeDefined();
    expect(JSON.stringify(workspaceAudit?.values)).not.toContain(
      "Mensagem enviada sem retorno.",
    );
  });

  it("reschedules only the next contact when the lead asks to talk later", async () => {
    const initial = [
      contactRow(1, { state: "COMPLETED" }),
      contactRow(2),
      contactRow(3),
      contactRow(4),
    ];
    const after = [
      initial[0],
      contactRow(2, { state: "COMPLETED", outcome: "FOLLOW_UP_LATER" }),
      contactRow(3, { scheduled_at: "2026-08-28T12:00:00Z" }),
      initial[3],
    ];
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(after);

    const result = await recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 2,
        occurred_at: "2026-08-14T15:00:00Z",
        channel: "CALL",
        outcome: "FOLLOW_UP_LATER",
        next_contact_at: "2026-08-28T12:00:00Z",
      },
    });

    expect(result).toMatchObject({
      kind: "recorded",
      cadence: { current_contact_number: 3 },
    });
    expect(statements()[4]?.text).toMatch(/SET scheduled_at = \$4/i);
    expect(statements()[4]?.values).toEqual([
      organizationId,
      workspaceId,
      3,
      "2026-08-28T12:00:00Z",
      actorSubject,
    ]);
  });

  it.each(["QUALIFIED", "NOT_INTERESTED", "WRONG_CONTACT"] as const)(
    "cancels remaining contacts after terminal outcome %s",
    async (outcome) => {
      const after = [
        contactRow(1, { state: "COMPLETED", outcome }),
        contactRow(2, { state: "CANCELLED" }),
        contactRow(3, { state: "CANCELLED" }),
        contactRow(4, { state: "CANCELLED" }),
      ];
      mocks.client.query
        .mockResolvedValueOnce([workspaceRow()])
        .mockResolvedValueOnce(pendingContacts())
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(after);

      const result = await recordQualificationContact({
        actor: actor(),
        workspaceId,
        request: {
          action: "record_contact",
          contact_number: 1,
          occurred_at: "2026-08-11T15:00:00Z",
          channel: "CALL",
          outcome,
        },
      });

      expect(result).toMatchObject({
        kind: "recorded",
        cadence: {
          status: outcome === "QUALIFIED" ? "QUALIFIED" : "STOPPED",
          current_contact_number: null,
        },
      });
      expect(statements()[4]?.text).toMatch(/SET state = 'CANCELLED'/i);
    },
  );

  it("marks the sequence exhausted after the fourth contact", async () => {
    const initial = [
      contactRow(1, { state: "COMPLETED" }),
      contactRow(2, { state: "COMPLETED" }),
      contactRow(3, { state: "COMPLETED" }),
      contactRow(4),
    ];
    const after = [
      initial[0],
      initial[1],
      initial[2],
      contactRow(4, { state: "COMPLETED", outcome: "RESPONDED" }),
    ];
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(after);

    const result = await recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 4,
        occurred_at: "2026-08-20T15:00:00Z",
        channel: "EMAIL",
        outcome: "RESPONDED",
      },
    });

    expect(result).toMatchObject({
      kind: "recorded",
      cadence: { status: "EXHAUSTED", current_contact_number: null },
      pipelineAction: {
        kind: "recommendation",
        reasonCode: "QUALIFICATION_RESPONSE_REVIEW",
        changes: {
          nextAction: "Revisar a resposta e confirmar a próxima etapa",
          nextActionDueAt: null,
        },
      },
    });
  });

  it("preserves a terminal workspace instead of reopening it", async () => {
    const after = [
      contactRow(1, { state: "COMPLETED", outcome: "QUALIFIED" }),
      contactRow(2, { state: "CANCELLED" }),
      contactRow(3, { state: "CANCELLED" }),
      contactRow(4, { state: "CANCELLED" }),
    ];
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceRow({
          commercial_stage: "CLOSED_WON",
          commercial_outcome: "WON",
        }),
      ])
      .mockResolvedValueOnce(pendingContacts())
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(after);

    const result = await recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 1,
        occurred_at: "2026-08-11T15:00:00Z",
        channel: "CALL",
        outcome: "QUALIFIED",
      },
    });

    expect(result).toMatchObject({
      kind: "recorded",
      pipelineAction: {
        kind: "unchanged",
        reasonCode: "TERMINAL_WORKSPACE_PRESERVED",
        changes: {},
      },
    });
    expect(
      statements().some((statement) =>
        /UPDATE prospecting_app\.lead_workspaces/i.test(statement.text),
      ),
    ).toBe(false);
  });

  it("rejects an out-of-order contact without appending activity", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce(pendingContacts());

    const result = await recordQualificationContact({
      actor: actor(),
      workspaceId,
      request: {
        action: "record_contact",
        contact_number: 2,
        occurred_at: "2026-08-11T15:00:00Z",
        channel: "CALL",
        outcome: "RESPONDED",
      },
    });

    expect(result).toMatchObject({ kind: "conflict" });
    expect(mocks.client.query).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid commands before database work", async () => {
    await expect(
      recordQualificationContact({
        actor: actor(),
        workspaceId,
        request: {
          action: "record_contact",
          contact_number: 4,
          occurred_at: "2026-08-20T15:00:00Z",
          channel: "CALL",
          outcome: "FOLLOW_UP_LATER",
          next_contact_at: "2026-08-25T12:00:00Z",
        },
      }),
    ).rejects.toBeInstanceOf(QualificationCadenceRepositoryInputError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("qualification cadence repository boundaries", () => {
  it("uses only app-owned relations and has no send, provider or producer path", () => {
    expect(source()).toContain("../db/app-client");
    expect(source()).toMatch(/prospecting_app\.lead_qualification_contacts/);
    expect(source()).toMatch(/prospecting_app\.lead_activities/);
    expect(source()).toMatch(/prospecting_app\.commercial_audit_events/);
    expect(source()).not.toMatch(
      /producer-client|PRODUCER_DATABASE_URL|n8n|webhook|openai|sendMessage|fetch\(/i,
    );
  });

  it("uses parameterized statements for every caller-controlled value", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(pendingContacts());

    await startQualificationCadence({
      actor: actor(),
      workspaceId,
      request: {
        action: "start",
        start_at: "2026-08-11T12:00:00Z",
        interval_days: 3,
      },
    });

    for (const statement of statements()) {
      expect(statement).toEqual({
        text: expect.any(String),
        values: expect.any(Array),
      });
      expect(statement.text).not.toContain(organizationId);
      expect(statement.text).not.toContain(workspaceId);
      expect(statement.text).not.toContain(actorSubject);
    }
  });
});
