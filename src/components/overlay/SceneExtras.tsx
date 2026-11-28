import { Clock, SlidersHorizontal, Sunset } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SITE_CONFIG } from "@/config/site";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";

export function SceneExtras() {
  const t = useT();
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const realTimeEnabled = useAppStore((s) => s.realTimeEnabled);
  const setMinutes = useAppStore((s) => s.setTimeOfDayMinutes);
  const setRealTimeEnabled = useAppStore((s) => s.setRealTimeEnabled);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const sunsetActive = !realTimeEnabled && minutes >= 1020 && minutes < 1110;
  const active = open || sunsetActive || realTimeEnabled;

  return (
    <div ref={containerRef} className="h6-scene-extras pointer-events-auto relative">
      {open && (
        <div
          id="scene-extras-popover"
          role="dialog"
          aria-label={t.extras.label}
          className="glass absolute bottom-full right-0 mb-2 flex min-w-52 flex-col gap-1.5 rounded-2xl p-2 shadow-lg"
        >
          <button
            type="button"
            data-testid="sunset-preset-toggle"
            aria-pressed={sunsetActive}
            onClick={() => {
              setRealTimeEnabled(false);
              setMinutes(SITE_CONFIG.sunsetMinutes);
              setOpen(false);
            }}
            className="chip min-h-11 justify-start gap-2 px-3 text-xs font-medium"
          >
            <Sunset className="h-4 w-4 shrink-0" />
            <span>{t.extras.sunset1745}</span>
          </button>
          <button
            type="button"
            data-testid="live-clock-toggle"
            aria-pressed={realTimeEnabled}
            onClick={() => setRealTimeEnabled(!realTimeEnabled)}
            className="chip min-h-11 justify-start gap-2 px-3 text-xs font-medium"
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>{t.extras.liveClock}</span>
          </button>
        </div>
      )}
      <button
        type="button"
        data-testid="scene-extras-toggle"
        aria-expanded={open}
        aria-controls="scene-extras-popover"
        aria-label={t.extras.label}
        title={t.extras.label}
        onClick={() => setOpen((value) => !value)}
        className={
          active
            ? "ctl h-11 w-11 rounded-2xl bg-primary text-primary-foreground shadow-lg"
            : "ctl glass h-11 w-11 rounded-2xl text-foreground hover:bg-secondary shadow-lg"
        }
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
