import { Cloud, CloudLightning, CloudRain, Sun, Sunrise, Sunset } from "lucide-react";
import { useT } from "@/i18n";
import { useAppStore, type Weather } from "@/state/appStore";

export function TimePanel() {
  const t = useT();
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const setMinutes = useAppStore((s) => s.setTimeOfDayMinutes);

  const presets: {
    key: "commute" | "noon" | "night";
    m: number;
    icon: typeof Sun;
  }[] = [
    { key: "commute", m: 420, icon: Sunrise },
    { key: "noon", m: 930, icon: Sun },
    { key: "night", m: 1170, icon: Sunset },
  ];

  const activeKey = minutes < 720 ? "commute" : minutes < 1080 ? "noon" : "night";

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={t.tabs.time} className="grid grid-cols-3 gap-2">
        {presets.map(({ key, m, icon: Icon }) => {
          const active = activeKey === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMinutes(m)}
              className={`chip min-h-11 justify-center gap-2 py-2.5 text-sm font-medium ${active ? "chip-active" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{t.presets[key]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const weatherIcons: Record<Weather, typeof Sun> = {
  sunny: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  storm: CloudLightning,
};

export function WeatherPanel() {
  const t = useT();
  const weather = useAppStore((s) => s.weather);
  const setWeather = useAppStore((s) => s.setWeather);
  const modes: Weather[] = ["sunny", "cloudy", "rain", "storm"];

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label={t.tabs.weather}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {modes.map((w: Weather) => {
          const Icon = weatherIcons[w];
          const active = weather === w;
          return (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setWeather(w)}
              className={`chip min-h-11 justify-center gap-2 py-2.5 text-sm font-medium ${active ? "chip-active" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{t.weather[w]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
