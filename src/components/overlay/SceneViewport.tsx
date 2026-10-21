import { ClientOnly, useBlocker } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { centerMarkerLabels } from "@/components/overlay/centerMarkerLabels";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";
import { worldDataProvider } from "@/world/privateWorldSession";

function ViewportInner() {
  const t = useT();
  useBlocker({
    enableBeforeUnload: false,
    shouldBlockFn: ({ current, next }) => {
      const snapshot = worldDataProvider.getSnapshot();
      return (
        current.pathname !== next.pathname &&
        snapshot.mode === "private" &&
        snapshot.dirty &&
        !window.confirm(t.localPreview.confirmLeave)
      );
    },
  });
  const sceneStatus = useAppStore((s) => s.sceneStatus);
  const viewMode = useAppStore((s) => s.viewMode);
  const worldSnapshot = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const markerLabels = centerMarkerLabels(
    worldSnapshot.mode,
    t,
    worldSnapshot.centerConfirmation,
    worldSnapshot.temporaryLotIllustrationSelected,
  );
  const host = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const runtime = useRef<ReturnType<typeof import("@/engine/demoScene").createDemoScene> | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [shortLandscape, setShortLandscape] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px) and (max-height: 480px)");
    const update = () => setShortLandscape(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  // OrbitControls disconnects from canvas.getRootNode(). Dispose before React
  // detaches the host, otherwise its document key listener retains the old scene.
  useLayoutEffect(() => {
    let cancelled = false;
    const store = useAppStore.getState();
    store.setLoadingProgress(0.15);
    useAppStore.setState({ sceneStatus: "loading" });
    import("@/engine/demoScene")
      .then(({ createDemoScene }) => {
        if (cancelled || !host.current || !marker.current) return;
        store.setLoadingProgress(0.55);
        try {
          runtime.current = createDemoScene(host.current, marker.current, () => {
            runtime.current?.dispose();
            runtime.current = null;
            setFailed(true);
            useAppStore.setState({ sceneStatus: "fallback" });
          });
          setFailed(false);
          useAppStore.setState({ sceneStatus: "ready" });
        } catch {
          setFailed(true);
          useAppStore.setState({ sceneStatus: "fallback" });
        }
        store.setLoadingProgress(1);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        useAppStore.setState({ sceneStatus: "fallback" });
        store.setLoadingProgress(1);
      });
    return () => {
      cancelled = true;
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    runtime.current?.setLabel(t.sceneControls);
  }, [t.sceneControls, attempt, failed, sceneStatus]);
  return (
    <div
      id="scene-root"
      data-scene-state={sceneStatus}
      className="absolute inset-0 touch-none select-none overflow-hidden"
      style={{ background: "var(--gradient-scene)" }}
    >
      <div ref={host} data-testid="demo-scene" className="absolute inset-0" />
      <div
        ref={marker}
        data-testid="world-center-marker"
        className={`pointer-events-none absolute left-0 top-0 z-10 ${failed ? "hidden" : ""}`}
        style={{ visibility: "hidden" }}
      >
        <div className="rounded-xl border border-white/70 bg-primary px-3 py-2 text-center text-xs text-primary-foreground shadow-lg">
          <span className="block font-medium">{markerLabels.title}</span>
          {"illustration" in markerLabels ? (
            <span
              className="block opacity-90"
              data-testid="temporary-lot-illustration"
              data-illustrative-only="true"
              data-boundary-geometry="none"
            >
              {markerLabels.illustration}
            </span>
          ) : (
            <span className="block opacity-80">{markerLabels.description}</span>
          )}
        </div>
        <div className="mx-auto h-3 w-px bg-primary" />
      </div>
      <PrivateWorldPanel enabled />
      {failed ? (
        <div
          className={`pointer-events-none absolute inset-0 z-40 grid px-6 ${shortLandscape ? "items-start justify-start" : "place-items-center"}`}
        >
          <div
            className={`pointer-events-auto glass max-w-sm p-6 text-center ${shortLandscape ? "absolute right-4 top-20 w-[200px] max-w-[calc(100vw-3rem)] p-3 text-left" : ""}`}
            role="status"
          >
            <p className="font-serif text-xl italic text-primary">{t.fallbackTitle}</p>
            <p className={`mt-3 text-sm text-muted-foreground ${shortLandscape ? "hidden" : ""}`}>
              {t.fallbackBody}
            </p>
            <button
              type="button"
              className={`chip mt-4 ${shortLandscape ? "mt-2" : ""}`}
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              {t.retryScene}
            </button>
          </div>
        </div>
      ) : viewMode !== "topdown" ? (
        <p className="pointer-events-none absolute bottom-[112px] left-4 max-w-[200px] rounded-lg bg-background/80 px-3 py-2 text-xs text-foreground sm:bottom-5 sm:max-w-[230px]">
          {t.sceneHint}
        </p>
      ) : null}
    </div>
  );
}
export function SceneViewport() {
  return (
    <ClientOnly
      fallback={
        <div className="absolute inset-0" style={{ background: "var(--gradient-scene)" }} />
      }
    >
      <ViewportInner />
    </ClientOnly>
  );
}
