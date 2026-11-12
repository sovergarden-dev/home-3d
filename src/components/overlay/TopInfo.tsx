import { MapPin } from "lucide-react";
import { BUILD_SHA, PUBLIC_BUILD_VERSION } from "@/config/buildInfo";
import { SITE_CONFIG } from "@/config/site";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";

export function TopInfo() {
  const lang = useAppStore((s) => s.language);
  const t = useT();
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const weather = useAppStore((s) => s.weather);
  const activeWeather = SITE_CONFIG.weatherDisplay[weather];
  const periodKey = minutes < 720 ? "commute" : minutes < 1080 ? "noon" : "night";

  return (
    <div
      className="h6-top-info pointer-events-auto glass px-4 py-3 sm:px-5 sm:py-3.5"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-lg font-semibold text-primary sm:text-xl">
        <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="truncate" title={SITE_CONFIG.homeLabel[lang]}>
          {SITE_CONFIG.homeLabel[lang]}
        </span>
      </div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">
        {SITE_CONFIG.description[lang]} · {t.presets[periodKey]} · {t.weather[activeWeather]}
      </div>
      <a
        className="mt-1 inline-block text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        {t.mapAttribution}
      </a>
      <span className="mt-1 block text-[10px] text-muted-foreground" data-testid="build-info">
        {PUBLIC_BUILD_VERSION} · SHA {BUILD_SHA ?? t.localPreview.buildUnknown}
      </span>
    </div>
  );
}
