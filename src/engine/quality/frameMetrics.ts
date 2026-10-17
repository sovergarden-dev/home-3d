export interface FrameMetricsSnapshot {
  renderedFrames: number;
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  longestMs: number | null;
}

export interface FrameMetrics {
  record: (timestampMs: number, phase?: FramePhase) => void;
  reset: (phase?: FramePhase) => void;
  snapshot: () => FrameMetricsSnapshot;
  phaseSnapshot: (phase: FramePhase) => FrameMetricsSnapshot;
}
export type FramePhase = "active" | "idle" | "hidden";

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
  const state: Record<
    FramePhase,
    { previous: number | null; rendered: number; samples: number[] }
  > = {
    active: { previous: null, rendered: 0, samples: [] },
    idle: { previous: null, rendered: 0, samples: [] },
    hidden: { previous: null, rendered: 0, samples: [] },
  };
  let currentPhase: FramePhase | null = null;
  const phaseSnapshot = (phase: FramePhase): FrameMetricsSnapshot => {
    const current = state[phase];
    return {
      renderedFrames: current.rendered,
      sampleCount: current.samples.length,
      p50Ms: percentile(current.samples, 0.5),
      p95Ms: percentile(current.samples, 0.95),
      longestMs: current.samples.length ? Math.max(...current.samples) : null,
    };
  };

  return {
    record(timestampMs, phase = "active") {
      if (!Number.isFinite(timestampMs)) throw new Error("FRAME_METRICS_TIMESTAMP_INVALID");
      const current = state[phase];
      if (currentPhase !== phase) {
        current.previous = null;
        currentPhase = phase;
      }
      current.rendered += 1;
      if (current.previous !== null) {
        const duration = Math.max(0, timestampMs - current.previous);
        current.samples.push(duration);
        if (current.samples.length > capacity) current.samples.shift();
      }
      current.previous = timestampMs;
    },
    reset(phase) {
      if (phase) state[phase].previous = null;
      else
        Object.values(state).forEach((value) => {
          value.previous = null;
        });
      currentPhase = null;
    },
    snapshot: () => phaseSnapshot("active"),
    phaseSnapshot,
  };
}
