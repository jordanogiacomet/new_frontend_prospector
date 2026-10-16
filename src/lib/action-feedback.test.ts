import { describe, expect, it } from "vitest";
import { actionErrorFeedback, unknownMutationMessage } from "./action-feedback";

describe("safe action feedback", () => {
  it.each([[401, "session"], [403, "denied"], [409, "conflict"], [422, "validation"]] as const)("distinguishes HTTP %i", (status, kind) => {
    expect(actionErrorFeedback(status, { error: { message: "private synthetic detail" } }, "mutation").kind).toBe(kind);
    expect(actionErrorFeedback(status, { error: { message: "private synthetic detail" } }, "mutation").message).not.toContain("private synthetic detail");
  });
  it("does not treat a server or network failure as proof a mutation failed", () => {
    for (const status of [0, 500, 503]) {
      expect(actionErrorFeedback(status, null, "mutation")).toEqual({ kind: "unknown", message: unknownMutationMessage });
    }
  });
  it("offers GET recovery for unavailable reads", () => {
    expect(actionErrorFeedback(503, null, "read").message).toContain("apenas consulta");
    expect(actionErrorFeedback(404, null, "read").message).toContain("Volte à lista");
  });
});
