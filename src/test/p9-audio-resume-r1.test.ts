// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoAudio } from "@/engine/demoAudio";

class FakeGain extends EventTarget {
  gain = {
    value: 1,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeSource extends EventTarget {
  buffer: unknown;
  loop = false;
  start() {}
  stop() {
    this.dispatchEvent(new Event("ended"));
  }
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeContext {
  state: AudioContextState = "suspended";
  currentTime = 0;
  sampleRate = 100;
  destination = new FakeGain();
  resumeCalls = 0;
  gains: FakeGain[] = [];
  private readonly resumeImpl: () => Promise<void>;
  constructor(resumeImpl?: () => Promise<void>) {
    this.resumeImpl =
      resumeImpl ??
      (() => {
        this.state = "running";
        return Promise.resolve();
      });
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeGain(), {
      threshold: {},
      knee: {},
      ratio: {},
      attack: {},
      release: {},
    }) as unknown as DynamicsCompressorNode;
  }
  createBufferSource() {
    return new FakeSource() as unknown as AudioBufferSourceNode;
  }
  createBuffer(_channels: number, length: number) {
    return { length, getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
  }
  resume() {
    this.resumeCalls += 1;
    return this.resumeImpl();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

const audios: ReturnType<typeof createDemoAudio>[] = [];
const contexts: FakeContext[] = [];
const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => {
  for (const audio of audios.splice(0)) audio.dispose();
  contexts.length = 0;
  setHidden(false);
});

describe("P9 audio resume regression R1", () => {
  function makeAudio(resumeImpl?: () => Promise<void>) {
    const context = new FakeContext(resumeImpl);
    contexts.push(context);
    const audio = createDemoAudio({
      audioContextFactory: () => context as unknown as AudioContext,
    });
    audios.push(audio);
    return { audio, context };
  }

  it("leaves sample and layer creation outside the gesture even for an already-running context", async () => {
    const { audio, context } = makeAudio();
    context.state = "running";
    audio.set(true, false);
    expect(audio.gesture()).toBe(true);
    expect(audio.getDiagnostics().totalNodeCount).toBe(2);
    await flush();
    expect(audio.getDiagnostics().totalNodeCount).toBe(6);
    expect(context.resumeCalls).toBe(0);
  });

  it("resumes again after an off/on cycle without rebuilding layers or duplicating a pending resume", async () => {
    const { audio, context } = makeAudio();
    audio.set(true, false);
    expect(audio.gesture()).toBe(true);
    await flush();
    expect(context.resumeCalls).toBe(1);
    audio.set(false, false);
    audio.set(true, false);
    audio.set(true, false);
    expect(context.resumeCalls).toBe(2);
    await flush();
    expect(audio.getDiagnostics().totalNodeCount).toBe(6);
  });

  it("resumes on visibility reveal and pageshow while enabled", async () => {
    const { audio, context } = makeAudio();
    audio.set(true, false);
    audio.gesture();
    await flush();
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(context.state).toBe("suspended");
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(context.resumeCalls).toBe(2);
    context.state = "suspended";
    window.dispatchEvent(new Event("pageshow"));
    await flush();
    expect(context.resumeCalls).toBe(3);
  });

  it("restores master gain after pagehide/pageshow", async () => {
    const { audio, context } = makeAudio();
    audio.set(true, false);
    audio.gesture();
    await flush();
    window.dispatchEvent(new Event("pagehide"));
    expect(context.gains[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.02);
    window.dispatchEvent(new Event("pageshow"));
    await flush();
    expect(context.gains[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.22, 0, 0.05);
    expect(context.state).toBe("running");
  });

  it.each(["off", "hidden"] as const)(
    "suspends a late resume when %s before completion",
    async (reason) => {
      let complete!: () => void;
      const pending = new Promise<void>((resolve) => {
        complete = resolve;
      });
      const { audio, context } = makeAudio(() => pending);
      audio.set(true, false);
      audio.gesture();
      if (reason === "off") audio.set(false, false);
      else {
        setHidden(true);
        document.dispatchEvent(new Event("visibilitychange"));
      }
      context.state = "running";
      complete();
      await flush();
      expect(context.state).toBe("suspended");
      expect(audio.getDiagnostics().totalNodeCount).toBe(2);
    },
  );

  it("reconciles an off/on that suspended the context behind an in-flight resume", async () => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const { audio, context } = makeAudio(() => {
      if (context.resumeCalls === 1) return pending;
      context.state = "running";
      return Promise.resolve();
    });
    audio.set(true, false);
    audio.gesture();
    audio.set(false, false);
    audio.set(true, false);
    // A suspend queued after the first resume can win before its promise callback.
    context.state = "suspended";
    complete();
    await flush();
    expect(context.resumeCalls).toBe(2);
    expect(context.state).toBe("running");
  });

  it("retries a rejected resume and ignores a late continuation after dispose", async () => {
    let rejectResume!: (error: Error) => void;
    let resolveResume!: () => void;
    const first = new Promise<void>((_, reject) => {
      rejectResume = reject;
    });
    const { audio, context } = makeAudio(() =>
      context.resumeCalls === 1 ? first : Promise.resolve(),
    );
    audio.set(true, false);
    audio.gesture();
    rejectResume(new Error("autoplay blocked"));
    await flush();
    audio.set(true, false);
    expect(context.resumeCalls).toBe(2);
    audio.dispose();
    resolveResume?.();
    await flush();
    expect(audio.getDiagnostics().contextCreated).toBe(false);
  });

  it("does not resume after package replacement until a new enabled gesture path", async () => {
    const { audio, context } = makeAudio();
    audio.set(true, false);
    audio.gesture();
    await flush();
    audio.notifyPackageReplaced();
    context.state = "suspended";
    audio.set(true, false);
    expect(context.resumeCalls).toBe(2);
    expect(audio.gesture()).toBe(true);
    await flush();
    expect(context.resumeCalls).toBe(2);
  });
});
