import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useAppStore } from "@/state/appStore";
import { useT } from "@/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PwaUpdate() {
  const t = useT();
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
  if (!available || dismissed) return null;
  const apply = () => {
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
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.pwa.reloadTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.pwa.saveBeforeReload}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.pwa.later}</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>{t.pwa.reload}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
