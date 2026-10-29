import { worldDataProvider } from "@/world/privateWorldSession";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  const manifest = useRef<File | null>(null);
  const [showImport, setShowImport] = useState(false);
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
          {t.life.label} ·{" "}
          {status.audio === "local"
            ? t.life.localAudio
            : status.audio === "error"
              ? t.life.audioError
              : t.life.audio}
        </span>
      </div>
      <label className="flex items-center gap-2 text-xs">
        {t.life.density}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.lifeDensity}
          onChange={(e) => state.setLifeDensity(+e.target.value)}
          className="h-11 min-w-0 flex-1 accent-[var(--accent)]"
        />
      </label>
      <p className="text-xs text-muted-foreground">{t.life.note}</p>
      {status.reason && (
        <p role="status" className="text-xs">
          {t.life.noGraph}
        </p>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={state.illustrativeDetails}
        onClick={() => state.setIllustrativeDetails(!state.illustrativeDetails)}
        className="chip"
      >
        {t.life.details}
      </button>
      {state.illustrativeDetails && (
        <p className="text-xs text-muted-foreground" role="status">
          {t.life.detailsNote}
        </p>
      )}
      <details onToggle={(e) => setShowImport(e.currentTarget.open)}>
        <summary className="ctl cursor-pointer justify-start text-xs">{t.life.importAudio}</summary>
        {showImport && (
          <div className="space-y-2 text-xs">
            <p>{t.life.importNote}</p>
            <label className="block">
              {t.life.manifest}
              <input
                type="file"
                accept="application/json,.json"
                className="block min-h-11 w-full"
                onChange={(e) => {
                  manifest.current = e.target.files?.[0] ?? null;
                }}
              />
            </label>
            <label className="block">
              {t.life.clip}
              <input
                type="file"
                accept="audio/wav,audio/mpeg,audio/ogg,audio/mp4"
                className="block min-h-11 w-full"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && manifest.current)
                    sendLifeCommand({ kind: "audio", file, manifest: manifest.current });
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
      </details>
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
        <span className="text-xs font-medium">{t.life.label}</span>
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
        </>
      )}
    </section>
  );
}
