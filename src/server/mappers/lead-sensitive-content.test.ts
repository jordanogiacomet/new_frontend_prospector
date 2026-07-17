import { describe, expect, it } from "vitest";

import {
  mapSensitiveLeadEvidences,
  mapSensitiveLeadInsights,
  type SensitiveContentAccess,
} from "./lead-sensitive-content";

const now = new Date("2026-07-13T12:00:00.000Z");
const enabledAccess: SensitiveContentAccess = {
  enabled: true,
  allowedUrlHosts: ["evidence.example.com"],
  now,
};

describe("sensitive lead content mapping", () => {
  it("withholds every candidate field when access is disabled", () => {
    expect(
      mapSensitiveLeadInsights(["Synthetic risk"], ["Synthetic signal"], {
        ...enabledAccess,
        enabled: false,
      }, null),
    ).toEqual({
      riskFlags: { status: "omitted_by_policy", items: null },
      positiveSignals: { status: "omitted_by_policy", items: null },
    });
    expect(
      mapSensitiveLeadEvidences(
        [{ title: "Synthetic evidence" }],
        { ...enabledAccess, enabled: false },
        null,
      ),
    ).toEqual({ status: "omitted_by_policy", content: null });
  });

  it("withholds candidate content after its producer expiry", () => {
    expect(
      mapSensitiveLeadInsights(
        ["Synthetic risk"],
        ["Synthetic signal"],
        enabledAccess,
        "2026-07-13T11:59:59.000Z",
      ),
    ).toEqual({
      riskFlags: { status: "omitted_by_policy", items: null },
      positiveSignals: { status: "omitted_by_policy", items: null },
    });
  });

  it("maps only bounded plain-text risk and signal arrays", () => {
    expect(
      mapSensitiveLeadInsights(
        ["  Synthetic operational risk  "],
        ["Synthetic positive signal"],
        enabledAccess,
        null,
      ),
    ).toEqual({
      riskFlags: {
        status: "available",
        items: ["Synthetic operational risk"],
      },
      positiveSignals: {
        status: "available",
        items: ["Synthetic positive signal"],
      },
    });
  });

  it.each([
    ["active HTML", ["<script>alert(1)</script>"]],
    ["email address", ["contato synthetic@example.test"]],
    ["phone-like content", ["Ligar para 11999999999"]],
    ["URL", ["https://unsafe.example.test"]],
    ["unexpected object", [{ text: "Synthetic risk" }]],
  ])("rejects a %s collection item", (_case, riskFlags) => {
    expect(
      mapSensitiveLeadInsights(
        riskFlags,
        ["Synthetic signal"],
        enabledAccess,
        null,
      ).riskFlags,
    ).toEqual({ status: "unavailable", items: null });
  });

  it("returns missing states only for selected null source values", () => {
    expect(
      mapSensitiveLeadInsights(null, null, enabledAccess, null),
    ).toEqual({
      riskFlags: { status: "missing", items: null },
      positiveSignals: { status: "missing", items: null },
    });
    expect(
      mapSensitiveLeadEvidences(null, enabledAccess, null),
    ).toEqual({ status: "missing", content: null });
  });

  it("maps approved evidence fields and only exact-host HTTPS URLs", () => {
    expect(
      mapSensitiveLeadEvidences(
        [
          {
            title: "Synthetic source",
            summary: "Synthetic approved summary",
            url: "https://evidence.example.com/report/123",
            hidden: "must not be exposed",
          },
        ],
        enabledAccess,
        null,
      ),
    ).toEqual({
      status: "available",
      content: [
        {
          title: "Synthetic source",
          summary: "Synthetic approved summary",
          url: "https://evidence.example.com/report/123",
        },
      ],
    });
  });

  it.each([
    "http://evidence.example.com/report",
    "https://sub.evidence.example.com/report",
    "https://evidence.example.com:8443/report",
    "https://user:password@evidence.example.com/report",
  ])("withholds a non-approved evidence URL: %s", (url) => {
    expect(
      mapSensitiveLeadEvidences(
        [{ title: "Synthetic source", url }],
        enabledAccess,
        null,
      ),
    ).toEqual({
      status: "available",
      content: [
        { title: "Synthetic source", summary: null, url: null },
      ],
    });
  });

  it("rejects malformed evidence shapes without exposing partial content", () => {
    expect(
      mapSensitiveLeadEvidences(
        [{ title: "Synthetic source", summary: "<b>unsafe</b>" }],
        enabledAccess,
        null,
      ),
    ).toEqual({ status: "unavailable", content: null });
  });
});
