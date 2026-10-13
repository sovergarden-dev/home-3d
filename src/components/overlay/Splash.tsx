import { useEffect, useState } from "react";
import { useAppStore } from "@/state/appStore";
import { useT } from "@/i18n";

/** Progress is driven by actual lazy-import / scene initialization, not a simulated timer. */
export function Splash() {
  const t = useT();
  const progress = useAppStore((s) => s.loadingProgress);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (progress < 1) return;
    const id = window.setTimeout(() => setGone(true), 250);
    return () => window.clearTimeout(id);
  }, [progress]);
  if (gone) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-50 grid place-items-center bg-background transition-opacity duration-250 ${progress >= 1 ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="text-center">
        <h1 className="font-serif text-4xl italic text-primary sm:text-5xl">{t.appName}</h1>
        <p className="mt-2 font-serif italic text-muted-foreground">{t.tagline}</p>
        <div
          className="mx-auto mt-8 h-1 w-48 overflow-hidden rounded-full bg-secondary"
          aria-label={`${Math.round(progress * 100)}%`}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
