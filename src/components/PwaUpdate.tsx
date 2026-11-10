import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useAppStore } from "@/state/appStore";
import { useT } from "@/i18n";

export function PwaUpdate() {
  const t = useT();
  const titleId = useId();
  const descId = useId();
  const location = useLocation();
  const sceneStatus = useAppStore((state) => state.sceneStatus);
  const ready = location.pathname !== "/" || sceneStatus === "ready" || sceneStatus === "fallback";
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);
  const waiting = useRef<ServiceWorker | null>(null);
  const reloadRequested = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      !ready ||
      window.self !== window.top ||
      !("serviceWorker" in navigator)
    )
      return;
    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;
    let hadController = navigator.serviceWorker.controller !== null;
    const cleanups: (() => void)[] = [];
    const showWaiting = () => {
      if (cancelled || !registration?.waiting || !navigator.serviceWorker.controller) return;
      waiting.current = registration.waiting;
      setAvailable(true);
      setDismissed(false);
    };
    const updateFound = () => {
      const worker = registration?.installing;
      if (!worker) return;
      const changed = () => {
        if (worker.state === "installed") showWaiting();
      };
      worker.addEventListener("statechange", changed);
      cleanups.push(() => worker.removeEventListener("statechange", changed));
    };
    const controllerChanged = () => {
      if (reloadRequested.current) {
        window.location.reload();
        return;
      }
      if (hadController) {
        waiting.current = null;
        setAvailable(true);
        setDismissed(false);
      }
      hadController = true;
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((value) => {
        if (cancelled) return;
        registration = value;
        registration.addEventListener("updatefound", updateFound);
        showWaiting();
        updateFound();
        void registration.update().catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      registration?.removeEventListener("updatefound", updateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
      for (const cleanup of cleanups) cleanup();
      clearTimeout(retryTimer.current);
    };
  }, [ready]);
  useEffect(() => {
    if (!confirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirm(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm]);
  if (!available || dismissed) return null;
  const apply = () => {
    setConfirm(false);
    setFailed(false);
    setApplying(true);
    reloadRequested.current = true;
    const worker = waiting.current;
    if (!worker || worker.state === "activated" || worker.state === "redundant") {
      window.location.reload();
      return;
    }
    worker.postMessage({ type: "ACTIVATE_UPDATE" });
    retryTimer.current = setTimeout(() => {
      reloadRequested.current = false;
      setApplying(false);
      setFailed(true);
    }, 10000);
  };
  return (
    <>
      <div
        className="fixed bottom-28 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 rounded-xl border border-border bg-background p-3 shadow-lg"
        role="status"
        data-testid="pwa-update"
      >
        <p className="text-sm font-medium">
          {failed ? t.pwa.updateFailed : applying ? t.pwa.updating : t.pwa.updateReady}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="ctl px-3"
            disabled={applying}
            onClick={() => setConfirm(true)}
          >
            {t.pwa.reload}
          </button>
          <button
            type="button"
            className="ctl px-3"
            disabled={applying}
            onClick={() => setDismissed(true)}
          >
            {t.pwa.later}
          </button>
        </div>
      </div>
      {confirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
          >
            <div className="flex flex-col space-y-2 text-center sm:text-left">
              <h2 id={titleId} className="text-lg font-semibold text-foreground">
                {t.pwa.reloadTitle}
              </h2>
              <p id={descId} className="text-sm text-muted-foreground">
                {t.pwa.saveBeforeReload}
              </p>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirm(false)}
                className="ctl rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                {t.pwa.later}
              </button>
              <button
                type="button"
                onClick={apply}
                className="ctl rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t.pwa.reload}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
