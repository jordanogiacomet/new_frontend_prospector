import { describe, expect, it } from "vitest";

import {
  cnpjSchema,
  leadDetailParamsSchema,
  leadDetailQuerySchema,
  leadHistoryQuerySchema,
  leadListQuerySchema,
} from "./lead-query";

const syntheticCnpj = "00000000000000";
const syntheticLeadRunId = `lr_${"a".repeat(64)}`;

function query(entries: Record<string, string | string[]>): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, values] of Object.entries(entries)) {
    for (const value of Array.isArray(values) ? values : [values]) {
      searchParams.append(key, value);
    }
  }

  return searchParams;
}

describe("leadListQuerySchema", () => {
  it("applies the approved pagination defaults", () => {
    expect(leadListQuerySchema.parse(new URLSearchParams())).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it("parses every approved list control", () => {
    expect(
      leadListQuerySchema.parse(
        query({
          page: "2",
          pageSize: "10",
          cnpj: "00.000.000/0000-00",
          uf: "RS",
          priority: "B",
        }),
      ),
    ).toEqual({
      page: 2,
      pageSize: 10,
      cnpj: syntheticCnpj,
      uf: "RS",
      priority: "B",
    });
  });

  it.each([
    ["page", "1"],
    ["page", String(Number.MAX_SAFE_INTEGER)],
    ["pageSize", "1"],
    ["pageSize", "20"],
  ])("accepts the %s boundary %s", (key, value) => {
    expect(leadListQuerySchema.safeParse(query({ [key]: value })).success).toBe(
      true,
    );
  });

  it.each([
    ["page", "0"],
    ["page", "-1"],
    ["page", "+1"],
    ["page", "1.5"],
    ["page", "1e2"],
    ["page", " 1"],
    ["page", "1 "],
    ["page", ""],
    ["page", String(Number.MAX_SAFE_INTEGER + 1)],
    ["pageSize", "0"],
    ["pageSize", "21"],
    ["pageSize", "-1"],
    ["pageSize", "+1"],
    ["pageSize", "1.5"],
    ["pageSize", "1e1"],
    ["pageSize", " 1"],
    ["pageSize", ""],
  ])("rejects invalid pagination %s=%s", (key, value) => {
    expect(leadListQuerySchema.safeParse(query({ [key]: value })).success).toBe(
      false,
    );
  });

  it.each(["page", "pageSize", "cnpj", "uf", "priority"])(
    "rejects repeated %s parameters",
    (key) => {
      expect(
        leadListQuerySchema.safeParse(query({ [key]: ["1", "2"] })).success,
      ).toBe(false);
    },
  );

  it("accepts every valid Brazilian UF code", () => {
    const validUfs = [
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ];

    for (const uf of validUfs) {
      expect(leadListQuerySchema.parse(query({ uf })).uf).toBe(uf);
    }
  });

  it.each(["rs", "XX", "BR", "R", "RSS", "", " RS"])(
    "rejects invalid or non-uppercase UF %s",
    (uf) => {
      expect(leadListQuerySchema.safeParse(query({ uf })).success).toBe(false);
    },
  );

  it.each(["B", "C", "E", "R"])(
    "accepts approved priority %s",
    (priority) => {
      expect(leadListQuerySchema.parse(query({ priority })).priority).toBe(
        priority,
      );
    },
  );

  it.each(["A", "b", "HIGH", "1", "", "B,C"])(
    "rejects unapproved priority %s",
    (priority) => {
      expect(
        leadListQuerySchema.safeParse(query({ priority })).success,
      ).toBe(false);
    },
  );

  it.each([
    "q",
    "name",
    "city",
    "action",
    "trustStatus",
    "score",
    "minScore",
    "maxScore",
    "date",
    "dateFrom",
    "dateTo",
    "batch",
    "importBatchId",
    "riskFlags",
    "sort",
    "direction",
    "__proto__",
  ])("rejects deferred or unknown list control %s", (key) => {
    expect(
      leadListQuerySchema.safeParse(query({ [key]: "synthetic" })).success,
    ).toBe(false);
  });

  it("rejects unknown plain-object properties instead of stripping them", () => {
    expect(
      leadListQuerySchema.safeParse({
        page: "1",
        unsupported: "synthetic",
      }).success,
    ).toBe(false);
  });
});

describe("cnpjSchema", () => {
  it.each([
    ["00000000000000", syntheticCnpj],
    ["00.000.000/0000-00", syntheticCnpj],
    ["00.000000/0000-00", syntheticCnpj],
  ])("normalizes an exact CNPJ %s", (input, expected) => {
    expect(cnpjSchema.parse(input)).toBe(expected);
  });

  it.each([
    "0000000000000",
    "000000000000000",
    "00.000.000/0000-0",
    "00-000-000/0000-00",
    "00.000.000/0000_00",
    "abcdefghijklmn",
    "",
    " 00000000000000",
  ])("rejects malformed or non-exact CNPJ %s", (cnpj) => {
    expect(cnpjSchema.safeParse(cnpj).success).toBe(false);
  });
});

describe("leadDetailParamsSchema", () => {
  it("normalizes the exact path CNPJ", () => {
    expect(
      leadDetailParamsSchema.parse({ cnpj: "00.000.000/0000-00" }),
    ).toEqual({ cnpj: syntheticCnpj });
  });

  it("rejects malformed path CNPJ", () => {
    expect(
      leadDetailParamsSchema.safeParse({ cnpj: "0000000000000" }).success,
    ).toBe(false);
  });

  it("rejects unknown path parameters", () => {
    expect(
      leadDetailParamsSchema.safeParse({
        cnpj: syntheticCnpj,
        extra: "synthetic",
      }).success,
    ).toBe(false);
  });
});

describe("leadDetailQuerySchema", () => {
  it("accepts an empty detail query", () => {
    expect(leadDetailQuerySchema.parse(new URLSearchParams())).toEqual({});
  });

  it("accepts an exact lead run identifier", () => {
    expect(
      leadDetailQuerySchema.parse(query({ leadRunId: syntheticLeadRunId })),
    ).toEqual({ leadRunId: syntheticLeadRunId });
  });

  it.each([
    "lr_abc",
    `lr_${"A".repeat(64)}`,
    `${"a".repeat(64)}`,
    `lr_${"a".repeat(63)}`,
    `lr_${"a".repeat(65)}`,
    "",
  ])("rejects malformed lead run identifier %s", (leadRunId) => {
    expect(
      leadDetailQuerySchema.safeParse(query({ leadRunId })).success,
    ).toBe(false);
  });

  it("rejects a repeated lead run identifier", () => {
    expect(
      leadDetailQuerySchema.safeParse(
        query({ leadRunId: [syntheticLeadRunId, syntheticLeadRunId] }),
      ).success,
    ).toBe(false);
  });

  it.each(["sort", "direction", "page", "score"])(
    "rejects unsupported detail control %s",
    (key) => {
      expect(
        leadDetailQuerySchema.safeParse(query({ [key]: "1" })).success,
      ).toBe(false);
    },
  );
});

describe("leadHistoryQuerySchema", () => {
  it("applies the approved history defaults", () => {
    expect(leadHistoryQuerySchema.parse(new URLSearchParams())).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it("accepts approved history pagination boundaries", () => {
    expect(
      leadHistoryQuerySchema.parse(query({ page: "1", pageSize: "20" })),
    ).toEqual({ page: 1, pageSize: 20 });
  });

  it.each([
    ["page", "0"],
    ["page", "1.5"],
    ["pageSize", "0"],
    ["pageSize", "21"],
  ])("rejects invalid history pagination %s=%s", (key, value) => {
    expect(
      leadHistoryQuerySchema.safeParse(query({ [key]: value })).success,
    ).toBe(false);
  });

  it.each(["page", "pageSize"])(
    "rejects repeated history %s parameters",
    (key) => {
      expect(
        leadHistoryQuerySchema.safeParse(query({ [key]: ["1", "2"] }))
          .success,
      ).toBe(false);
    },
  );

  it.each([
    "cnpj",
    "sort",
    "direction",
    "dateFrom",
    "dateTo",
    "score",
    "batch",
  ])("rejects unsupported history control %s", (key) => {
    expect(
      leadHistoryQuerySchema.safeParse(query({ [key]: "synthetic" })).success,
    ).toBe(false);
  });
});
