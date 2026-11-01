/**
 * Startup order for the 3D scene, kept free of WebGL so tests can drive every branch.
 *
 * A cold shader link can block the main thread for hundreds of milliseconds. The scene
 * queues the programs for its visible state before calling this. The sequence then waits
 * for them without blocking where KHR_parallel_shader_compile reports progress, draws the
 * first frame, compiles one weather/festival variant per task and waits for those programs
 * too. Input opens only after that (AGENTS.md: shaders for every state before interaction).
 */
export type StartupOutcome = "interactive" | "stopped";

export interface StartupSteps {
  /** True while queued programs are still linking. A thrown query counts as finished. */
  programsPending: () => boolean;
  /** True once the scene is disposed or its WebGL context is lost. */
  stopped: () => boolean;
  /** Draws the first frame and starts what must wait for it. */
  firstFrame: () => void;
  /** Compiles variant `index` and returns the total number of variants. */
  warmVariant: (index: number) => number;
}

export interface StartupClock {
  pollMs: number;
  /** Cap for each wait; afterwards startup continues and a program links on first use. */
  timeoutMs: number;
  now: () => number;
  setTimer: (callback: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}

export function runStartupSequence(steps: StartupSteps, clock: StartupClock) {
  let timer = 0;
  let settled = false;
  let resolveReady!: (outcome: StartupOutcome) => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<StartupOutcome>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const settle = (finish: () => void) => {
    if (settled) return;
    settled = true;
    clock.clearTimer(timer);
    finish();
  };
  const stop = () => settle(() => resolveReady("stopped"));
  // A throwing step rejects `ready`, so the viewport shows its fallback instead of waiting.
  const run = (step: () => void) => {
    if (settled) return;
    try {
      step();
    } catch (error) {
      settle(() => rejectReady(error));
    }
  };
  const later = (step: () => void, ms: number) => {
    timer = clock.setTimer(() => run(step), ms);
  };
  const pending = () => {
    try {
      return steps.programsPending();
    } catch {
      // A failed status query must not keep the scene behind the loading screen.
      return false;
    }
  };
  const afterPrograms = (next: () => void) => {
    const deadline = clock.now() + clock.timeoutMs;
    const poll = () => {
      if (steps.stopped()) stop();
      else if (clock.now() < deadline && pending()) later(poll, clock.pollMs);
      else next();
    };
    poll();
  };
  const warm = (index: number) => {
    if (steps.stopped()) return stop();
    const total = steps.warmVariant(index);
    if (index + 1 < total) later(() => warm(index + 1), 0);
    else afterPrograms(() => settle(() => resolveReady("interactive")));
  };
  // Begin after the caller returns, as a resolved promise callback would.
  queueMicrotask(() =>
    run(() =>
      afterPrograms(() => {
        steps.firstFrame();
        warm(0);
      }),
    ),
  );
  return { ready, stop };
}
