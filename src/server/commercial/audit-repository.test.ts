import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/app-client", () => ({
  query: mocks.query,
}));

import type { SqlStatement } from "../db/app-client";
import {
  CommercialAuditRepositoryInputError,
  listCommercialAuditEvents,
} from "./audit-repository";

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const workspaceId = "00000000-0000-4000-8000-000000000032";
const auditEventId = "00000000-0000-4000-8000-000000000132";
const otherAuditEventId = "00000000-0000-4000-8000-000000000133";
const targetId = "00000000-0000-4000-8000-000000000232";
const activityId = "00000000-0000-4000-8000-000000000332";
const noteId = "00000000-0000-4000-8000-000000000432";
const importSubmissionId = "00000000-0000-4000-8000-000000000532";
const leadRunId = `lr_${"a".repeat(64)}`;
const occurredAt = new Date("2026-07-09T12:00:00.000Z");

function workspaceReferenceRow(
  overrides: Partial<{
    workspace_id: string;
    organization_id: string;
  }> = {},
) {
  return {
    workspace_id: overrides.workspace_id ?? workspaceId,
    organization_id: overrides.organization_id ?? organizationId,
  };
}

function auditEventRow(
  overrides: Partial<{
    audit_event_id: string;
    organization_id: string;
    workspace_id: string | null;
    actor_subject: string;
    action: string;
    target_type: string;
    target_id: string;
    observed_lead_run_id: string | null;
    previous_metadata: unknown;
    new_metadata: unknown;
    metadata: unknown;
    occurred_at: Date | string;
  }> = {},
) {
  return {
    audit_event_id: overrides.audit_event_id ?? auditEventId,
    organization_id: overrides.organization_id ?? organizationId,
    workspace_id: Object.hasOwn(overrides, "workspace_id")
      ? (overrides.workspace_id ?? null)
      : workspaceId,
    actor_subject: overrides.actor_subject ?? actorSubject,
    action: overrides.action ?? "STAGE_CHANGED",
    target_type: overrides.target_type ?? "lead_workspace",
    target_id: overrides.target_id ?? targetId,
    observed_lead_run_id: Object.hasOwn(overrides, "observed_lead_run_id")
      ? (overrides.observed_lead_run_id ?? null)
      : leadRunId,
    previous_metadata:
      overrides.previous_metadata ??
      {
        commercial_stage: "ASSIGNED",
        responsible_subject: actorSubject,
        next_action: "Ligar para financeiro",
        next_action_due_at: "2026-07-10T12:00:00.000Z",
        commercial_outcome: null,
        version: 1,
        archived_at: null,
      },
    new_metadata:
      overrides.new_metadata ??
      {
        commercial_stage: "CONTACTED",
        responsible_subject: actorSubject,
        next_action: "Enviar proposta",
        next_action_due_at: "2026-07-11T12:00:00.000Z",
        commercial_outcome: "NO_RESPONSE",
        version: 2,
        archived_at: null,
      },
    metadata:
      overrides.metadata ??
      {
        source: "app",
        field: "commercial_stage",
        from: "ASSIGNED",
        to: "CONTACTED",
        workspace_id: workspaceId,
      },
    occurred_at: overrides.occurred_at ?? occurredAt,
  };
}

function readStatements(): SqlStatement[] {
  return mocks.query.mock.calls.map((call) => call[0] as SqlStatement);
}

function source(): string {
  return readFileSync(
    resolve(process.cwd(), "src/server/commercial/audit-repository.ts"),
    "utf8",
  );
}

beforeEach(() => {
  mocks.query.mockReset();
});

describe("listCommercialAuditEvents", () => {
  it("returns an empty paginated list for an existing workspace", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toEqual({
      kind: "listed",
      auditEvents: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it("fails closed when the workspace does not exist", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toEqual({
      kind: "not_found",
      error: {
        code: "LEAD_WORKSPACE_NOT_FOUND",
        httpStatus: 404,
        message: "Commercial workspace was not found.",
      },
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("fails closed for cross-organization workspaces", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await listCommercialAuditEvents({
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

  it("scopes list reads by organization_id and workspace_id", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([auditEventRow()]);

    await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    expect(readStatements()[0]?.values).toEqual([
      organizationId,
      workspaceId,
    ]);
    expect(readStatements()[1]?.values).toEqual([
      organizationId,
      workspaceId,
    ]);
    expect(readStatements()[2]?.values.slice(0, 2)).toEqual([
      organizationId,
      workspaceId,
    ]);
  });

  it("applies page, pageSize, limit, and offset server-side", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 12 }])
      .mockResolvedValueOnce([]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
      page: 3,
      pageSize: 7,
    });

    expect(result).toMatchObject({
      kind: "listed",
      page: 3,
      pageSize: 7,
      total: 12,
    });
    expect(readStatements()[2]?.text).toMatch(/LIMIT \$3/i);
    expect(readStatements()[2]?.text).toMatch(/OFFSET \$4/i);
    expect(readStatements()[2]?.values).toEqual([
      organizationId,
      workspaceId,
      7,
      14,
    ]);
  });

  it("caps pageSize at the server-side maximum", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
      pageSize: 500,
    });

    expect(result).toMatchObject({
      kind: "listed",
      pageSize: 100,
    });
    expect(readStatements()[2]?.values[2]).toBe(100);
  });

  it("orders audit events by occurred_at descending and audit_event_id", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        auditEventRow({
          audit_event_id: otherAuditEventId,
          occurred_at: new Date("2026-07-10T12:00:00.000Z"),
        }),
        auditEventRow({
          audit_event_id: auditEventId,
          occurred_at: new Date("2026-07-09T12:00:00.000Z"),
        }),
      ]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    expect(readStatements()[2]?.text).toMatch(
      /ORDER BY occurred_at DESC, audit_event_id/i,
    );
    expect(result).toMatchObject({
      kind: "listed",
      auditEvents: [
        {
          audit_event_id: otherAuditEventId,
          occurred_at: "2026-07-10T12:00:00.000Z",
        },
        {
          audit_event_id: auditEventId,
          occurred_at: "2026-07-09T12:00:00.000Z",
        },
      ],
    });
  });

  it.each([
    ["invalid organization", { actor: { organizationId: "" }, workspaceId }],
    ["invalid workspace id", { actor: { organizationId }, workspaceId: "bad" }],
    ["invalid page", { actor: { organizationId }, workspaceId, page: 0 }],
    [
      "invalid pageSize",
      { actor: { organizationId }, workspaceId, pageSize: 0 },
    ],
  ])("rejects %s before database work", async (_label, input) => {
    await expect(listCommercialAuditEvents(input)).rejects.toBeInstanceOf(
      CommercialAuditRepositoryInputError,
    );

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("maps rows to CommercialAuditEventDto with ISO timestamps", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        auditEventRow({
          action: "NEXT_ACTION_CHANGED",
          target_type: "lead_workspace",
          occurred_at: occurredAt,
        }),
      ]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toEqual({
      kind: "listed",
      auditEvents: [
        {
          audit_event_id: auditEventId,
          organization_id: organizationId,
          workspace_id: workspaceId,
          actor_subject: actorSubject,
          action: "NEXT_ACTION_CHANGED",
          target_type: "lead_workspace",
          target_id: targetId,
          observed_lead_run_id: leadRunId,
          previous_metadata: {
            commercial_stage: "ASSIGNED",
            responsible_subject: actorSubject,
            next_action_present: true,
            next_action_due_at: "2026-07-10T12:00:00.000Z",
            commercial_outcome: null,
            version: 1,
            archived_at: null,
          },
          new_metadata: {
            commercial_stage: "CONTACTED",
            responsible_subject: actorSubject,
            next_action_present: true,
            next_action_due_at: "2026-07-11T12:00:00.000Z",
            commercial_outcome: "NO_RESPONSE",
            version: 2,
            archived_at: null,
          },
          metadata: {
            source: "app",
            field: "commercial_stage",
            from: "ASSIGNED",
            to: "CONTACTED",
            workspace_id: workspaceId,
          },
          occurred_at: occurredAt.toISOString(),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it("discards unknown metadata keys in the mapper", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        auditEventRow({
          metadata: {
            source: "app",
            field: "next_action",
            from: "Ligar",
            to: "Enviar proposta",
            workspace_id: workspaceId,
            request_body: { next_action: "Synthetic raw request" },
            csv: "Synthetic CSV bytes",
            payload: { raw: true },
          },
        }),
      ]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });
    const metadata =
      result.kind === "listed" ? result.auditEvents[0]?.metadata : {};

    expect(metadata).toEqual({
      source: "app",
      field: "next_action",
      workspace_id: workspaceId,
    });
  });

  it("discards unknown previous_metadata and new_metadata keys in the mapper", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        auditEventRow({
          previous_metadata: {
            commercial_stage: "ASSIGNED",
            body: "Synthetic confidential note body",
            request_body: { commercial_stage: "CONTACTED" },
            version: "2",
            status: "request_body",
          },
          new_metadata: {
            commercial_stage: "CONTACTED",
            responsible_subject: actorSubject,
            raw_csv: "Synthetic CSV bytes",
            report: "Synthetic report body",
          },
        }),
      ]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });
    const event = result.kind === "listed" ? result.auditEvents[0] : undefined;

    expect(event?.previous_metadata).toEqual({
      commercial_stage: "ASSIGNED",
    });
    expect(event?.new_metadata).toEqual({
      commercial_stage: "CONTACTED",
      responsible_subject: actorSubject,
    });
  });

  it("withholds legacy next-action text and exposes only its presence", async () => {
    const legacyText = "AUDIT_LEGACY_FREE_TEXT_CANARY";
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        auditEventRow({
          previous_metadata: {
            next_action: legacyText,
            next_action_present: true,
          },
          new_metadata: {
            next_action: legacyText,
            next_action_present: false,
          },
          metadata: {
            field: "next_action",
            from: legacyText,
            to: legacyText,
          },
        }),
      ]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });
    const event = result.kind === "listed" ? result.auditEvents[0] : undefined;
    const serialized = JSON.stringify(event);

    expect(event?.previous_metadata).toEqual({ next_action_present: true });
    expect(event?.new_metadata).toEqual({ next_action_present: false });
    expect(event?.metadata).toEqual({ field: "next_action" });
    expect(serialized).not.toContain(legacyText);
  });

  it("returns only allowlisted metadata keys", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        auditEventRow({
          metadata: {
            source: "app",
            field: "next_action",
            from: false,
            to: true,
            reason_code: "WORKSPACE_UPDATED",
            workspace_id: workspaceId,
            activity_id: activityId,
            note_id: noteId,
            import_submission_id: importSubmissionId,
            activity_type: "CALL",
            activity_outcome: null,
            sql_params: ["$1", "$2"],
          },
        }),
      ]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });
    const metadata =
      result.kind === "listed" ? result.auditEvents[0]?.metadata : {};

    expect(Object.keys(metadata ?? {}).sort()).toEqual(
      [
        "activity_id",
        "activity_outcome",
        "activity_type",
        "field",
        "from",
        "import_submission_id",
        "note_id",
        "reason_code",
        "source",
        "to",
        "workspace_id",
      ].sort(),
    );
  });

  it("does not return note bodies, raw request bodies, or prohibited operational metadata", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        auditEventRow({
          metadata: {
            source: "request_body",
            field: "body",
            from: "Synthetic confidential note body",
            to: "Synthetic raw request body",
            workspace_id: workspaceId,
            note_id: noteId,
            body: "Synthetic confidential note body",
            request_body: { body: "Synthetic raw request body" },
            raw_csv: "Synthetic CSV bytes",
            report: "Synthetic report body",
            payload: { raw: true },
            secret: "synthetic-secret",
            sql_params: ["$1"],
          },
        }),
      ]);

    const result = await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });
    const metadata =
      result.kind === "listed" ? result.auditEvents[0]?.metadata : {};

    expect(metadata).toEqual({
      workspace_id: workspaceId,
      note_id: noteId,
    });
    expect(JSON.stringify(metadata)).not.toMatch(
      /body|request_body|raw_csv|csv|contact|report|payload|secret|sql_params/i,
    );
  });
});

describe("commercial audit repository boundaries", () => {
  it("uses only the app-owned database client and app-owned schema", () => {
    expect(source()).toContain("../db/app-client");
    expect(source()).toMatch(/prospecting_app\.lead_workspaces/);
    expect(source()).toMatch(/prospecting_app\.commercial_audit_events/);
    expect(source()).not.toMatch(
      /producer|n8n|webhook|fetch\(|company_validations|company_validation_runs/i,
    );
  });

  it("does not expose append, update, or delete operations for commercial_audit_events", () => {
    expect(source()).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE)\b[\s\S]*prospecting_app\.commercial_audit_events/i,
    );
    expect(source()).not.toMatch(
      /prospecting_app\.commercial_audit_events[\s\S]*\b(?:INSERT|UPDATE|DELETE)\b/i,
    );
    expect(source()).not.toMatch(
      /appendCommercialAuditEvent|createCommercialAuditEvent|updateCommercialAuditEvent|deleteCommercialAuditEvent/i,
    );
  });

  it("uses parameterized statements without embedding caller-controlled values", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([auditEventRow()]);

    await listCommercialAuditEvents({
      actor: { organizationId },
      workspaceId,
    });

    for (const statement of readStatements()) {
      expect(statement).toEqual({
        text: expect.any(String),
        values: expect.any(Array),
      });
      expect(statement.text).not.toContain(organizationId);
      expect(statement.text).not.toContain(workspaceId);
    }
  });
});
