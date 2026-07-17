import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isDemo2TestRunVisibilityEnabled,
  isDemoDataEnabled,
} from "./mode";

describe("Demo 2 run visibility", () => {
  it("requires every approved server-side Demo 2 control", () => {
    const approved = {
      DEMO2_FULL_ACCESS_ENABLED: "true",
      AUTH_DEV_BYPASS_ENABLED: "true",
      DEMO2_K8S_RUNTIME_ENABLED: "true",
      NODE_ENV: "production",
      FEATURE_DEMO_DATA_ENABLED: "false",
    };

    expect(isDemo2TestRunVisibilityEnabled(approved)).toBe(true);
    expect(
      isDemo2TestRunVisibilityEnabled({
        ...approved,
        AUTH_DEV_BYPASS_ENABLED: "false",
      }),
    ).toBe(false);
    expect(
      isDemo2TestRunVisibilityEnabled({
        ...approved,
        FEATURE_DEMO_DATA_ENABLED: "true",
      }),
    ).toBe(false);
    expect(
      isDemo2TestRunVisibilityEnabled({
        ...approved,
        DEMO2_K8S_RUNTIME_ENABLED: "false",
      }),
    ).toBe(false);
  });

  it("keeps the separate synthetic fixture flag unchanged", () => {
    expect(isDemoDataEnabled({ FEATURE_DEMO_DATA_ENABLED: "true" })).toBe(
      true,
    );
    expect(isDemoDataEnabled({ FEATURE_DEMO_DATA_ENABLED: "false" })).toBe(
      false,
    );
  });
});
