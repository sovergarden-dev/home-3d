/** Synthesized ambience, not a recording of a real street. Created only after a sound gesture. */
export function createDemoAudio() {
  let context: AudioContext | null = null;
  let gain: GainNode | null = null;
  return {
    set(enabled: boolean, rain: boolean) {
      if (!enabled) {
        if (context) void context.suspend().catch(() => {});
        return;
      }
      if (!context) {
        try {
          context = new AudioContext();
          gain = context.createGain();
          gain.gain.value = 0.045;
          gain.connect(context.destination);
          const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
          const channel = buffer.getChannelData(0);
          for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
          const noise = context.createBufferSource();
          noise.buffer = buffer;
          noise.loop = true;
          const filter = context.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 550;
          noise.connect(filter);
          filter.connect(gain);
          noise.start();
          const hum = context.createOscillator();
          hum.type = "sine";
          hum.frequency.value = 95;
          const humGain = context.createGain();
          humGain.gain.value = 0.06;
          hum.connect(humGain);
          humGain.connect(gain);
          hum.start();
        } catch {
          return;
        }
      }
      if (gain) gain.gain.setTargetAtTime(rain ? 0.09 : 0.045, context.currentTime, 0.2);
      void context.resume().catch(() => {});
    },
    dispose() {
      if (context) void context.close().catch(() => {});
      context = null;
      gain = null;
    },
  };
}
