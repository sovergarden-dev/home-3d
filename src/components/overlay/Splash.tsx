import { useEffect, useState } from "react";
import { useAppStore } from "@/state/appStore";
import { useT } from "@/i18n";

export function Splash() {
  const t = useT();
  const progress = useAppStore((s) => s.loadingProgress);
  const setProgress = useAppStore((s) => s.setLoadingProgress);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (useAppStore.getState().loadingProgress >= 1) { setGone(true); return; }
    const id = window.setInterval(() => {
      const p = useAppStore.getState().loadingProgress;
      setProgress(p + 0.04 + Math.random() * 0.08);
      if (p >= 1) window.clearInterval(id);
    }, 90);
    return () => window.clearInterval(id);
  }, [setProgress]);

  useEffect(() => {
    if (progress >= 1) { const id = setTimeout(() => setGone(true), 450); return () => clearTimeout(id); }
    return undefined;
  }, [progress]);

  if (gone) return null;
  const done = progress >= 1;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 grid place-items-center bg-background transition-opacity duration-250 ${done ? "pointer-events-none opacity-0 delay-200" : "opacity-100"}`}
    >
      <div className="text-center">
        <h1 className="font-serif text-4xl italic text-primary sm:text-5xl">{t.appName}</h1>
        <p className="mt-2 font-serif italic text-muted-foreground">{t.tagline}</p>
        <div className="mx-auto mt-8 h-1 w-48 overflow-hidden rounded-full bg-secondary" aria-label={`${Math.round(progress * 100)}%`}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
