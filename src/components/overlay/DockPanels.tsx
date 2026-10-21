import { LifeControls } from "./LifeControls";
import { createOpenMeteoWeatherAdapter } from "@/atmosphere/weatherOpenMeteo";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { sunEvents } from "@/atmosphere/astronomy";
import { worldDataProvider } from "@/world/privateWorldSession";
import { useAppStore, type Festival, type TimeSpeed, type Weather } from "@/state/appStore";
import { getEffectiveFestival } from "@/atmosphere/calendar";
import { WeatherConnection } from "./WeatherConnection";
import { formatMinutes, useT } from "@/i18n";
import { Download, Trash2, Cloud, CloudRain, CloudLightning, Sun, Sparkles } from "lucide-react";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="ctl gap-2 px-2 text-sm text-foreground"
    >
      <span
        className={`relative h-6 w-10 rounded-full transition-colors duration-200 ${checked ? "bg-primary" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform duration-200 ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
        />
      </span>
      {label}
    </button>
  );
}

const presets = [
  { m: 330, k: "dawn" },
  { m: 420, k: "commute" },
  { m: 720, k: "noon" },
  { m: 930, k: "rainy" },
  { m: 1080, k: "sunset" },
  { m: 1170, k: "night" },
  { m: 1380, k: "late" },
  { m: 180, k: "asleep" },
] as const;

export function TimePanel() {
  const t = useT();
  const {
    timeOfDayMinutes,
    setTimeOfDayMinutes,
    timeSpeed,
    setTimeSpeed,
    realTimeEnabled,
    setRealTimeEnabled,
    setWeather,
    selectedDate,
    setSelectedDate,
  } = useAppStore();
  const referenceSnapshot = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const sunset = useMemo(() => {
    const reference = worldDataProvider.getGeoreference();
    return reference ? sunEvents(selectedDate, reference.origin)?.sunsetMinutes : undefined;
  }, [selectedDate, referenceSnapshot]);

  return (
    <div className="space-y-3">
      <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {t.atmosphere.date}
        <input
          type="date"
          min="1900-01-01"
          max="2100-12-31"
          value={selectedDate}
          disabled={realTimeEnabled}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="h-11 rounded-lg border border-border bg-secondary px-3 disabled:opacity-50"
        />
      </label>
      <div className="flex items-center gap-3">
        <span className="w-14 text-lg font-medium tabular-nums text-primary">
          {formatMinutes(timeOfDayMinutes)}
        </span>
        <input
          type="range"
          min={0}
          max={1439}
          step={1}
          value={timeOfDayMinutes}
          disabled={realTimeEnabled}
          aria-label={t.timeSlider}
          aria-valuetext={formatMinutes(timeOfDayMinutes)}
          onChange={(e) => setTimeOfDayMinutes(+e.target.value)}
          className="h-11 flex-1 accent-[var(--accent)] disabled:opacity-50"
        />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {presets.map((p) => {
          const minutes = p.k === "sunset" && sunset != null ? sunset : p.m;
          return (
            <button
              key={p.k}
              type="button"
              disabled={realTimeEnabled || (p.k === "sunset" && sunset === null)}
              aria-pressed={timeOfDayMinutes === minutes}
              onClick={() => {
                setTimeOfDayMinutes(minutes);
                if (p.k === "rainy") setWeather("rain");
              }}
              className="chip flex-col !min-h-[52px] leading-tight disabled:opacity-50"
            >
              <span className="text-xs tabular-nums opacity-70">{formatMinutes(minutes)}</span>
              <span>{t.presets[p.k]}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label={t.speed} className="flex gap-1">
          {([0, 1, 4] as TimeSpeed[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={timeSpeed === s}
              onClick={() => {
                setRealTimeEnabled(false);
                setTimeSpeed(s);
              }}
              className="chip"
            >
              {s === 0 ? t.pause : `${s}×`}
            </button>
          ))}
        </div>
        <Toggle label={t.realTime} checked={realTimeEnabled} onChange={setRealTimeEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">{t.atmosphere.speedNote}</p>
      <p className="text-xs text-muted-foreground">{t.atmosphere.timeNote}</p>
      <LifeControls />
    </div>
  );
}

const weathers: { id: Weather; Icon: typeof Sun }[] = [
  { id: "sunny", Icon: Sun },
  { id: "cloudy", Icon: Cloud },
  { id: "rain", Icon: CloudRain },
  { id: "storm", Icon: CloudLightning },
];

export function WeatherPanel() {
  const t = useT();
  const [adapter, setAdapter] = useState<ReturnType<typeof createOpenMeteoWeatherAdapter> | null>(
    null,
  );
  useEffect(() => {
    const next = createOpenMeteoWeatherAdapter({ provider: worldDataProvider });
    setAdapter(next);
    return () => next.dispose();
  }, []);
  const {
    weather,
    setWeather,
    season,
    setSeason,
    floodLevel,
    setFloodLevel,
    atmosphereEnabled,
    setAtmosphereEnabled,
  } = useAppStore();
  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label={t.tabs.weather}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {weathers.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={weather === id}
            onClick={() => {
              adapter?.clear();
              useAppStore.getState().setRealWeatherEnabled(false);
              setWeather(id);
            }}
            className="chip gap-2 disabled:opacity-50"
          >
            <Icon className="h-4 w-4" />
            {t.weather[id]}
          </button>
        ))}
      </div>
      <Toggle
        label={t.atmosphere.layer}
        checked={atmosphereEnabled}
        onChange={setAtmosphereEnabled}
      />
      <div role="radiogroup" aria-label={t.atmosphere.season} className="flex flex-wrap gap-2">
        {(["auto", "dry", "wet"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={season === id}
            onClick={() => setSeason(id)}
            className="chip"
          >
            {t.atmosphere.seasons[id]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t.atmosphere.seasonNote}</p>
      <label className="flex flex-wrap items-center gap-3 text-sm">
        {t.atmosphere.flood} · {Math.round(floodLevel * 100)}%
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={floodLevel}
          aria-label={t.atmosphere.flood}
          onChange={(e) => setFloodLevel(Number(e.target.value))}
          className="h-11 min-w-32 flex-1 accent-[var(--accent)]"
        />
      </label>
      <p className="text-xs text-muted-foreground">{t.atmosphere.floodNote}</p>
      {adapter && <WeatherConnection adapter={adapter} />}
    </div>
  );
}

export function FestivalPanel() {
  const t = useT();
  const state = useAppStore();
  const effective = getEffectiveFestival(state);
  return (
    <div className="space-y-3">
      <Toggle
        label={t.atmosphere.festivalAuto}
        checked={state.festivalAuto}
        onChange={state.setFestivalAuto}
      />
      <div
        role="radiogroup"
        aria-label={t.tabs.festival}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {(
          ["normal", "tet", "midautumn", "christmas", "reunification", "national"] as Festival[]
        ).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={effective === f}
            onClick={() => {
              state.setFestivalAuto(false);
              state.setFestival(f);
            }}
            className="chip"
          >
            {t.festival[f]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t.atmosphere.festivalNote}</p>
      <p className="text-xs text-muted-foreground">{t.atmosphere.illustrationNote}</p>
    </div>
  );
}

export function MemoriesPanel() {
  const t = useT();
  const moments = useAppStore((s) => s.moments);
  const clearMoments = useAppStore((s) => s.clearMoments);
  if (moments.length)
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t.momentsNote}</p>
        <div className="grid grid-cols-2 gap-3">
          {moments.map((moment) => (
            <div key={moment.id} className="overflow-hidden rounded-xl bg-secondary">
              <img
                src={moment.image}
                alt={`${t.capture} · ${formatMinutes(moment.minutes)}`}
                className="aspect-video w-full object-cover"
              />
              <a
                href={moment.image}
                download={`pho-demo-${moment.id}.png`}
                className="ctl w-full gap-2 px-3"
              >
                <Download className="h-4 w-4" />
                {formatMinutes(moment.minutes)}
              </a>
            </div>
          ))}
        </div>
        <button type="button" onClick={clearMoments} className="ctl gap-2 px-2 text-sm">
          <Trash2 className="h-4 w-4" />
          {t.clearMoments}
        </button>
      </div>
    );
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <Sparkles className="h-6 w-6 text-accent" aria-hidden />
      <p className="mt-2 font-serif text-lg italic text-primary">{t.memoriesEmptyTitle}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t.memoriesEmptyBody}</p>
      <p className="mt-2 max-w-xs text-xs text-muted-foreground">{t.momentsNote}</p>
    </div>
  );
}
