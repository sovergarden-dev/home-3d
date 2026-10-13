import { Link } from "@tanstack/react-router";
import { Camera, Info, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useAppStore, type Language } from "@/state/appStore";
import { useT } from "@/i18n";

export function TopActions() {
  const t = useT();
  const soundOn = useAppStore((s) => s.soundOn);
  const toggleSound = useAppStore((s) => s.toggleSound);
  const lang = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
      <div className="glass flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={t.sound}
          className="ctl px-3 text-foreground hover:bg-secondary"
        >
          {soundOn ? <Volume2 className="h-4 w-4 text-accent" /> : <VolumeX className="h-4 w-4" />}
          <span className="hidden sm:inline">{t.sound}</span>
        </button>
        <div role="radiogroup" aria-label={t.language} className="flex rounded-xl bg-secondary p-0.5">
          {(["vi", "en"] as Language[]).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={lang === l}
              onClick={() => setLanguage(l)}
              className="ctl min-w-[40px] px-2 text-xs uppercase aria-checked:bg-primary aria-checked:text-primary-foreground"
            >
              {l}
            </button>
          ))}
        </div>
        <Link to="/gioi-thieu" aria-label={t.about} className="ctl text-foreground hover:bg-secondary">
          <Info className="h-4 w-4" />
        </Link>
      </div>
      <button
        type="button"
        onClick={() => toast(t.captured)}
        className="ctl bg-accent px-4 text-accent-foreground shadow-[var(--shadow-soft)] hover:brightness-105"
      >
        <Camera className="h-4 w-4" />
        <span className="hidden sm:inline">{t.capture}</span>
      </button>
    </div>
  );
}
