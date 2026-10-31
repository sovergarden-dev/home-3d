import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoAudio } from "@/engine/demoAudio";
import { AUDIO_PEAK_LIMIT, createPeriodicNoise, synthSample } from "@/engine/life/audioSynthesis";
import { importLocalAudioFile } from "@/engine/life/audioImport";
import { webcrypto } from "node:crypto";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
const audios: ReturnType<typeof createDemoAudio>[] = [];
class FakeNode extends EventTarget {
  connections = 0;
  disconnected = 0;
  connect() {
    this.connections++;
    return this;
  }
  disconnect() {
    this.disconnected++;
  }
}
class FakeGain extends FakeNode {
  gain = {
    value: 1,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}
class FakeOscillator extends FakeNode {
  frequency = { value: 0 };
  type = "sine";
  started = 0;
  stopped = 0;
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
}
class FakeSource extends FakeNode {
  buffer: unknown;
  loop = false;
  startCount = 0;
  start() {
    this.startCount++;
  }
  stop() {
    this.dispatchEvent(new Event("ended"));
  }
}
class FakeContext extends EventTarget {
  state: AudioContextState = "suspended";
  currentTime = 0;
  sampleRate = 100;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  sources: FakeSource[] = [];
  createGain() {
    return new FakeGain() as unknown as GainNode;
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: {},
      knee: {},
      ratio: {},
      attack: {},
      release: {},
    }) as unknown as DynamicsCompressorNode;
  }
  createBufferSource() {
    const n = new FakeSource();
    this.sources.push(n);
    return n as unknown as AudioBufferSourceNode;
  }
  createOscillator() {
    const n = new FakeOscillator();
    this.oscillators.push(n);
    return n as unknown as OscillatorNode;
  }
  createStereoPanner() {
    return Object.assign(new FakeNode(), { pan: { value: 0 } }) as unknown as StereoPannerNode;
  }
  createBuffer(_channels: number, length: number) {
    return { length, getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
  }
  decodeAudioData() {
    return Promise.resolve(this.createBuffer(1, 2));
  }
  resume() {
    this.state = "running";
    this.dispatchEvent(new Event("statechange"));
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    this.dispatchEvent(new Event("statechange"));
    for (const oscillator of this.oscillators) oscillator.dispatchEvent(new Event("ended"));
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    this.dispatchEvent(new Event("statechange"));
    return Promise.resolve();
  }
}
function makeAudio() {
  const audio = createDemoAudio({
    audioContextFactory: () => new FakeContext() as unknown as AudioContext,
  });
  audios.push(audio);
  return audio;
}
afterEach(() => {
  for (const audio of audios.splice(0)) audio.dispose();
});

describe("P9 audio lifecycle", () => {
  it("is lazy, has no listener/node leak across repeated on/off, and pauses on pagehide", () => {
    const factory = vi.fn(() => new FakeContext() as unknown as AudioContext);
    const audio = createDemoAudio({ audioContextFactory: factory });
    audios.push(audio);
    audio.set(true, true);
    expect(factory).not.toHaveBeenCalled();
    audio.gesture();
    expect(factory).toHaveBeenCalledTimes(1);
    const first = audio.getDiagnostics();
    for (let i = 0; i < 3; i++) {
      audio.set(false, false);
      audio.set(true, true);
    }
    expect(audio.getDiagnostics().contextCount).toBe(1);
    expect(audio.getDiagnostics().listenerCount).toBe(first.listenerCount);
    window.dispatchEvent(new Event("pagehide"));
    expect(audio.getDiagnostics().contextState).toBe("suspended");
  });

  it("keeps the worst-case concurrent synthetic mix under the explicit peak bound", () => {
    const master = 0.22,
      ambience = 0.32,
      rain = 0.28,
      voices = 8 * 0.12,
      imported = 0.16;
    expect(master * (ambience + rain + voices + imported)).toBeLessThanOrEqual(AUDIO_PEAK_LIMIT);
    for (const weather of ["clear", "rain", "storm"] as const)
      for (let i = 0; i <= 5000; i++)
        expect(Math.abs(synthSample(i / 5000, weather))).toBeLessThanOrEqual(AUDIO_PEAK_LIMIT);
  });

  it("keeps periodic seam derivative bounded and minutes changes synthesis duration", () => {
    const noise = createPeriodicNoise(2049);
    expect(noise[0]).toBe(noise[2048]);
    expect(Math.abs(noise[1]! - noise[0]!)).toBeLessThan(0.9);
    const context = new FakeContext();
    const short = (context.createBuffer(1, 100) as AudioBuffer).length;
    expect(short).toBe(100);
    const audio = makeAudio();
    audio.set(true, false, { minutes: 2 });
    audio.gesture();
    expect(audio.getDiagnostics().contextCreated).toBe(true);
  });

  it("stops and cleans all eight voices, and validates every manifest identity field", async () => {
    const audio = makeAudio();
    audio.set(true, false, { fixture: false });
    audio.gesture();
    for (let i = 0; i < 8; i++)
      expect(audio.passby({ position: [0, 0, 0], level: 0.1 })).toBe(true);
    expect(audio.getDiagnostics().activeVoices).toBe(8);
    audio.suspend();
    expect(audio.getDiagnostics().activeVoices).toBe(0);
    const file = new File([new Uint8Array([1, 2, 3])], "fixture.wav", { type: "audio/wav" });
    const valid = await importLocalAudioFile(file);
    await expect(
      importLocalAudioFile(file, 1000, { ...valid.manifest, name: "other.wav" }),
    ).resolves.toMatchObject({ ok: false, reason: "manifest-mismatch" });
    await expect(importLocalAudioFile(file, 1000, {})).resolves.toMatchObject({
      ok: false,
      reason: "manifest-mismatch",
    });
  });
});

it("publishes native audio state changes and removes the callback on disposal", async () => {
  const context = new FakeContext(),
    changed = vi.fn();
  const audio = createDemoAudio({
    audioContextFactory: () => context as unknown as AudioContext,
    onStateChange: changed,
  });
  audios.push(audio);
  audio.gesture();
  audio.set(true, false);
  await Promise.resolve();
  expect(changed).toHaveBeenCalled();
  changed.mockClear();
  audio.set(false, false);
  expect(changed).toHaveBeenCalledTimes(1);
  audio.dispose();
  changed.mockClear();
  context.dispatchEvent(new Event("statechange"));
  expect(changed).not.toHaveBeenCalled();
});
