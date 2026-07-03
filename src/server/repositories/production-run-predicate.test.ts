import { describe, expect, it } from "vitest";

import { buildProductionRunPredicate } from "./production-run-predicate";

describe("buildProductionRunPredicate", () => {
  it("accepts a null test marker", () => {
    expect(buildProductionRunPredicate("terminal")).toContain(
      "terminal.test_case_id IS NULL",
    );
  });

  it("accepts only the SR marker matching the exact source row", () => {
    expect(buildProductionRunPredicate("terminal")).toContain(
      "terminal.test_case_id = 'SR_' || terminal.source_row",
    );
  });

  it("rejects a divergent SR marker through exact equality", () => {
    expect(buildProductionRunPredicate("terminal")).toBe(
      "(terminal.test_case_id IS NULL OR terminal.test_case_id = 'SR_' || terminal.source_row)",
    );
  });

  it.each(["grupo_teste", "auditoria_manual", "SR_outra_linha"])(
    "does not admit the explicit test identifier %s",
    (testIdentifier) => {
      expect(buildProductionRunPredicate("terminal")).not.toContain(
        testIdentifier,
      );
    },
  );

  it("uses the same predicate for list, detail, history, and current selection", () => {
    const aliases = [
      "terminal",
      "history",
      "current_terminal",
    ] as const;
    const normalized = aliases.map((alias) =>
      buildProductionRunPredicate(alias).replaceAll(alias, "run"),
    );

    expect(new Set(normalized)).toEqual(
      new Set([
        "(run.test_case_id IS NULL OR run.test_case_id = 'SR_' || run.source_row)",
      ]),
    );
  });
});
