import { Cloud, CloudRain, Sun, Sunrise, Sunset } from "lucide-react";
import { SITE_CONFIG } from "@/config/site";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";

const timeIcons = { commute: Sunrise, noon: Sun, night: Sunset } as const;
const weatherIcons = { sunny: Sun, cloudy: Cloud, rain: CloudRain } as const;

export function Dock() {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const setMinutes = useAppStore((s) => s.setTimeOfDayMinutes);
  const weather = useAppStore((s) => s.weather);
  const setWeather = useAppStore((s) => s.setWeather);

  const activeTimeKey = minutes < 720 ? "commute" : minutes < 1080 ? "noon" : "night";
  const activeWeather = SITE_CONFIG.weatherDisplay[weather];

  return (
    <div
      role="region"
      aria-label={t.dockLabel}
      className="glass pointer-events-auto flex flex-col gap-2 rounded-2xl p-2.5 shadow-lg backdrop-blur-md"
    >
      {/* Hàng 1: 3 mốc thời gian (Sáng | Chiều | Tối) */}
      <div role="radiogroup" aria-label={t.tabs.time} className="grid grid-cols-3 gap-1.5">
        {SITE_CONFIG.timePresets.map(({ key, minutes: presetMinutes, labelVi, labelEn }) => {
          const Icon = timeIcons[key];
          const active = activeTimeKey === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMinutes(presetMinutes)}
              className={`chip min-h-10 justify-center gap-1.5 px-3 py-2 text-xs font-medium sm:text-sm ${
                active ? "chip-active shadow-sm" : ""
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span>{lang === "vi" ? labelVi : labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* Hàng 2: 3 trạng thái thời tiết (Nắng | Mây | Mưa) */}
      <div role="radiogroup" aria-label={t.tabs.weather} className="grid grid-cols-3 gap-1.5">
        {SITE_CONFIG.weatherPresets.map(({ key, weather: presetWeather, labelVi, labelEn }) => {
          const Icon = weatherIcons[key];
          const active = activeWeather === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setWeather(presetWeather)}
              className={`chip min-h-10 justify-center gap-1.5 px-3 py-2 text-xs font-medium sm:text-sm ${
                active ? "chip-active shadow-sm" : ""
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span>{lang === "vi" ? labelVi : labelEn}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
