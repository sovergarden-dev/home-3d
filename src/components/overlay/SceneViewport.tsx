import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SITE_CONFIG } from "@/config/site";
import { useT } from "@/i18n";
import { useAppStore, type Language } from "@/state/appStore";
import { StaticScene } from "./StaticScene";

function ViewportInner() {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const sceneStatus = useAppStore((s) => s.sceneStatus);
  const viewMode = useAppStore((s) => s.viewMode);
  const host = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const runtime = useRef<ReturnType<typeof import("@/engine/demoScene").createDemoScene> | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const recoveryAttempts = useRef(0);
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
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const store = useAppStore.getState();
    store.setLoadingProgress(0.15);
    useAppStore.setState({ sceneStatus: "loading" });
    import("@/engine/demoScene")
      .then(({ createDemoScene }) => {
        if (cancelled || !host.current || !marker.current) return;
        store.setLoadingProgress(0.55);
        try {
          const created = createDemoScene(host.current, marker.current, () => {
            if (cancelled) return;
            runtime.current?.dispose();
            runtime.current = null;
            setFailed(true);
            useAppStore.setState({ sceneStatus: "fallback" });
            // A loss during startup must not leave the splash over the recovery card.
            store.setLoadingProgress(1);
            if (recoveryAttempts.current === 0) {
              recoveryAttempts.current++;
              setRecovering(true);
              recoveryTimer = setTimeout(() => {
                if (!cancelled) setAttempt((value) => value + 1);
              }, 250);
            }
          });
          runtime.current = created;
          setRecovering(false);
          setFailed(false);
          store.setLoadingProgress(0.85);
          // Controls and the splash wait until startup drew and compiled every variant.
          // A stopped startup was disposed or lost its context; that path owns the UI.
          created.ready.then(
            (outcome) => {
              if (cancelled || runtime.current !== created || outcome !== "interactive") return;
              useAppStore.setState({ sceneStatus: "ready" });
              store.setLoadingProgress(1);
            },
            () => {
              if (cancelled || runtime.current !== created) return;
              created.dispose();
              runtime.current = null;
              setFailed(true);
              useAppStore.setState({ sceneStatus: "fallback" });
              store.setLoadingProgress(1);
            },
          );
        } catch {
          setRecovering(false);
          setFailed(true);
          useAppStore.setState({ sceneStatus: "fallback" });
          store.setLoadingProgress(1);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRecovering(false);
        setFailed(true);
        useAppStore.setState({ sceneStatus: "fallback" });
        store.setLoadingProgress(1);
      });
    return () => {
      cancelled = true;
      clearTimeout(recoveryTimer);
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
      data-recovery-attempts={recoveryAttempts.current}
      className="absolute inset-0 touch-none select-none overflow-hidden"
      style={{ background: "var(--gradient-scene)" }}
    >
      <div ref={host} data-testid="demo-scene" className="absolute inset-0" />
      {failed && <StaticScene />}
      <div
        ref={marker}
        data-testid="world-center-marker"
        className={`pointer-events-none absolute left-0 top-0 z-10 ${failed ? "hidden" : ""}`}
        style={{ visibility: "hidden" }}
      >
        <div className="rounded-xl border border-white/70 bg-primary px-3 py-2 text-center text-xs text-primary-foreground shadow-lg">
          <span className="block font-medium">{SITE_CONFIG.homeLabel[lang]}</span>
          <span className="block opacity-80">{t.unmeasuredBoundary}</span>
        </div>
        <div className="mx-auto h-3 w-px bg-primary" />
      </div>
      {failed ? (
        <div
          className={`pointer-events-none absolute inset-0 z-40 grid px-6 ${shortLandscape ? "items-start justify-start" : "place-items-center"}`}
        >
          <div
            className={`pointer-events-auto glass max-w-sm p-6 text-center ${shortLandscape ? "absolute right-4 top-20 w-[200px] max-w-[calc(100vw-3rem)] p-3 text-left" : ""}`}
            role="status"
          >
            <p className="font-serif text-xl italic text-primary">
              {recovering ? t.recoveringScene : t.fallbackTitle}
            </p>
            <p className={`mt-3 text-sm text-muted-foreground ${shortLandscape ? "hidden" : ""}`}>
              {t.fallbackBody}
            </p>
            <button
              type="button"
              className={`chip mt-4 ${shortLandscape ? "mt-2" : ""}`}
              onClick={() => {
                recoveryAttempts.current = 0;
                setRecovering(false);
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
              disabled={recovering}
            >
              {t.retryScene}
            </button>
          </div>
        </div>
      ) : viewMode !== "topdown" ? (
        <p className="pointer-events-none absolute bottom-32 left-4 hidden max-w-[230px] rounded-lg bg-background/80 px-3 py-2 text-xs text-foreground sm:bottom-5 sm:block">
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
