export interface FrameMetricsSnapshot {
  renderedFrames: number;
  p50Ms: number | null;
  p95Ms: number | null;
  longestMs: number | null;
}

export interface FrameMetrics {
  record: (timestampMs: number) => void;
  snapshot: () => FrameMetricsSnapshot;
}

function percentile(samples: number[], percentileValue: number) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

export function createFrameMetrics(capacity = 240): FrameMetrics {
  if (!Number.isInteger(capacity) || capacity < 1)
    throw new Error("FRAME_METRICS_CAPACITY_INVALID");
  let previousTimestamp: number | null = null;
  let renderedFrames = 0;
  const samples: number[] = [];

  return {
    record(timestampMs) {
      if (!Number.isFinite(timestampMs)) throw new Error("FRAME_METRICS_TIMESTAMP_INVALID");
      renderedFrames += 1;
      if (previousTimestamp !== null) {
        const duration = Math.max(0, timestampMs - previousTimestamp);
        samples.push(duration);
        if (samples.length > capacity) samples.shift();
      }
      previousTimestamp = timestampMs;
    },
    snapshot() {
      return {
        renderedFrames,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
        longestMs: samples.length ? Math.max(...samples) : null,
      };
    },
  };
}
