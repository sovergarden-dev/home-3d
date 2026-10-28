import { useSyncExternalStore } from "react";
import { useAppStore } from "@/state/appStore";
import { formatMinutes, useT } from "@/i18n";
import { MapPin } from "lucide-react";
import { worldDataProvider } from "@/world/privateWorldSession";
import { BUILD_SHA, PUBLIC_BUILD_VERSION } from "@/config/buildInfo";
import { memorySession } from "@/memories/session";

const subscribeHydration = () => () => {};
const readGuest = () => memorySession.getSnapshot().guest;

export function TopInfo() {
  const t = useT();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const guest = useSyncExternalStore(memorySession.subscribe, readGuest, readGuest);
  const worldSnapshot = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const weather = useAppStore((s) =>
    s.realWeatherEnabled && s.realWeatherKind ? s.realWeatherKind : s.weather,
  );
  const live = useAppStore((s) => s.realWeatherEnabled);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const weekday = t.weekdays[new Date(`${selectedDate}T12:00:00+07:00`).getUTCDay()];

  return (
    <div
      className="h6-top-info pointer-events-auto glass px-4 py-3 sm:px-5 sm:py-4"
      aria-live="polite"
    >
      <div className="font-sans text-4xl font-light tabular-nums tracking-tight text-primary sm:text-5xl">
        {formatMinutes(minutes)}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {hydrated ? `${weekday} · ${selectedDate}` : "—"} · {t.weather[weather]}
      </div>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {worldSnapshot.mode === "private-error"
          ? t.localPreview.statusError
          : worldSnapshot.mode === "private"
            ? worldSnapshot.world.manifest.isSynthetic
              ? t.localPreview.syntheticPackage
              : t.privatePackageBadge
            : t.demoBadge}
      </p>
      {!guest && (
        <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span className="truncate">
            {worldSnapshot.mode === "fixture" ? t.home : t.referencePoint}
          </span>
        </div>
      )}
      <p className="mt-1 max-w-xs text-[10px] text-muted-foreground">
        {live
          ? t.weatherConnection.live
          : worldSnapshot.georeferenceReady
            ? t.atmosphere.localReference
            : t.atmosphere.simulation}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {t.life.label} · {t.life.audio}
      </p>
      <p
        className="mt-1 text-[10px] text-muted-foreground"
        data-testid="build-info"
        title={`${PUBLIC_BUILD_VERSION} · SHA ${BUILD_SHA ?? t.localPreview.buildUnknown}`}
      >
        {PUBLIC_BUILD_VERSION} · SHA {BUILD_SHA ?? t.localPreview.buildUnknown}
      </p>
    </div>
  );
}
