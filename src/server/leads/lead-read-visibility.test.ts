import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDemo2TestRunVisibilityEnabled: vi.fn<() => boolean>(),
  isDemo3CorrelatedLeadVisibilityEnabled: vi.fn<() => boolean>(),
  listCorrelatedImportBatchIds:
    vi.fn<
      (input: {
        readonly organizationId: string;
      }) => Promise<readonly string[]>
    >(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../demo/mode", () => ({
  isDemo2TestRunVisibilityEnabled:
    mocks.isDemo2TestRunVisibilityEnabled,
  isDemo3CorrelatedLeadVisibilityEnabled:
    mocks.isDemo3CorrelatedLeadVisibilityEnabled,
}));
vi.mock(
  "../repositories/imports/import-submissions-repository",
  () => ({
    listCorrelatedImportBatchIds:
      mocks.listCorrelatedImportBatchIds,
  }),
);

import type { AuthorizedActor } from "../auth/authorization";
import { resolveLeadReadVisibility } from "./lead-read-visibility";

const demo3Actor: AuthorizedActor = {
  issuer: "urn:prospecta:demo3-preproduction",
  subject: "demo3-preproduction-user",
  organizationId: "synthetic-demo3-organization",
  permissions: ["leads:read"],
};

describe("resolveLeadReadVisibility", () => {
  beforeEach(() => {
    mocks.isDemo2TestRunVisibilityEnabled.mockReset();
    mocks.isDemo3CorrelatedLeadVisibilityEnabled.mockReset();
    mocks.listCorrelatedImportBatchIds.mockReset();
    mocks.isDemo2TestRunVisibilityEnabled.mockReturnValue(false);
    mocks.isDemo3CorrelatedLeadVisibilityEnabled.mockReturnValue(false);
    mocks.listCorrelatedImportBatchIds.mockResolvedValue([]);
  });

  it("preserves the explicit broad Demo 2 reader without app-owned lookup", async () => {
    mocks.isDemo2TestRunVisibilityEnabled.mockReturnValue(true);

    await expect(resolveLeadReadVisibility(demo3Actor)).resolves.toEqual({
      includeDemo2TestRuns: true,
    });
    expect(mocks.listCorrelatedImportBatchIds).not.toHaveBeenCalled();
  });

  it("keeps production visibility unchanged outside Demo 3", async () => {
    await expect(resolveLeadReadVisibility(demo3Actor)).resolves.toEqual({});
    expect(mocks.listCorrelatedImportBatchIds).not.toHaveBeenCalled();
  });

  it("rejects a non-Demo 3 actor even inside the Demo 3 runtime", async () => {
    mocks.isDemo3CorrelatedLeadVisibilityEnabled.mockReturnValue(true);

    await expect(
      resolveLeadReadVisibility({
        ...demo3Actor,
        subject: "another-subject",
      }),
    ).resolves.toEqual({});
    expect(mocks.listCorrelatedImportBatchIds).not.toHaveBeenCalled();
  });

  it("scopes correlated batch lookup to the authenticated organization", async () => {
    mocks.isDemo3CorrelatedLeadVisibilityEnabled.mockReturnValue(true);
    mocks.listCorrelatedImportBatchIds.mockResolvedValue([
      "synthetic-correlated-batch",
    ]);

    await expect(resolveLeadReadVisibility(demo3Actor)).resolves.toEqual({
      includeTestRunsFromImportBatchIds: [
        "synthetic-correlated-batch",
      ],
    });
    expect(mocks.listCorrelatedImportBatchIds).toHaveBeenCalledWith({
      organizationId: demo3Actor.organizationId,
    });
  });

  it("does not widen visibility when the organization has no correlated batch", async () => {
    mocks.isDemo3CorrelatedLeadVisibilityEnabled.mockReturnValue(true);

    await expect(resolveLeadReadVisibility(demo3Actor)).resolves.toEqual({});
    expect(mocks.listCorrelatedImportBatchIds).toHaveBeenCalledOnce();
  });
});
