export interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface OrientationController {
  readonly supported: boolean;
  readonly permissionRequired: boolean;
  start(): Promise<"granted" | "denied" | "unsupported">;
  stop(): void;
  dispose(): void;
}

type OrientationWindow = Window & {
  DeviceOrientationEvent?: {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
};

export function createOrientationController(
  onSample: (sample: OrientationSample) => void,
  suppliedWindow?: OrientationWindow,
): OrientationController {
  const win =
    suppliedWindow ?? (typeof window !== "undefined" ? (window as OrientationWindow) : undefined);
  const eventType = "deviceorientation";
  const supported = Boolean(win && "DeviceOrientationEvent" in win);
  const permissionRequired = Boolean(win?.DeviceOrientationEvent?.requestPermission);
  let active = false;
  let disposed = false;
  let epoch = 0;
  const listener = (event: Event) => {
    if (!active || disposed) return;
    const value = event as DeviceOrientationEvent;
    if ([value.alpha, value.beta, value.gamma].some((item) => typeof item !== "number")) return;
    onSample({ alpha: value.alpha ?? 0, beta: value.beta ?? 0, gamma: value.gamma ?? 0 });
  };
  const stop = () => {
    epoch += 1;
    active = false;
    win?.removeEventListener(eventType, listener);
  };
  return {
    supported,
    permissionRequired,
    async start() {
      if (!win || !supported || disposed) return "unsupported";
      const requestEpoch = epoch;
      const request = win.DeviceOrientationEvent?.requestPermission;
      if (request) {
        let result: "granted" | "denied";
        try {
          result = await request();
        } catch {
          return "denied";
        }
        if (result !== "granted" || disposed || requestEpoch !== epoch) return "denied";
      }
      if (disposed || requestEpoch !== epoch) return "denied";
      if (!active) {
        active = true;
        win.addEventListener(eventType, listener);
      }
      return "granted";
    },
    stop,
    dispose() {
      disposed = true;
      stop();
    },
  };
}
