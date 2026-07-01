import { describe, expect, it } from "vitest";

import {
  UNAVAILABLE_LABEL,
  formatBrazilianDate,
  formatBrlCurrency,
  formatCnpj,
  formatScore,
} from "./index";

describe("formatCnpj", () => {
  it("formats an exact 14-digit CNPJ", () => {
    expect(formatCnpj("12345678000195")).toBe("12.345.678/0001-95");
  });

  it("does not reformat an already punctuated CNPJ", () => {
    expect(formatCnpj("12.345.678/0001-95")).toBe(UNAVAILABLE_LABEL);
  });

  it("rejects a short CNPJ", () => {
    expect(formatCnpj("1234567800019")).toBe(UNAVAILABLE_LABEL);
  });

  it("keeps a missing CNPJ unavailable", () => {
    expect(formatCnpj(null)).toBe(UNAVAILABLE_LABEL);
  });
});

describe("formatBrazilianDate", () => {
  it("formats an ISO UTC timestamp as a Brazilian date", () => {
    expect(formatBrazilianDate("2026-07-01T12:00:00Z")).toBe("01/07/2026");
  });

  it("applies the America/Sao_Paulo timezone at the previous-day boundary", () => {
    expect(formatBrazilianDate("2026-07-01T01:59:59Z")).toBe("30/06/2026");
  });

  it("uses the next local day after the Sao Paulo boundary", () => {
    expect(formatBrazilianDate("2026-07-01T03:00:00.000Z")).toBe("01/07/2026");
  });

  it("rejects an impossible calendar date", () => {
    expect(formatBrazilianDate("2026-02-30T12:00:00Z")).toBe(
      UNAVAILABLE_LABEL,
    );
  });

  it("rejects a timestamp without an explicit UTC marker", () => {
    expect(formatBrazilianDate("2026-07-01T12:00:00")).toBe(
      UNAVAILABLE_LABEL,
    );
  });

  it("rejects malformed date text", () => {
    expect(formatBrazilianDate("not-a-date")).toBe(UNAVAILABLE_LABEL);
  });

  it("keeps a missing date unavailable", () => {
    expect(formatBrazilianDate(null)).toBe(UNAVAILABLE_LABEL);
  });
});

describe("formatBrlCurrency", () => {
  it("formats a positive numeric BRL value", () => {
    expect(formatBrlCurrency(1234.56)).toBe("R$\u00a01.234,56");
  });

  it("preserves an explicit numeric zero", () => {
    expect(formatBrlCurrency(0)).toBe("R$\u00a00,00");
  });

  it("formats a negative numeric value without changing its meaning", () => {
    expect(formatBrlCurrency(-10.5)).toBe("-R$\u00a010,50");
  });

  it("does not convert a missing currency value to zero", () => {
    expect(formatBrlCurrency(null)).toBe(UNAVAILABLE_LABEL);
  });

  it("rejects a non-finite numeric value", () => {
    expect(formatBrlCurrency(Number.NaN)).toBe(UNAVAILABLE_LABEL);
  });

  it("does not parse a text value at runtime", () => {
    expect(formatBrlCurrency("1234.56" as unknown as number)).toBe(
      UNAVAILABLE_LABEL,
    );
  });
});

describe("formatScore", () => {
  it("formats the lower boundary score", () => {
    expect(formatScore(0)).toBe("0");
  });

  it("formats the upper boundary score", () => {
    expect(formatScore(100)).toBe("100");
  });

  it("formats an integer score inside the approved range", () => {
    expect(formatScore(73)).toBe("73");
  });

  it("does not convert a missing score to zero", () => {
    expect(formatScore(null)).toBe(UNAVAILABLE_LABEL);
  });

  it("rejects a score below the approved range", () => {
    expect(formatScore(-1)).toBe(UNAVAILABLE_LABEL);
  });

  it("rejects a score above the approved range", () => {
    expect(formatScore(101)).toBe(UNAVAILABLE_LABEL);
  });

  it("rejects a fractional score", () => {
    expect(formatScore(99.5)).toBe(UNAVAILABLE_LABEL);
  });

  it("rejects a non-finite score", () => {
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe(UNAVAILABLE_LABEL);
  });
});
