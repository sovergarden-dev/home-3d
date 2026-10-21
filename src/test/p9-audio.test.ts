import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoAudio } from "@/engine/demoAudio";
import { createPeriodicNoise, synthSample } from "@/engine/life/audioSynthesis";
import { importLocalAudioFile } from "@/engine/life/audioImport";

const contexts: ReturnType<typeof createDemoAudio>[] = [];
Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
afterEach(() => {
  for (const audio of contexts.splice(0)) audio.dispose();
  vi.restoreAllMocks();
});

describe("P9 synthetic audio", () => {
  function shortWav(): ArrayBuffer {
    const bytes = new Uint8Array(48);
    const view = new DataView(bytes.buffer);
    for (const [offset, text] of [
      [0, "RIFF"],
      [8, "WAVE"],
      [12, "fmt "],
      [36, "data"],
    ] as const)
      for (let index = 0; index < text.length; index += 1)
        bytes[offset + index] = text.charCodeAt(index);
    view.setUint32(4, 40, true);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(40, 8, true);
    return bytes.buffer.slice(0) as ArrayBuffer;
  }

  it("does not construct an AudioContext before a sound gesture", () => {
    const factory = vi.fn(() => {
      throw new Error("fake context should not be reached by set alone");
    });
    const audio = createDemoAudio({ audioContextFactory: factory });
    contexts.push(audio);
    audio.set(true, false);
    expect(factory).not.toHaveBeenCalled();
    expect(audio.getDiagnostics()).toMatchObject({ contextCreated: false, enabled: true });
    expect(audio.gesture()).toBe(false);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("creates a seamless periodic signal and keeps synthesis below the peak bound", () => {
    const noise = createPeriodicNoise(1025);
    expect(noise[0]).toBe(noise[1024]);
    for (let i = 0; i < 1024; i += 1) expect(Math.abs(noise[i]!)).toBeLessThanOrEqual(0.42);
    for (const weather of ["clear", "rain", "storm"] as const) {
      for (let i = 0; i < 2000; i += 1)
        expect(Math.abs(synthSample(i / 2000, weather))).toBeLessThanOrEqual(0.9);
    }
  });

  it("accepts only small local audio files and returns a SHA-256 manifest", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "fixture.wav", { type: "audio/wav" });
    const result = await importLocalAudioFile(file);
    expect(result.ok).toBe(true);
    expect(result.manifest).toMatchObject({ name: "fixture.wav", size: 3, type: "audio/wav" });
    expect(result.manifest?.sha256).toHaveLength(64);
    await expect(
      importLocalAudioFile(new File(["x"], "bad.txt", { type: "text/plain" })),
    ).resolves.toMatchObject({
      ok: false,
      status: "fallback",
      reason: "unsupported-type",
    });
    await expect(importLocalAudioFile(file, 2)).resolves.toMatchObject({
      ok: false,
      reason: "too-large",
    });
  });

  it("rejects missing or wrong manifests before accepting a valid WAV manifest", async () => {
    const file = new File([shortWav()], "short.wav", { type: "audio/wav" });
    await expect(importLocalAudioFile(file, 1_000_000, {})).resolves.toMatchObject({
      ok: false,
      status: "fallback",
      reason: "manifest-mismatch",
    });
    await expect(
      importLocalAudioFile(file, 1_000_000, {
        size: file.size,
        type: file.type,
        sha256: "0".repeat(64),
      }),
    ).resolves.toMatchObject({ ok: false, status: "fallback", reason: "manifest-mismatch" });
    const valid = await importLocalAudioFile(file);
    await expect(importLocalAudioFile(file, 1_000_000, valid.manifest)).resolves.toMatchObject({
      ok: true,
      status: "imported",
    });
  });
});
