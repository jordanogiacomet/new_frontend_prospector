import { describe, expect, it } from "vitest";

import {
  contactApiErrorMessage,
  describeContactSearchDiagnostic,
  describeContactRevealStatus,
  readContactSearchDiagnostics,
} from "./contact-search-feedback";
import type { ContactCandidateDto } from "../types/contact-enrichment";

describe("contact search feedback", () => {
  it("keeps unknown or unapproved diagnostics out of the UI", () => {
    for (const value of [undefined, null, [],
      [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "CREDITS_EXHAUSTED" }],
      [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "ACCESS_DENIED", raw_error: "secret" }],
      [{ provider: "APOLLO", stage: "COMPANY_SEARCH", code: "NO_MATCHES" }],
      [{ provider: "LUSHA", stage: "COMPANY_SEARCH", code: "NO_RELEVANT_MATCHES" }],
      [{ provider: "APOLLO", stage: "COMPANY_MATCH", code: "NO_RELEVANT_MATCHES" }],
      [{ provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_MATCHES" },
        { provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "RESULTS_FOUND" }],
    ]) expect(readContactSearchDiagnostics(value)).toBeNull();
  });

  it("distinguishes confirmed empty samples from unavailable company matching", () => {
    expect(describeContactSearchDiagnostic({
      provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "NO_MATCHES",
    })).toBe("Lusha não retornou decisores válidos nesta amostra.");
    expect(describeContactSearchDiagnostic({
      provider: "APOLLO", stage: "COMPANY_MATCH", code: "COMPANY_NOT_CONFIRMED",
    })).toContain("A busca de pessoas não foi realizada.");
    expect(describeContactSearchDiagnostic({
      provider: "APOLLO", stage: "COMPANY_MATCH", code: "DOMAIN_UNAVAILABLE",
    })).toContain("não foi consultado");
  });

  it("does not infer a credit balance from a rate limit or completion from a timeout", () => {
    const limited = describeContactSearchDiagnostic({
      provider: "APOLLO", stage: "CONTACT_PREVIEW", code: "RATE_LIMITED",
    });
    expect(limited).toContain("limite de consultas");
    expect(limited).not.toContain("créditos");
    const timedOut = describeContactSearchDiagnostic({
      provider: "LUSHA", stage: "CONTACT_PREVIEW", code: "TIMEOUT",
    });
    expect(timedOut).toContain("resultado desta etapa permanece desconhecido");
  });

  it.each(["LUSHA", "APOLLO"] as const)("distinguishes a %s sample outside the approved target areas from an empty provider sample", (provider) => {
    const diagnostic = { provider, stage: "CONTACT_PREVIEW", code: "NO_RELEVANT_MATCHES" } as const;
    expect(readContactSearchDiagnostics([diagnostic])).toEqual([diagnostic]);
    const message = describeContactSearchDiagnostic(diagnostic);
    expect(message).toContain("retornou perfis");
    expect(message).toContain("áreas prioritárias");
    expect(message).toContain("não comprova ausência");
  });

  it("maps only known Prospecta error codes and never renders remote text", () => {
    expect(contactApiErrorMessage({ error: { code: "CONTACT_DATA_HTTPS_REQUIRED", message: "sensitive" } }))
      .toContain("conexão segura");
    expect(contactApiErrorMessage({ error: { code: "CUSTOM_PROVIDER_ERROR", message: "secret" } }))
      .toBeNull();
  });

  it.each(["CONTACT_REVEAL_UNAVAILABLE", "CONTACT_PREVIEW_NOT_FOUND", "CONTACT_COMPANY_SEARCH_NOT_FOUND", "CONTACT_REVEAL_IDEMPOTENCY_CONFLICT", "CONTACT_PREVIEW_IDEMPOTENCY_CONFLICT", "CONTACT_COMPANY_SEARCH_IDEMPOTENCY_CONFLICT", "CONTACT_NOT_FOUND"])("maps %s to safe recovery copy", (code) => {
    const message = contactApiErrorMessage({ error: { code, message: "private payload", details: { credit_balance: 0 } } });
    expect(message).not.toBeNull();
    expect(message).not.toMatch(/private payload|credit_balance|créditos esgotados/);
    expect(message).toMatch(/Atualize|Atualizar|Consulte|Confira/);
  });

  it("does not conclude recovery from a status alone, old channels, or absent channels", () => {
    const candidate = {
      governanceState: "AVAILABLE",
      reveal: { requestedChannels: ["work_email"], channelsMatchResult: false },
      channels: { workEmails: [{ value: "sintetico@example.test" }], businessPhones: [] },
    } as unknown as ContactCandidateDto;
    expect(describeContactRevealStatus("REVEAL_AVAILABLE")).not.toMatch(/Recuperação concluída/);
    expect(describeContactRevealStatus("REVEAL_AVAILABLE", candidate)).not.toMatch(/Recuperação concluída/);
    expect(describeContactRevealStatus("REVEAL_AVAILABLE", { ...candidate, channels: null })).not.toMatch(/Recuperação concluída/);
    expect(describeContactRevealStatus("REVEAL_EMPTY")).toContain("Motivo não informado");
    expect(describeContactRevealStatus("PROVIDER_OUTCOME_UNKNOWN")).toContain("permanece desconhecido");
  });
});
