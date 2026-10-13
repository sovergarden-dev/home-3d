import { useAppStore, type Festival, type TimeSpeed, type Weather } from "@/state/appStore";
import { formatMinutes, useT } from "@/i18n";
import { Cloud, CloudRain, CloudLightning, Sun, Sparkles } from "lucide-react";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="ctl gap-2 px-2 text-sm text-foreground">
      <span className={`relative h-6 w-10 rounded-full transition-colors duration-200 ${checked ? "bg-primary" : "bg-border"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform duration-200 ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

const presets = [
  { m: 330, k: "dawn" }, { m: 420, k: "commute" }, { m: 720, k: "noon" }, { m: 930, k: "rainy" },
  { m: 1080, k: "sunset" }, { m: 1170, k: "night" }, { m: 1380, k: "late" }, { m: 180, k: "asleep" },
] as const;

export function TimePanel() {
  const t = useT();
  const { timeOfDayMinutes, setTimeOfDayMinutes, timeSpeed, setTimeSpeed, realTimeEnabled, setRealTimeEnabled, setWeather } = useAppStore();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-14 text-lg font-medium tabular-nums text-primary">{formatMinutes(timeOfDayMinutes)}</span>
        <input
          type="range" min={0} max={1439} step={1}
          value={timeOfDayMinutes}
          disabled={realTimeEnabled}
          aria-label={t.timeSlider}
          aria-valuetext={formatMinutes(timeOfDayMinutes)}
          onChange={(e) => setTimeOfDayMinutes(+e.target.value)}
          className="h-11 flex-1 accent-[var(--accent)] disabled:opacity-50"
        />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {presets.map((p) => (
          <button
            key={p.k} type="button" disabled={realTimeEnabled}
            aria-pressed={timeOfDayMinutes === p.m}
            onClick={() => { setTimeOfDayMinutes(p.m); if (p.k === "rainy") setWeather("rain"); }}
            className="chip flex-col !min-h-[52px] leading-tight disabled:opacity-50"
          >
            <span className="text-xs tabular-nums opacity-70">{formatMinutes(p.m)}</span>
            <span>{t.presets[p.k]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label={t.speed} className="flex gap-1">
          {([0, 1, 4] as TimeSpeed[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={timeSpeed === s} onClick={() => setTimeSpeed(s)} className="chip">
              {s === 0 ? t.pause : `${s}×`}
            </button>
          ))}
        </div>
        <Toggle label={t.realTime} checked={realTimeEnabled} onChange={setRealTimeEnabled} />
      </div>
    </div>
  );
}

const weathers: { id: Weather; Icon: typeof Sun }[] = [
  { id: "sunny", Icon: Sun }, { id: "cloudy", Icon: Cloud }, { id: "rain", Icon: CloudRain }, { id: "storm", Icon: CloudLightning },
];

export function WeatherPanel() {
  const t = useT();
  const { weather, setWeather, realWeatherEnabled, setRealWeatherEnabled } = useAppStore();
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t.tabs.weather} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {weathers.map(({ id, Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={weather === id} disabled={realWeatherEnabled}
            onClick={() => setWeather(id)} className="chip gap-2 disabled:opacity-50">
            <Icon className="h-4 w-4" />{t.weather[id]}
          </button>
        ))}
      </div>
      <Toggle label={t.realWeather} checked={realWeatherEnabled} onChange={setRealWeatherEnabled} />
    </div>
  );
}

export function FestivalPanel() {
  const t = useT();
  const { festival, setFestival } = useAppStore();
  return (
    <div role="radiogroup" aria-label={t.tabs.festival} className="grid grid-cols-3 gap-2">
      {(["normal", "tet", "midautumn"] as Festival[]).map((f) => (
        <button key={f} type="button" role="radio" aria-checked={festival === f} onClick={() => setFestival(f)} className="chip">
          {t.festival[f]}
        </button>
      ))}
    </div>
  );
}

export function MemoriesPanel() {
  const t = useT();
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <Sparkles className="h-6 w-6 text-accent" aria-hidden />
      <p className="mt-2 font-serif text-lg italic text-primary">{t.memoriesEmptyTitle}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t.memoriesEmptyBody}</p>
    </div>
  );
}
