import { describe, expect, it } from "vitest";
import { runStartupSequence, type StartupClock, type StartupSteps } from "./startupSequence";

/** A manual task queue: each due timer runs as its own task, logged as "task". */
function manualClock(log: string[]) {
  let time = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: StartupClock = {
    pollMs: 10,
    timeoutMs: 10_000,
    now: () => time,
    setTimer(callback, ms) {
      const id = nextId++;
      timers.set(id, { at: time + ms, callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
  };
  return {
    clock,
    pendingTimers: () => timers.size,
    advance(ms: number) {
      const end = time + ms;
      for (;;) {
        let due: [number, { at: number; callback: () => void }] | undefined;
        for (const entry of timers)
          if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) break;
        timers.delete(due[0]);
        time = Math.max(time, due[1].at);
        log.push("task");
        due[1].callback();
      }
      time = end;
    },
  };
}

function track(ready: Promise<string>) {
  let state = "pending";
  ready.then(
    (outcome) => (state = outcome),
    () => (state = "rejected"),
  );
  return () => state;
}

const microtasks = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function steps(log: string[], overrides: Partial<StartupSteps> = {}): StartupSteps {
  return {
    programsPending: () => {
      log.push("poll");
      return false;
    },
    stopped: () => false,
    firstFrame: () => log.push("frame"),
    warmVariant: (index) => {
      log.push(`warm ${index}`);
      return 3;
    },
    ...overrides,
  };
}

describe("scene startup sequence", () => {
  it("waits for queued programs, draws, warms one variant per task and opens input last", async () => {
    const log: string[] = [];
    const { clock, advance, pendingTimers } = manualClock(log);
    let linking = true;
    const startup = runStartupSequence(
      steps(log, {
        programsPending: () => {
          log.push("poll");
          return linking;
        },
        warmVariant: (index) => {
          log.push(`warm ${index}`);
          // Each variant queues programs of its own.
          linking = true;
          return 3;
        },
      }),
      clock,
    );
    const outcome = track(startup.ready);
    // Nothing runs before the caller returns: the scene finishes wiring itself first.
    expect(log).toEqual([]);
    await microtasks();
    advance(20);
    expect(log).toEqual(["poll", "task", "poll", "task", "poll"]);
    linking = false;
    advance(10);
    expect(log).toEqual([
      ...["poll", "task", "poll", "task", "poll", "task", "poll"],
      ...["frame", "warm 0", "task", "warm 1", "task", "warm 2", "poll"],
    ]);
    await microtasks();
    expect(outcome()).toBe("pending");
    linking = false;
    advance(10);
    expect(log.slice(-2)).toEqual(["task", "poll"]);
    await microtasks();
    expect(outcome()).toBe("interactive");
    expect(pendingTimers()).toBe(0);
  });

  it("stops each wait at the timeout instead of waiting for a program that never reports", async () => {
    const log: string[] = [];
    const { clock, advance, pendingTimers } = manualClock(log);
    let polls = 0;
    let pollsBeforeFrame = 0;
    const startup = runStartupSequence(
      steps(log, {
        programsPending: () => {
          polls++;
          return true;
        },
        firstFrame: () => {
          pollsBeforeFrame = polls;
          log.push("frame");
        },
        warmVariant: () => 1,
      }),
      clock,
    );
    const outcome = track(startup.ready);
    await microtasks();
    advance(9_999);
    expect(log).not.toContain("frame");
    advance(1);
    expect(log.filter((entry) => entry === "frame")).toHaveLength(1);
    // One poll every 10 ms from 0 to 9990 ms, then the 10 s cap draws anyway.
    expect(pollsBeforeFrame).toBe(1_000);
    await microtasks();
    expect(outcome()).toBe("pending");
    advance(10_000);
    await microtasks();
    expect(outcome()).toBe("interactive");
    expect(polls).toBe(2_000);
    expect(pendingTimers()).toBe(0);
  });

  it("treats a failing status query as finished", async () => {
    const log: string[] = [];
    const { clock, advance } = manualClock(log);
    const startup = runStartupSequence(
      steps(log, {
        programsPending: () => {
          throw new Error("status query failed");
        },
        warmVariant: (index) => {
          log.push(`warm ${index}`);
          return 2;
        },
      }),
      clock,
    );
    await microtasks();
    advance(0);
    expect(log).toEqual(["frame", "warm 0", "task", "warm 1"]);
    await expect(startup.ready).resolves.toBe("interactive");
  });

  it("settles stopped without drawing when disposed or the context is lost before the first frame", async () => {
    for (const cause of ["dispose", "context loss"]) {
      const log: string[] = [];
      const { clock, advance, pendingTimers } = manualClock(log);
      let lost = false;
      const startup = runStartupSequence(
        steps(log, {
          programsPending: () => true,
          stopped: () => lost,
        }),
        clock,
      );
      const outcome = track(startup.ready);
      await microtasks();
      advance(30);
      if (cause === "dispose") startup.stop();
      else lost = true;
      advance(10);
      await microtasks();
      expect(outcome(), cause).toBe("stopped");
      expect(pendingTimers(), cause).toBe(0);
      advance(20_000);
      expect(log, cause).not.toContain("frame");
    }
  });

  it("settles stopped when the context is lost while variants warm", async () => {
    const log: string[] = [];
    const { clock, advance, pendingTimers } = manualClock(log);
    let lost = false;
    const startup = runStartupSequence(
      steps(log, {
        stopped: () => lost,
        warmVariant: (index) => {
          log.push(`warm ${index}`);
          if (index === 1) lost = true;
          return 5;
        },
      }),
      clock,
    );
    await microtasks();
    advance(0);
    await expect(startup.ready).resolves.toBe("stopped");
    expect(log.filter((entry) => entry.startsWith("warm"))).toEqual(["warm 0", "warm 1"]);
    expect(pendingTimers()).toBe(0);
  });

  it("rejects when a startup step throws, so the viewport can fall back", async () => {
    const log: string[] = [];
    const { clock, pendingTimers } = manualClock(log);
    const startup = runStartupSequence(
      steps(log, {
        firstFrame: () => {
          throw new Error("draw failed");
        },
      }),
      clock,
    );
    await expect(startup.ready).rejects.toThrow("draw failed");
    expect(log).not.toContain("warm 0");
    expect(pendingTimers()).toBe(0);
  });
});
