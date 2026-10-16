import { describe, expect, it } from "vitest";

import {
  appendReturnTo,
  resolveBatchListReturnHref,
  resolveLeadReturnDestination,
  resolveOutsideAnalysisReturnHref,
  resolveLeadListReturnHref,
} from "./navigation-return";

describe("internal return navigation", () => {
  it("appends an encoded internal origin without changing the destination query", () => {
    expect(
      appendReturnTo(
        "/workspaces/00000000-0000-4000-8000-000000000041",
        "/work-queue?page=2&priority=B",
      ),
    ).toBe(
      "/workspaces/00000000-0000-4000-8000-000000000041?returnTo=%2Fwork-queue%3Fpage%3D2%26priority%3DB",
    );
  });

  it("accepts only the lead list or one workspace as a lead return destination", () => {
    expect(
      resolveLeadReturnDestination("/leads?page=3&uf=PE"),
    ).toEqual({ href: "/leads?page=3&uf=PE", label: "Voltar para leads" });
    expect(
      resolveLeadReturnDestination(
        "/workspaces/00000000-0000-4000-8000-000000000041?returnTo=%2Fwork-queue%3Fpage%3D2",
      ),
    ).toEqual({
      href: "/workspaces/00000000-0000-4000-8000-000000000041?returnTo=%2Fwork-queue%3Fpage%3D2",
      label: "Voltar ao acompanhamento",
    });
  });

  it("rejects external, protocol-relative and unapproved internal return destinations", () => {
    for (const unsafeReturn of [
      "https://malicious.example/leads",
      "//malicious.example/leads",
      "/imports",
      "/workspaces/not-a-uuid",
    ]) {
      expect(resolveLeadReturnDestination(unsafeReturn)).toEqual({
        href: "/leads",
        label: "Voltar para leads",
      });
    }
  });

  it("preserves validated lead-list filters when returning from historical follow-up", () => {
    expect(resolveLeadListReturnHref("/leads?page=2&pageSize=10&priority=C&uf=PE", "12345678000195")).toBe(
      "/leads?page=2&pageSize=10&priority=C&uf=PE",
    );
    expect(resolveLeadListReturnHref("/leads", "12345678000195")).toBe("/leads");
  });

  it("maps legacy queue returns to supported lead filters without restoring the pipeline", () => {
    expect(resolveLeadListReturnHref("/work-queue?page=2&pageSize=10&priority=C&uf=PE&cnpj_normalizado=12345678000195&commercial_stage=CONTACTED&sort=last_analysis_desc", "22345678000190")).toBe(
      "/leads?page=2&pageSize=10&uf=PE&priority=C&cnpj=12345678000195",
    );
    expect(resolveLeadListReturnHref("/work-queue", "12345678000195")).toBe("/leads");
  });

  it("rejects unsafe or invalid list returns and falls back to the validated company", () => {
    for (const unsafeReturn of [
      "https://malicious.example/leads",
      "//malicious.example/leads",
      "/other/../leads?page=2",
      "/leads?page=2#section",
      "/leads?page=0",
      "/leads?uf=UNKNOWN",
      "/leads?unexpected=value",
      "/work-queue?pageSize=50",
      "/work-queue?priority=B&priority=C",
      "/work-queue?cnpj_normalizado=invalid",
      null,
    ]) {
      expect(resolveLeadListReturnHref(unsafeReturn, "12.345.678/0001-95")).toBe(
        "/leads?cnpj=12345678000195",
      );
    }
    expect(resolveLeadListReturnHref(null, "invalid")).toBe("/leads");
  });

  it("restores the batch list using only its approved pagination and existing bounds", () => {
    expect(resolveBatchListReturnHref("/imports/batches?page=03&pageSize=5&status=COMPLETED")).toBe(
      "/imports/batches?page=3&pageSize=5",
    );
    expect(resolveBatchListReturnHref("/imports/batches?page=10001&pageSize=101")).toBe(
      "/imports/batches?page=1&pageSize=20",
    );
    expect(resolveBatchListReturnHref("/imports/batches?page=-1&pageSize=nope")).toBe(
      "/imports/batches?page=1&pageSize=20",
    );
    expect(resolveBatchListReturnHref("/imports/batches?page=10000&pageSize=100")).toBe(
      "/imports/batches?page=10000&pageSize=100",
    );
  });

  it("restores outside-analysis pagination through its existing query contract", () => {
    expect(resolveOutsideAnalysisReturnHref("/leads/outside-analysis?page=03&pageSize=5")).toBe(
      "/leads/outside-analysis?page=3&pageSize=5",
    );
    expect(resolveOutsideAnalysisReturnHref("/leads/outside-analysis?page=3")).toBe(
      "/leads/outside-analysis?page=3&pageSize=20",
    );
    for (const query of ["page=0", "pageSize=21", "page=2&page=3", "pageSize=5&priority=B"]) {
      expect(resolveOutsideAnalysisReturnHref(`/leads/outside-analysis?${query}`)).toBe(
        "/leads/outside-analysis",
      );
    }
  });

  it("accepts only the exact internal path of each list and preserves its direct-entry fallback", () => {
    for (const [path, resolve] of [
      ["/imports/batches", resolveBatchListReturnHref],
      ["/leads/outside-analysis", resolveOutsideAnalysisReturnHref],
    ] as const) {
      expect(resolve(null)).toBe(path);
      expect(resolve(path)).toBe(path);
      for (const unsafeReturn of [
        `https://prospecta.internal${path}?page=2`,
        `https://malicious.example${path}?page=2`,
        `//malicious.example${path}?page=2`,
        `${path}/?page=2`,
        `/other/..${path}?page=2`,
        `${path}?page=2#section`,
        `/\\malicious.example${path}`,
        "/work-queue?page=2",
        `${path}?padding=${"x".repeat(2048)}`,
      ]) {
        expect(resolve(unsafeReturn)).toBe(path);
      }
    }
  });
});
