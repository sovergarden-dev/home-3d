export interface Place {
  id: string;
  name: { vi: string; en: string };
  /** CSS gradient used as placeholder thumbnail */
  thumb: string;
}

export const places: Place[] = [
  { id: "home", name: { vi: "Nhà mình", en: "Our house" }, thumb: "linear-gradient(135deg, oklch(0.62 0.13 45), oklch(0.82 0.08 75))" },
  { id: "market", name: { vi: "Chợ đầu ngõ", en: "Alley market" }, thumb: "linear-gradient(135deg, oklch(0.55 0.12 30), oklch(0.78 0.1 60))" },
  { id: "coffee", name: { vi: "Quán cà phê cóc", en: "Street coffee" }, thumb: "linear-gradient(135deg, oklch(0.4 0.06 50), oklch(0.7 0.07 70))" },
  { id: "banyan", name: { vi: "Gốc đa", en: "Banyan tree" }, thumb: "linear-gradient(135deg, oklch(0.38 0.07 160), oklch(0.7 0.09 140))" },
  { id: "school", name: { vi: "Trường tiểu học", en: "Primary school" }, thumb: "linear-gradient(135deg, oklch(0.6 0.08 90), oklch(0.86 0.06 100))" },
  { id: "pagoda", name: { vi: "Chùa làng", en: "Village pagoda" }, thumb: "linear-gradient(135deg, oklch(0.5 0.12 35), oklch(0.75 0.11 85))" },
];
