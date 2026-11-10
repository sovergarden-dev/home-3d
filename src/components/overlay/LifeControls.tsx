import { worldDataProvider } from "@/world/privateWorldSession";
import { useEffect, useSyncExternalStore } from "react";
import { useAppStore } from "@/state/appStore";
import { useT } from "@/i18n";
import {
  getLifeStatus,
  getLifeServerStatus,
  sendLifeCommand,
  subscribeLifeStatus,
} from "@/engine/life/session";

export function LifeControls() {
  const t = useT();
  const state = useAppStore();
  const status = useSyncExternalStore(subscribeLifeStatus, getLifeStatus, getLifeServerStatus);
  return (
    <div className="space-y-2 border-t border-border pt-2" data-testid="life-controls">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={state.lifeEnabled}
          onClick={() => state.setLifeEnabled(!state.lifeEnabled)}
          className="chip"
        >
          {t.life.layer}
        </button>
        <span className="text-xs text-muted-foreground">
          {t.life.label} · {t.life.audio}
        </span>
      </div>
      {status.reason && (
        <p role="status" className="text-xs">
          {t.life.noGraph}
        </p>
      )}
    </div>
  );
}

export function PovControls() {
  const world = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const t = useT();
  const state = useAppStore();
  const status = useSyncExternalStore(subscribeLifeStatus, getLifeStatus, getLifeServerStatus);
  const active = state.viewMode === "walk" || state.viewMode === "ride";
  useEffect(() => () => sendLifeCommand({ kind: "move", forward: 0, right: 0 }), []);
  if (!active) return null;
  const moveButton = (label: string, forward: number, right: number, text: string) => (
    <button
      type="button"
      aria-label={label}
      className="ctl bg-secondary text-primary touch-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        sendLifeCommand({ kind: "move", forward, right });
      }}
      onPointerUp={() => sendLifeCommand({ kind: "move", forward: 0, right: 0 })}
      onPointerCancel={() => sendLifeCommand({ kind: "move", forward: 0, right: 0 })}
      onLostPointerCapture={() => sendLifeCommand({ kind: "move", forward: 0, right: 0 })}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          sendLifeCommand({ kind: "move", forward, right });
        }
      }}
      onKeyUp={() => sendLifeCommand({ kind: "move", forward: 0, right: 0 })}
      onBlur={() => sendLifeCommand({ kind: "move", forward: 0, right: 0 })}
    >
      {text}
    </button>
  );
  return (
    <section
      aria-label={t.viewMode[state.viewMode]}
      className="p9-pov-controls pointer-events-auto glass p-2 space-y-1"
    >
      <div className="flex flex-wrap gap-1 items-center">
        <span className="p9-style-label text-xs font-medium">{t.life.label}</span>
        {state.viewMode === "ride" && (
          <button
            type="button"
            className="chip"
            onClick={() => state.setRidePaused(!state.ridePaused)}
            aria-pressed={state.ridePaused}
          >
            {state.ridePaused ? t.life.resume : t.life.pause}
          </button>
        )}
        <button type="button" className="chip" onClick={() => state.setViewMode("diorama")}>
          {t.life.exit}
        </button>
      </div>
      <p className="text-xs max-w-72">
        {state.viewMode === "walk" ? t.life.walkHelp : t.life.rideHelp}
      </p>
      {state.viewMode === "walk" ? (
        <div className="flex gap-1">
          {moveButton(t.life.left, 0, -1, "←")}
          {moveButton(t.life.forward, 1, 0, "↑")}
          {moveButton(t.life.back, -1, 0, "↓")}
          {moveButton(t.life.right, 0, 1, "→")}
          <button
            type="button"
            className="ctl px-2 text-xs"
            onClick={() => sendLifeCommand({ kind: "pointerLock" })}
          >
            {t.life.lock}
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs max-w-72">
            {status.rideEnded
              ? t.life.ended
              : world.mode === "fixture" || ("world" in world && world.world.manifest.isSynthetic)
                ? t.life.syntheticDestination
                : t.life.route}
          </p>
          <div className="p9-orientation-row flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="ctl px-2 text-xs"
              onClick={() => sendLifeCommand({ kind: "orientation" })}
            >
              {t.life.tilt}
            </button>
            <span role="status" className="block text-xs">
              {status.orientation === "granted"
                ? t.life.tiltGranted
                : status.orientation === "denied"
                  ? t.life.tiltDenied
                  : status.orientation === "unsupported"
                    ? t.life.tiltUnsupported
                    : t.life.tiltOff}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
