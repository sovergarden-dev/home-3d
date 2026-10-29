import { expect, it, vi } from "vitest";
import { acquireAudioPreparation } from "@/engine/life/audioPreparation";
import { createSyntheticBuffer } from "@/engine/life/audioSynthesis";
it("prepares the same six-second PCM without an AudioContext and cancels pending slices on release", () => {
  vi.useFakeTimers();
  const preparation = acquireAudioPreparation();
  const context = {
    sampleRate: 48000,
    createBuffer(_channels: number, length: number, rate: number) {
      const data = new Float32Array(length);
      return { sampleRate: rate, duration: length / rate, getChannelData: () => data };
    },
  } as unknown as AudioContext;
  try {
    preparation.prepare("sunny");
    expect(preparation.buffer(context, "sunny")).toBeNull();
    vi.runAllTimers();
    for (const weather of ["sunny", "rain"] as const) {
      const prepared = preparation.buffer(context, weather)!;
      expect(prepared.duration).toBe(6);
      const actual = prepared.getChannelData(0);
      const expected = createSyntheticBuffer(context, weather, 0.1).getChannelData(0);
      // Compare every PCM byte without building a 288,000-element assertion tree.
      expect(
        Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength).equals(
          Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
        ),
      ).toBe(true);
    }
    preparation.prepare("storm");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    preparation.dispose();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    preparation.dispose();
    vi.useRealTimers();
  }
});
