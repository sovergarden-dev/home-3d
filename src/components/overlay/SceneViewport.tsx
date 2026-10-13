import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";

function ViewportInner() {
  const t = useT();
  const sceneStatus = useAppStore((s) => s.sceneStatus);
  const viewMode = useAppStore((s) => s.viewMode);
  const host = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const runtime = useRef<ReturnType<typeof import("@/engine/demoScene").createDemoScene> | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [localPreview, setLocalPreview] = useState(false);
  useEffect(() => {
    setLocalPreview(new URLSearchParams(window.location.search).get("local-preview") === "1");
  }, []);
  useEffect(() => {
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
        className={`pointer-events-none absolute left-0 top-0 z-10 ${failed ? "hidden" : ""}`}
        style={{ visibility: "hidden" }}
      >
        <div className="rounded-xl border border-white/70 bg-primary px-3 py-2 text-center text-xs text-primary-foreground shadow-lg">
          <span className="block font-medium">{t.home}</span>
          <span className="block opacity-80">{t.emptyLot}</span>
        </div>
        <div className="mx-auto h-3 w-px bg-primary" />
      </div>
      <PrivateWorldPanel enabled={localPreview} />
      {failed ? (
        <div className="absolute inset-0 grid place-items-center px-6">
          <div className="glass max-w-sm p-6 text-center" role="status">
            <p className="font-serif text-xl italic text-primary">{t.fallbackTitle}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t.fallbackBody}</p>
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
              className="chip mt-4"
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
