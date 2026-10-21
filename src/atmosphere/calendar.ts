/*
 * Adapted from amlich-aa98.js.
 * Copyright (c) 2006 Ho Ngoc Duc. All Rights Reserved.
 * Astronomical algorithms from "Astronomical Algorithms", Jean Meeus, 1998.
 * Permission to use, copy, modify, and redistribute this software and its
 * documentation for personal, non-commercial use is hereby granted provided that
 * this copyright notice and appropriate documentation appears in all copies.
 * Source: https://github.com/vanng822/amlich/blob/master/lib/amlich-aa98.js
 * This personal, non-commercial application uses the Vietnamese UTC+7 calendar.
 */
export type SolarDate = { year: number; month: number; day: number };
export type LunarDate = SolarDate & { leap: boolean };
export type Festival = "normal" | "tet" | "midautumn" | "christmas" | "reunification" | "national";
export type Season = "auto" | "dry" | "wet";
const RAD = Math.PI / 180;
const floor = Math.floor;
function jdFromDate(day: number, month: number, year: number): number {
  const a = floor((14 - month) / 12),
    y = year + 4800 - a,
    m = month + 12 * a - 3;
  return (
    day +
    floor((153 * m + 2) / 5) +
    365 * y +
    floor(y / 4) -
    floor(y / 100) +
    floor(y / 400) -
    32045
  );
}
function newMoon(k: number): number {
  const t = k / 1236.85,
    t2 = t * t,
    t3 = t2 * t;
  const jd =
    2415020.75933 +
    29.53058868 * k +
    0.0001178 * t2 -
    0.000000155 * t3 +
    0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * RAD);
  const m = (359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3) * RAD;
  const mp = (306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3) * RAD;
  const f = (21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3) * RAD;
  const correction =
    (0.1734 - 0.000393 * t) * Math.sin(m) +
    0.0021 * Math.sin(2 * m) -
    0.4068 * Math.sin(mp) +
    0.0161 * Math.sin(2 * mp) -
    0.0004 * Math.sin(3 * mp) +
    0.0104 * Math.sin(2 * f) -
    0.0051 * Math.sin(m + mp) -
    0.0074 * Math.sin(m - mp) +
    0.0004 * Math.sin(2 * f + m) -
    0.0004 * Math.sin(2 * f - m) -
    0.0006 * Math.sin(2 * f + mp) +
    0.001 * Math.sin(2 * f - mp) +
    0.0005 * Math.sin(2 * mp + m);
  const deltaT =
    t < -11
      ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
      : -0.000278 + 0.000265 * t + 0.000262 * t2;
  return jd + correction - deltaT;
}
function newMoonDay(k: number, tz: number): number {
  return floor(newMoon(k) + 0.5 + tz / 24);
}
function sunSector(day: number, tz: number): number {
  const t = (day - 0.5 - tz / 24 - 2451545) / 36525,
    t2 = t * t;
  const m = (357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2) * RAD;
  const mean = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  const dl =
    (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(m) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * m) +
    0.00029 * Math.sin(3 * m);
  const lon = (mean + dl) * RAD;
  return floor(((lon - Math.PI * 2 * floor(lon / (Math.PI * 2))) / Math.PI) * 6);
}
function month11(year: number, tz: number): number {
  const k = floor((jdFromDate(31, 12, year) - 2415021) / 29.530588853);
  const nm = newMoonDay(k, tz);
  return sunSector(nm, tz) >= 9 ? newMoonDay(k - 1, tz) : nm;
}
function leapOffset(a11: number, tz: number): number {
  const k = floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let i = 1,
    arc = sunSector(newMoonDay(k + i, tz), tz),
    last: number;
  do {
    last = arc;
    i++;
    arc = sunSector(newMoonDay(k + i, tz), tz);
  } while (arc !== last && i < 14);
  return i - 1;
}
export function parseIsoDate(value: string): SolarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]),
    month = Number(m[2]),
    day = Number(m[3]);
  if (year < 1900 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? { year, month, day }
    : null;
}
export const isoDate = (date: SolarDate): string =>
  `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
/** UTC+8 is exposed only for boundary regression; all application callers use UTC+7. */
export function solarToLunar(date: SolarDate, timezone: 7 | 8 = 7): LunarDate {
  if (!parseIsoDate(isoDate(date))) throw new Error("CALENDAR_DATE_INVALID");
  const dayNumber = jdFromDate(date.day, date.month, date.year);
  const k = floor((dayNumber - 2415021.076998695) / 29.530588853);
  let start = newMoonDay(k + 1, timezone);
  if (start > dayNumber) start = newMoonDay(k, timezone);
  let a11 = month11(date.year, timezone),
    b11 = a11,
    year: number;
  if (a11 >= start) {
    year = date.year;
    a11 = month11(date.year - 1, timezone);
  } else {
    year = date.year + 1;
    b11 = month11(date.year + 1, timezone);
  }
  const day = dayNumber - start + 1,
    diff = floor((start - a11) / 29);
  let month = diff + 11,
    leap = false;
  if (b11 - a11 > 365) {
    const offset = leapOffset(a11, timezone);
    if (diff >= offset) {
      month = diff + 10;
      leap = diff === offset;
    }
  }
  if (month > 12) month -= 12;
  if (month >= 11 && diff < 4) year--;
  return { year, month, day, leap };
}
export function festivalForDate(
  date: SolarDate,
  manual: Festival = "normal",
  auto = true,
): Festival {
  if (!auto) return manual;
  if (!parseIsoDate(isoDate(date))) return "normal";
  if (date.month === 12 && (date.day === 24 || date.day === 25)) return "christmas";
  if (date.month === 4 && date.day === 30) return "reunification";
  if (date.month === 9 && date.day === 2) return "national";
  const lunar = solarToLunar(date);
  if (!lunar.leap && lunar.month === 1 && lunar.day >= 1 && lunar.day <= 3) return "tet";
  if (!lunar.leap && lunar.month === 8 && lunar.day === 15) return "midautumn";
  return "normal";
}
export function getEffectiveFestival(state: {
  festivalAuto: boolean;
  festival: Festival;
  selectedDate: string;
}): Festival {
  const date = parseIsoDate(state.selectedDate);
  return date ? festivalForDate(date, state.festival, state.festivalAuto) : state.festival;
}
export function getEffectiveSeason(state: {
  season: Season;
  selectedDate: string;
}): Exclude<Season, "auto"> {
  if (state.season !== "auto") return state.season;
  const month = parseIsoDate(state.selectedDate)?.month ?? 1;
  return month >= 5 && month <= 11 ? "wet" : "dry";
}
