import { useAppStore } from "@/state/appStore";
import { vi } from "./vi";
import { en } from "./en";

export const dictionaries = { vi, en };
export function useT() {
  const lang = useAppStore((s) => s.language);
  return dictionaries[lang];
}
export const formatMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
