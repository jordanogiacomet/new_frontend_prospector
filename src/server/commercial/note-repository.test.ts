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
  LeadNoteRepositoryInputError,
  appendLeadNote,
  listLeadNotes,
} from "./note-repository";

const organizationId = "org-synthetic-a";
const otherOrganizationId = "org-synthetic-b";
const actorSubject = "oidc|synthetic-manager";
const actorIssuer = "https://identity.synthetic.test/tenant";
const requestCorrelationId = "00000000-0000-4000-8000-000000000831";
const otherSubject = "oidc|synthetic-seller";
const workspaceId = "00000000-0000-4000-8000-000000000031";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000032";
const noteId = "00000000-0000-4000-8000-000000000131";
const otherNoteId = "00000000-0000-4000-8000-000000000132";
const leadRunId = `lr_${"a".repeat(64)}`;
const observedLeadRunIdFromWorkspace = `lr_${"b".repeat(64)}`;
const noteBody = "Synthetic commercial note";
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
    body: noteBody,
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

function noteRow(
  overrides: Partial<{
    note_id: string;
    organization_id: string;
    workspace_id: string;
    observed_lead_run_id: string;
    author_subject: string;
    body: string;
    created_at: Date | string;
  }> = {},
) {
  return {
    note_id: overrides.note_id ?? noteId,
    organization_id: overrides.organization_id ?? organizationId,
    workspace_id: overrides.workspace_id ?? workspaceId,
    observed_lead_run_id:
      overrides.observed_lead_run_id ?? observedLeadRunIdFromWorkspace,
    author_subject: overrides.author_subject ?? actorSubject,
    body: overrides.body ?? noteBody,
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
    resolve(process.cwd(), "src/server/commercial/note-repository.ts"),
    "utf8",
  );
}

beforeEach(() => {
  mocks.client.query.mockReset();
  mocks.query.mockReset();
  mocks.transaction.mockReset();
  installTransactionMock();
});

describe("appendLeadNote", () => {
  it("appends a note with organization and author from context", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([noteRow()])
      .mockResolvedValueOnce([]);

    const result = await appendLeadNote({
      actor: actor(),
      workspaceId,
      request: createRequest(),
    });

    expect(result).toEqual({
      kind: "appended",
      note: {
        note_id: noteId,
        organization_id: organizationId,
        workspace_id: workspaceId,
        observed_lead_run_id: observedLeadRunIdFromWorkspace,
        author_subject: actorSubject,
        body: noteBody,
        created_at: createdAt.toISOString(),
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(statements()[0]?.text).toMatch(
      /FROM prospecting_app\.lead_workspaces/i,
    );
    expect(statements()[0]?.text).toMatch(/FOR UPDATE/i);
    expect(statements()[1]?.text).toMatch(
      /INSERT INTO prospecting_app\.lead_notes/i,
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
      noteBody,
    ]);
  });

  it("rejects body-controlled organization, actor, and author fields before database work", async () => {
    await expect(
      appendLeadNote({
        actor: actor(),
        workspaceId,
        request: createRequest({
          organization_id: otherOrganizationId,
          actor_subject: otherSubject,
          author_subject: otherSubject,
        }),
      }),
    ).rejects.toBeInstanceOf(LeadNoteRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects body-controlled workspace internals before database work", async () => {
    await expect(
      appendLeadNote({
        actor: actor(),
        workspaceId,
        request: createRequest({
          workspace_id: otherWorkspaceId,
          observed_lead_run_id: leadRunId,
        }),
      }),
    ).rejects.toBeInstanceOf(LeadNoteRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("fails closed when the workspace does not exist", async () => {
    mocks.client.query.mockResolvedValueOnce([]);

    const result = await appendLeadNote({
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

    const result = await appendLeadNote({
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
        noteRow({
          observed_lead_run_id: observedLeadRunIdFromWorkspace,
        }),
      ])
      .mockResolvedValueOnce([]);

    await appendLeadNote({
      actor: actor(),
      workspaceId,
      request: createRequest(),
    });

    expect(statements()[1]?.values[3]).toBe(observedLeadRunIdFromWorkspace);
    expect(statements()[2]?.values[8]).toBe(observedLeadRunIdFromWorkspace);
  });

  it("requires a body before database work", async () => {
    await expect(
      appendLeadNote({
        actor: actor(),
        workspaceId,
        request: {},
      }),
    ).rejects.toBeInstanceOf(LeadNoteRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["", "   ", " trimmed ", 123])(
    "rejects invalid body %s before database work",
    async (body) => {
      await expect(
        appendLeadNote({
          actor: actor(),
          workspaceId,
          request: createRequest({ body }),
        }),
      ).rejects.toBeInstanceOf(LeadNoteRepositoryInputError);

      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("rejects body above 4000 Unicode code points before database work", async () => {
    await expect(
      appendLeadNote({
        actor: actor(),
        workspaceId,
        request: createRequest({ body: "🙂".repeat(4001) }),
      }),
    ).rejects.toBeInstanceOf(LeadNoteRepositoryInputError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a NOTE_APPENDED audit event in the same transaction", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([noteRow()])
      .mockResolvedValueOnce([]);

    await appendLeadNote({
      actor: actor(),
      workspaceId,
      request: createRequest(),
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(statements()[2]?.text).toMatch(/'NOTE_APPENDED'/);
    expect(statements()[2]?.text).toMatch(/'lead_note'/);
    expect(statements()[2]?.values).toEqual([
      expect.any(String),
      organizationId,
      workspaceId,
      actorSubject,
      actorIssuer,
      requestCorrelationId,
      "verified_oidc",
      noteId,
      observedLeadRunIdFromWorkspace,
      {},
      {},
      {
        source: "app",
        workspace_id: workspaceId,
        note_id: noteId,
      },
    ]);
  });

  it("propagates audit insert failure after inserting the note", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([noteRow()])
      .mockRejectedValueOnce(new Error("synthetic audit failure"));

    await expect(
      appendLeadNote({
        actor: actor(),
        workspaceId,
        request: createRequest(),
      }),
    ).rejects.toThrow("synthetic audit failure");

    expect(statements()[1]?.text).toMatch(
      /INSERT INTO prospecting_app\.lead_notes/i,
    );
    expect(statements()[2]?.text).toMatch(
      /INSERT INTO prospecting_app\.commercial_audit_events/i,
    );
  });

  it("uses only allowlisted audit metadata keys", async () => {
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([noteRow()])
      .mockResolvedValueOnce([]);

    await appendLeadNote({
      actor: actor(),
      workspaceId,
      request: createRequest(),
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
      ["note_id", "source", "workspace_id"].sort(),
    );
  });

  it("does not copy note bodies, raw request bodies, or prohibited data into audit metadata", async () => {
    const confidentialNoteBody = "Synthetic confidential note body";
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([noteRow({ body: confidentialNoteBody })])
      .mockResolvedValueOnce([]);

    await appendLeadNote({
      actor: actor(),
      workspaceId,
      request: createRequest({ body: confidentialNoteBody }),
    });

    expect(JSON.stringify(statements()[2]?.values)).not.toMatch(
      /Synthetic confidential note body|request_body|body|csv|contact|report|payload|secret|sql_params/i,
    );
  });
});

describe("listLeadNotes", () => {
  it("returns an empty paginated list for an existing workspace", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const result = await listLeadNotes({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toEqual({
      kind: "listed",
      notes: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it("scopes list reads by organization_id and workspace_id", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([noteRow()]);

    await listLeadNotes({
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

    const result = await listLeadNotes({
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

    const result = await listLeadNotes({
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

    const result = await listLeadNotes({
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

  it("orders notes by created_at descending and note_id", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        noteRow({
          note_id: otherNoteId,
          created_at: new Date("2026-07-10T12:00:00.000Z"),
        }),
        noteRow({
          note_id: noteId,
          created_at: new Date("2026-07-09T12:00:00.000Z"),
        }),
      ]);

    const result = await listLeadNotes({
      actor: { organizationId },
      workspaceId,
    });

    expect(readStatements()[2]?.text).toMatch(
      /ORDER BY created_at DESC, note_id/i,
    );
    expect(result).toMatchObject({
      kind: "listed",
      notes: [
        {
          note_id: otherNoteId,
          created_at: "2026-07-10T12:00:00.000Z",
        },
        {
          note_id: noteId,
          created_at: "2026-07-09T12:00:00.000Z",
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
    await expect(listLeadNotes(input)).rejects.toBeInstanceOf(
      LeadNoteRepositoryInputError,
    );

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not expose audit internals in listed notes", async () => {
    mocks.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([noteRow()]);

    const result = await listLeadNotes({
      actor: { organizationId },
      workspaceId,
    });

    expect(result).toMatchObject({ kind: "listed" });
    const note = result.kind === "listed" ? result.notes[0] : undefined;

    expect(Object.keys(note ?? {}).sort()).toEqual(
      [
        "author_subject",
        "body",
        "created_at",
        "note_id",
        "observed_lead_run_id",
        "organization_id",
        "workspace_id",
      ].sort(),
    );
    expect(JSON.stringify(note)).not.toMatch(
      /audit|metadata|previous_metadata|new_metadata|target_type|target_id/i,
    );
  });
});

describe("note repository boundaries", () => {
  it("uses only the app-owned database client and app-owned schema", () => {
    expect(source()).toContain("../db/app-client");
    expect(source()).toMatch(/prospecting_app\.lead_workspaces/);
    expect(source()).toMatch(/prospecting_app\.lead_notes/);
    expect(source()).toMatch(/prospecting_app\.commercial_audit_events/);
    expect(source()).not.toMatch(
      /producer-client|PRODUCER_DATABASE_URL|company_validations|company_validation_runs|n8n|webhook|fetch\(/i,
    );
  });

  it("does not expose update or delete operations for lead_notes", () => {
    expect(source()).not.toMatch(
      /UPDATE\s+prospecting_app\.lead_notes|DELETE\s+FROM\s+prospecting_app\.lead_notes/i,
    );
    expect(source()).not.toMatch(/updateLeadNote|deleteLeadNote/i);
  });

  it("uses parameterized statements without embedding caller-controlled values", async () => {
    const parameterizedNoteBody = "Synthetic parameterized note body";
    mocks.client.query
      .mockResolvedValueOnce([workspaceReferenceRow()])
      .mockResolvedValueOnce([noteRow({ body: parameterizedNoteBody })])
      .mockResolvedValueOnce([]);

    await appendLeadNote({
      actor: actor(),
      workspaceId,
      request: createRequest({ body: parameterizedNoteBody }),
    });

    for (const statement of statements()) {
      expect(statement).toEqual({
        text: expect.any(String),
        values: expect.any(Array),
      });
      expect(statement.text).not.toContain(organizationId);
      expect(statement.text).not.toContain(workspaceId);
      expect(statement.text).not.toContain(actorSubject);
      expect(statement.text).not.toContain(parameterizedNoteBody);
    }
  });
});
