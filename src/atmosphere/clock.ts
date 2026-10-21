import { parseIsoDate } from "./calendar";
export type ClockTick = { minutes: number; date: string };
export type ClockState = ClockTick & { lastNow: number };
export function createClockState(
  minutes: number,
  date: string,
  now = performance.now(),
): ClockState {
  return { minutes, date, lastNow: now };
}
export function advanceClock(
  state: ClockState,
  now: number,
  speed: 0 | 1 | 4,
  visible = true,
): ClockState {
  if (!Number.isFinite(now)) return state;
  if (
    !visible ||
    now <= state.lastNow ||
    !Number.isFinite(state.minutes) ||
    !parseIsoDate(state.date)
  )
    return { ...state, lastNow: now };
  const total = state.minutes + ((now - state.lastNow) / 1000) * speed;
  const days = Math.floor(total / 1440);
  const date = new Date(Date.parse(`${state.date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
  if (!parseIsoDate(date)) return { ...state, lastNow: now };
  return { minutes: ((total % 1440) + 1440) % 1440, date, lastNow: now };
}
export function vietnamDateTime(date = new Date()): ClockTick {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
