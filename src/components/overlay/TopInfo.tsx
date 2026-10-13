import { useAppStore } from "@/state/appStore";
import { places } from "@/data/places";
import { formatMinutes, useT } from "@/i18n";
import { MapPin } from "lucide-react";

export function TopInfo() {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const weather = useAppStore((s) => s.weather);
  const placeId = useAppStore((s) => s.selectedPlaceId);
  const place = places.find((p) => p.id === placeId) ?? places[0]!;
  const weekday = t.weekdays[new Date().getDay()];

  return (
    <div className="pointer-events-auto glass px-4 py-3 sm:px-5 sm:py-4" aria-live="polite">
      <div className="font-sans text-4xl font-light tabular-nums tracking-tight text-primary sm:text-5xl">
        {formatMinutes(minutes)}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {weekday} · {t.weather[weather]}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{place.name[lang]}</span>
      </div>
    </div>
  );
}
