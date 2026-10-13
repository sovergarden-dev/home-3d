import { useAppStore } from "@/state/appStore";
import { formatMinutes, useT } from "@/i18n";
import { MapPin } from "lucide-react";
import { vietnamTime } from "@/lib/vietnamTime";

export function TopInfo() {
  const t = useT();
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const weather = useAppStore((s) => s.weather);
  const weekday = t.weekdays[vietnamTime().weekday];

  return (
    <div className="pointer-events-auto glass px-4 py-3 sm:px-5 sm:py-4" aria-live="polite">
      <div className="font-sans text-4xl font-light tabular-nums tracking-tight text-primary sm:text-5xl">
        {formatMinutes(minutes)}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        {weekday} · {t.weather[weather]}
      </div>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {t.demoBadge}
      </p>
      <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{t.home}</span>
      </div>
    </div>
  );
}
