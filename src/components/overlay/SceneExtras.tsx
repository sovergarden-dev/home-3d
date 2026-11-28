import { Clock, Download, SlidersHorizontal, Sparkles, Sunset } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SITE_CONFIG } from "@/config/site";
import { useT } from "@/i18n";
import { createPostcard, shareOrDownload } from "@/memories/postcard";
import { useAppStore, type Festival } from "@/state/appStore";

const FESTIVAL_OPTIONS: readonly Festival[] = ["normal", "tet", "midautumn"];

export function SceneExtras() {
  const t = useT();
  const ready = useAppStore((s) => s.sceneStatus === "ready");
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const realTimeEnabled = useAppStore((s) => s.realTimeEnabled);
  const festival = useAppStore((s) => s.festival);
  const setMinutes = useAppStore((s) => s.setTimeOfDayMinutes);
  const setRealTimeEnabled = useAppStore((s) => s.setRealTimeEnabled);
  const setFestival = useAppStore((s) => s.setFestival);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
  const active = open || sunsetActive || realTimeEnabled || festival !== "normal";

  const handleSavePostcard = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await createPostcard({
        ward: t.homePinSubtitle,
        date: selectedDate,
        minutes,
        mobile: true,
      });
      await shareOrDownload(result, "pho-nha-minh-2k.png", false);
      setNotice(t.extras.postcardSaved);
    } catch {
      setNotice(t.extras.postcardError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={containerRef} className="h6-scene-extras pointer-events-auto relative">
      {open && (
        <div
          id="scene-extras-popover"
          role="dialog"
          aria-label={t.extras.label}
          className="glass absolute bottom-full right-0 mb-2 flex min-w-56 max-w-[calc(100vw-2rem)] flex-col gap-1.5 rounded-2xl p-2 shadow-lg"
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

          <div
            role="radiogroup"
            aria-label={t.tabs.festival}
            className="mt-0.5 border-t border-border/60 pt-1.5"
          >
            <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t.tabs.festival}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {FESTIVAL_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  data-testid={`festival-${option}`}
                  aria-checked={festival === option}
                  onClick={() => setFestival(option)}
                  className="chip min-h-10 px-2.5 text-xs font-medium"
                >
                  {t.festival[option]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            data-testid="postcard-download-btn"
            disabled={!ready || saving}
            onClick={handleSavePostcard}
            className="chip mt-0.5 min-h-11 justify-start gap-2 border-t border-border/60 px-3 text-xs font-medium disabled:opacity-50"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>{saving ? t.extras.savingPostcard : t.extras.savePostcard}</span>
          </button>
          {notice && (
            <p role="status" className="px-1 text-[11px] text-muted-foreground">
              {notice}
            </p>
          )}
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
