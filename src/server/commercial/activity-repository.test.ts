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

import type { CommercialAuditActorContext } from "../../types/commercial";
import type { AppDatabaseTransaction, SqlStatement } from "../db/app-client";
import {
  LeadActivityRepositoryInputError,
  appendLeadActivity,
  listLeadActivities,
} from "./activity-repository";

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const actorIssuer = "https://identity.synthetic.test/tenant";
const requestCorrelationId = "00000000-0000-4000-8000-000000000830";
const otherSubject = "oidc|synthetic-seller";
const workspaceId = "00000000-0000-4000-8000-000000000030";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000031";
const activityId = "00000000-0000-4000-8000-000000000130";
const otherActivityId = "00000000-0000-4000-8000-000000000131";
const leadRunId = `lr_${"a".repeat(64)}`;
const observedLeadRunIdFromWorkspace = `lr_${"b".repeat(64)}`;
const occurredAt = "2026-07-09T12:00:00Z";
const occurredAtIso = "2026-07-09T12:00:00.000Z";
const createdAt = new Date("2026-07-09T12:01:00.000Z");

function installTransactionMock(): void {
  mocks.transaction.mockImplementation(
    async (callback: (client: AppDatabaseTransaction) => Promise<unknown>) =>
      callback(mocks.client as AppDatabaseTransaction),
  );
}

function actor(
  overrides: Partial<CommercialAuditActorContext> = {},
): CommercialAuditActorContext {
  return {
    organizationId: overrides.organizationId ?? organizationId,
    actorSubject: overrides.actorSubject ?? actorSubject,
    actorIssuer: overrides.actorIssuer ?? actorIssuer,
    requestCorrelationId:
      overrides.requestCorrelationId ?? requestCorrelationId,
    authorizationBasis:
      overrides.authorizationBasis ?? "verified_oidc",
  };
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    occurred_at: occurredAt,
    activity_type: "CALL",
    ...overrides,
  };
}

function workspaceReferenceRow(
  overrides: Partial<{
    workspace_id: string;
    organization_id: string;
    observed_lead_run_id: string;
  }> = {},
) {
  return {
    workspace_id: overrides.workspace_id ?? workspaceId,
    organization_id: overrides.organization_id ?? organizationId,
    observed_lead_run_id:
      overrides.observed_lead_run_id ?? observedLeadRunIdFromWorkspace,
  };
}

function activityRow(
  overrides: Partial<{
    activity_id: string;
    organization_id: string;
    workspace_id: string;
    observed_lead_run_id: string;
    actor_subject: string;
    occurred_at: Date | string;
    activity_type: "CALL" | "EMAIL" | "WHATSAPP" | "MEETING" | "TASK" | "OTHER";
    activity_outcome: string | null;
    summary: string | null;
    created_at: Date | string;
  }> = {},
) {
  return {
    activity_id: overrides.activity_id ?? activityId,
    organization_id: overrides.organization_id ?? organizationId,
    workspace_id: overrides.workspace_id ?? workspaceId,
    observed_lead_run_id:
      overrides.observed_lead_run_id ?? observedLeadRunIdFromWorkspace,
    actor_subject: overrides.actor_subject ?? actorSubject,
    occurred_at: overrides.occurred_at ?? new Date(occurredAtIso),
    activity_type: overrides.activity_type ?? "CALL",
    activity_outcome: Object.hasOwn(overrides, "activity_outcome")
      ? (overrides.activity_outcome ?? null)
      : null,
    summary: Object.hasOwn(overrides, "summary")
      ? (overrides.summary ?? null)
      : null,
    created_at: overrides.created_at ?? createdAt,
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
      "src/server/commercial/activity-repository.ts",
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

describe("appendLeadActivity", () => {
  it("appends an activity with organization and actor from context", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([
        activityRow({
          activity_outcome: "Positive contact",
          summary: "Synthetic activity summary",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest({
        activity_outcome: "Positive contact",
        summary: "Synthetic activity summary",
      }),
    });

    expect(result).toEqual({
      kind: "appended",
      activity: {
        activity_id: activityId,
        organization_id: organizationId,
        workspace_id: workspaceId,
        observed_lead_run_id: observedLeadRunIdFromWorkspace,
        actor_subject: actorSubject,
        occurred_at: occurredAtIso,
        activity_type: "CALL",
        activity_outcome: "Positive contact",
        summary: "Synthetic activity summary",
        created_at: createdAt.toISOString(),
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(statements()[0]?.text).toMatch(
      /FROM prospecting_app\.lead_workspaces/i,
    );
    expect(statements()[0]?.text).toMatch(/FOR UPDATE/i);
    expect(statements()[1]?.text).toMatch(
      /INSERT INTO prospecting_app\.lead_activities/i,
    );
    expect(statements()[2]?.text).toMatch(
      /INSERT INTO prospecting_app\.commercial_audit_events/i,
    );
    expect(statements()[1]?.values).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      organizationId,
      workspaceId,
      observedLeadRunIdFromWorkspace,
      actorSubject,
      occurredAt,
      "CALL",
      "Positive contact",
      "Synthetic activity summary",
    ]);
  });

  it("rejects body-controlled organization and actor fields before database work", async () => {
    await expect(
      appendLeadActivity({
        actor: actor(),
        workspaceId,
        request: createRequest({
          organization_id: otherOrganizationId,
          actor_subject: otherSubject,
        }),
      }),
    ).rejects.toBeInstanceOf(LeadActivityRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects body-controlled workspace internals before database work", async () => {
    await expect(
      appendLeadActivity({
        actor: actor(),
        workspaceId,
        request: createRequest({
          workspace_id: otherWorkspaceId,
          observed_lead_run_id: leadRunId,
        }),
      }),
    ).rejects.toBeInstanceOf(LeadActivityRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("fails closed when the workspace does not exist", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    const result = await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest(),
    });

    expect(result).toEqual({
      kind: "not_found",
      error: {
        code: "LEAD_WORKSPACE_NOT_FOUND",
        httpStatus: 404,
        message: "Commercial workspace was not found.",
      },
    });
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("fails closed for cross-organization workspaces", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    const result = await appendLeadActivity({
      actor: actor({ organizationId: otherOrganizationId }),
      workspaceId,
      request: createRequest(),
    });

    expect(result).toMatchObject({ kind: "not_found" });
    expect(statements()[0]?.values).toEqual([
      otherOrganizationId,
      workspaceId,
    ]);
    expect(mocks.client.query).toHaveBeenCalledTimes(1);
  });

  it("copies observed_lead_run_id from the current workspace", async () => {
    mocks.client.query
      .mockResolvedValueOnce([
        workspaceReferenceRow({
          observed_lead_run_id: observedLeadRunIdFromWorkspace,
        }),
      ])
      .mockResolvedValueOnce([
        activityRow({
          observed_lead_run_id: observedLeadRunIdFromWorkspace,
        }),
      ])
      .mockResolvedValueOnce([]);

    await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest(),
    });

    expect(statements()[1]?.values[3]).toBe(observedLeadRunIdFromWorkspace);
    expect(statements()[2]?.values[8]).toBe(observedLeadRunIdFromWorkspace);
  });

  it("rejects invalid occurred_at before database work", async () => {
    await expect(
      appendLeadActivity({
        actor: actor(),
        workspaceId,
        request: createRequest({ occurred_at: "2026-07-09" }),
      }),
    ).rejects.toBeInstanceOf(LeadActivityRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid activity_type before database work", async () => {
    await expect(
      appendLeadActivity({
        actor: actor(),
        workspaceId,
        request: createRequest({ activity_type: "SMS" }),
      }),
    ).rejects.toBeInstanceOf(LeadActivityRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("accepts null activity_outcome", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([activityRow({ activity_outcome: null })])
      .mockResolvedValueOnce([]);

    const result = await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest({ activity_outcome: null }),
    });

    expect(result).toMatchObject({
      kind: "appended",
      activity: { activity_outcome: null },
    });
    expect(statements()[1]?.values[7]).toBeNull();
    expect(statements()[2]?.values[11]).toMatchObject({
      activity_outcome: null,
    });
  });

  it.each(["", " trimmed ", "x".repeat(121)])(
    "rejects invalid activity_outcome %s before database work",
    async (activityOutcome) => {
      await expect(
        appendLeadActivity({
          actor: actor(),
          workspaceId,
          request: createRequest({ activity_outcome: activityOutcome }),
        }),
      ).rejects.toBeInstanceOf(LeadActivityRepositoryInputError);

      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("accepts null summary", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([activityRow({ summary: null })])
      .mockResolvedValueOnce([]);

    const result = await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest({ summary: null }),
    });

    expect(result).toMatchObject({
      kind: "appended",
      activity: { summary: null },
    });
    expect(statements()[1]?.values[8]).toBeNull();
  });

  it("rejects summary above 1000 Unicode code points before database work", async () => {
    await expect(
      appendLeadActivity({
        actor: actor(),
        workspaceId,
        request: createRequest({ summary: "🙂".repeat(1001) }),
      }),
    ).rejects.toBeInstanceOf(LeadActivityRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates an ACTIVITY_APPENDED audit event in the same transaction", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([
        activityRow({
          activity_type: "EMAIL",
          activity_outcome: "No response",
        }),
      ])
      .mockResolvedValueOnce([]);

    await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest({
        activity_type: "EMAIL",
        activity_outcome: "No response",
      }),
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(statements()[2]?.text).toMatch(/'ACTIVITY_APPENDED'/);
    expect(statements()[2]?.text).toMatch(/'lead_activity'/);
    expect(statements()[2]?.values).toEqual([
      expect.any(String),
      organizationId,
      workspaceId,
      actorSubject,
      actorIssuer,
      requestCorrelationId,
      "verified_oidc",
      activityId,
      observedLeadRunIdFromWorkspace,
      {},
      {},
      {
        source: "app",
        workspace_id: workspaceId,
        activity_id: activityId,
        activity_type: "EMAIL",
        activity_outcome: "No response",
      },
    ]);
  });

  it("propagates audit insert failure after inserting the activity", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([activityRow()])
      .mockRejectedValueOnce(new Error("synthetic audit failure"));

    await expect(
      appendLeadActivity({
        actor: actor(),
        workspaceId,
        request: createRequest(),
      }),
    ).rejects.toThrow("synthetic audit failure");

    expect(statements()[1]?.text).toMatch(
      /INSERT INTO prospecting_app\.lead_activities/i,
    );
    expect(statements()[2]?.text).toMatch(
      /INSERT INTO prospecting_app\.commercial_audit_events/i,
    );
  });

  it("uses only allowlisted audit metadata keys", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([
        activityRow({
          activity_outcome: "Positive outcome",
          summary: "Synthetic summary",
        }),
      ])
      .mockResolvedValueOnce([]);

    await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest({
        activity_outcome: "Positive outcome",
        summary: "Synthetic summary",
      }),
    });

    const auditValues = statements()[2]?.values;
    const previousMetadata = Object.keys(
      auditValues?.[9] as Record<string, unknown>,
    );
    const newMetadata = Object.keys(
      auditValues?.[10] as Record<string, unknown>,
    );
    const metadata = Object.keys(auditValues?.[11] as Record<string, unknown>);

    expect(previousMetadata).toEqual([]);
    expect(newMetadata).toEqual([]);
    expect(metadata.sort()).toEqual(
      [
        "activity_id",
        "activity_outcome",
        "activity_type",
        "source",
        "workspace_id",
      ].sort(),
    );
  });

  it("does not copy summary, raw request bodies, or prohibited data into audit metadata", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([
        activityRow({
          activity_outcome: "Positive outcome",
          summary: "Synthetic summary",
        }),
      ])
      .mockResolvedValueOnce([]);

    await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest({
        activity_outcome: "Positive outcome",
        summary: "Synthetic summary",
      }),
    });

    expect(JSON.stringify(statements()[2]?.values)).not.toMatch(
      /summary|Synthetic summary|request_body|body|csv|contact|report|payload|secret|sql_params/i,
    );
  });
});

describe("listLeadActivities", () => {
  it("returns an empty paginated list for an existing workspace", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listLeadActivities({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toEqual({
      kind: "listed",
      activities: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it("scopes list reads by organization_id and workspace_id", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([activityRow()]);

    await listLeadActivities({
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

  it("fails closed for cross-organization lists", async () => {
    mocks.query.mockResolvedValueOnce([]);

    const result = await listLeadActivities({
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

  it("applies page, pageSize, limit, and offset server-side", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 12 }])
      .mockResolvedValueOnce([]);

    const result = await listLeadActivities({
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

    const result = await listLeadActivities({
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

  it("orders activities by occurred_at descending and activity_id", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        activityRow({
          activity_id: otherActivityId,
          occurred_at: new Date("2026-07-10T12:00:00.000Z"),
        }),
        activityRow({
          activity_id: activityId,
          occurred_at: new Date("2026-07-09T12:00:00.000Z"),
        }),
      ]);

    const result = await listLeadActivities({
      actor: { organizationId },
      workspaceId,
    });

    expect(readStatements()[2]?.text).toMatch(
      /ORDER BY occurred_at DESC, activity_id/i,
    );
    expect(result).toMatchObject({
      kind: "listed",
      activities: [
        {
          activity_id: otherActivityId,
          occurred_at: "2026-07-10T12:00:00.000Z",
        },
        {
          activity_id: activityId,
          occurred_at: "2026-07-09T12:00:00.000Z",
        },
      ],
    });
  });

  it.each([
    ["invalid organization", { actor: { organizationId: "" }, workspaceId }],
    ["invalid workspace id", { actor: { organizationId }, workspaceId: "bad" }],
    [
      "invalid page",
      { actor: { organizationId }, workspaceId, page: 0 },
    ],
    [
      "invalid pageSize",
      { actor: { organizationId }, workspaceId, pageSize: 0 },
    ],
  ])("rejects %s before database work", async (_label, input) => {
    await expect(listLeadActivities(input)).rejects.toBeInstanceOf(
      LeadActivityRepositoryInputError,
    );

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not expose audit internals in listed activities", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([activityRow()]);

    const result = await listLeadActivities({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toMatchObject({ kind: "listed" });
    const activity =
      result.kind === "listed" ? result.activities[0] : undefined;

    expect(Object.keys(activity ?? {}).sort()).toEqual(
      [
        "activity_id",
        "activity_outcome",
        "activity_type",
        "actor_subject",
        "created_at",
        "observed_lead_run_id",
        "occurred_at",
        "organization_id",
        "summary",
        "workspace_id",
      ].sort(),
    );
    expect(JSON.stringify(activity)).not.toMatch(
      /audit|metadata|previous_metadata|new_metadata|target_type|target_id/i,
    );
  });
});

describe("activity repository boundaries", () => {
  it("uses only the app-owned database client and app-owned schema", () => {
    expect(source()).toContain("../db/app-client");
    expect(source()).toMatch(/prospecting_app\.lead_workspaces/);
    expect(source()).toMatch(/prospecting_app\.lead_activities/);
    expect(source()).toMatch(/prospecting_app\.commercial_audit_events/);
    expect(source()).not.toMatch(
      /producer-client|PRODUCER_DATABASE_URL|company_validations|company_validation_runs|n8n|webhook|fetch\(/i,
    );
  });

  it("does not expose update or delete operations for lead_activities", () => {
    expect(source()).not.toMatch(
      /UPDATE\s+prospecting_app\.lead_activities|DELETE\s+FROM\s+prospecting_app\.lead_activities/i,
    );
    expect(source()).not.toMatch(/updateLeadActivity|deleteLeadActivity/i);
  });

  it("uses parameterized statements without embedding caller-controlled values", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([
        activityRow({
          summary: "Synthetic parameterized summary",
        }),
      ])
      .mockResolvedValueOnce([]);

    await appendLeadActivity({
      actor: actor(),
      workspaceId,
      request: createRequest({ summary: "Synthetic parameterized summary" }),
    });

    for (const statement of statements()) {
      expect(statement).toEqual({
        text: expect.any(String),
        values: expect.any(Array),
      });
      expect(statement.text).not.toContain(organizationId);
      expect(statement.text).not.toContain(workspaceId);
      expect(statement.text).not.toContain(actorSubject);
      expect(statement.text).not.toContain("Synthetic parameterized summary");
    }
  });
});
