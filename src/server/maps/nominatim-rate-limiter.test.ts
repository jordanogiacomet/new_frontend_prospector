import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { scheduleNominatimRequest } from "./nominatim-rate-limiter";

describe("Nominatim request rate limiter", () => {
  it("serializes request starts at least one second apart", async () => {
    let currentTime = 1_000;
    const starts: number[] = [];
    const waits: number[] = [];
    const dependencies = {
      now: () => currentTime,
      sleep: async (milliseconds: number) => {
        waits.push(milliseconds);
        currentTime += milliseconds;
      },
    };

    const results = await Promise.all([
      scheduleNominatimRequest(async () => {
        starts.push(currentTime);
        return "first";
      }, dependencies),
      scheduleNominatimRequest(async () => {
        starts.push(currentTime);
        return "second";
      }, dependencies),
      scheduleNominatimRequest(async () => {
        starts.push(currentTime);
        return "third";
      }, dependencies),
    ]);

    expect(results).toEqual(["first", "second", "third"]);
    expect(starts).toEqual([1_000, 2_000, 3_000]);
    expect(waits).toEqual([1_000, 1_000]);
  });
});

