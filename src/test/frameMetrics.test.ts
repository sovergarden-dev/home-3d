import { describe, expect, it } from "vitest";
import { createFrameMetrics } from "@/engine/quality/frameMetrics";

describe("frame metrics", () => {
  it("reports render-only p50, p95 and longest frame duration from bounded samples", () => {
    const metrics = createFrameMetrics(8);
    [0, 10, 20, 40, 50, 60].forEach((timestamp) => metrics.record(timestamp));

    expect(metrics.snapshot()).toEqual({ renderedFrames: 6, p50Ms: 10, p95Ms: 20, longestMs: 20 });
  });

  it("discards stale frames beyond its fixed sample capacity", () => {
    const metrics = createFrameMetrics(3);
    [0, 10, 20, 30, 70].forEach((timestamp) => metrics.record(timestamp));

    expect(metrics.snapshot()).toEqual({ renderedFrames: 5, p50Ms: 10, p95Ms: 40, longestMs: 40 });
  });
});
