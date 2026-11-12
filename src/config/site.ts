import type { Position2 } from "@/world/schema";

export const SITE_CONFIG = {
  name: "Phố Nhà Mình",
  homeLabel: {
    vi: "Nhà của tôi · đang xây để cho thuê",
    en: "My house · under construction for rent",
  },
  description: {
    vi: "Đường và footprints OpenStreetMap · hiện trạng chưa khảo sát.",
    en: "OpenStreetMap roads and footprints · site not surveyed.",
  },
  defaultTime: 420,
  defaultWeather: "sunny" as const,
  defaultViewMode: "diorama" as const,
  heroCenter: [0, 0] as Position2,
  timePresets: [
    { key: "commute" as const, minutes: 420, labelVi: "Sáng", labelEn: "Morning" },
    { key: "noon" as const, minutes: 930, labelVi: "Chiều", labelEn: "Afternoon" },
    { key: "night" as const, minutes: 1170, labelVi: "Tối", labelEn: "Evening" },
  ],
  weatherPresets: [
    { key: "sunny" as const, weather: "sunny" as const, labelVi: "Nắng", labelEn: "Sunny" },
    { key: "cloudy" as const, weather: "cloudy" as const, labelVi: "Mây", labelEn: "Cloudy" },
    { key: "rain" as const, weather: "storm" as const, labelVi: "Mưa", labelEn: "Rain" },
  ],
  weatherDisplay: {
    sunny: "sunny",
    cloudy: "cloudy",
    rain: "rain",
    storm: "rain",
  } as const,
} as const;
