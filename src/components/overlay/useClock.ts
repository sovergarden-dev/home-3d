import { useEffect } from "react";
import { advanceClock, createClockState, vietnamDateTime } from "@/atmosphere/clock";
import { useAppStore } from "@/state/appStore";

/** One timer, monotonic elapsed simulation, atomic date/time, no hidden-tab catch-up. */
export function useClock() {
  useEffect(() => {
    const initial = useAppStore.getState();
    let clock = createClockState(initial.timeOfDayMinutes, initial.selectedDate);
    let timer: number | undefined;
    let writing = false;
    const tick = () => {
      if (document.hidden) return;
      const state = useAppStore.getState();
      const now = performance.now();
      clock = state.realTimeEnabled
        ? { ...vietnamDateTime(), lastNow: now }
        : advanceClock(clock, now, state.timeSpeed);
      const minutes = Math.floor(clock.minutes);
      if (state.selectedDate !== clock.date || state.timeOfDayMinutes !== minutes) {
        writing = true;
        useAppStore.setState({ selectedDate: clock.date, timeOfDayMinutes: minutes });
        writing = false;
      }
    };
    const schedule = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      const state = useAppStore.getState();
      if (!document.hidden && (state.realTimeEnabled || state.timeSpeed !== 0))
        timer = window.setInterval(tick, 250);
    };
    const unsubscribe = useAppStore.subscribe((next, previous) => {
      if (writing) return;
      if (
        next.selectedDate !== previous.selectedDate ||
        next.timeOfDayMinutes !== previous.timeOfDayMinutes ||
        next.timeSpeed !== previous.timeSpeed ||
        next.realTimeEnabled !== previous.realTimeEnabled
      ) {
        clock = createClockState(next.timeOfDayMinutes, next.selectedDate);
        if (next.realTimeEnabled) tick();
        schedule();
      }
    });
    const visibility = () => {
      clock.lastNow = performance.now();
      if (!document.hidden && useAppStore.getState().realTimeEnabled) tick();
      schedule();
    };
    document.addEventListener("visibilitychange", visibility);
    if (initial.realTimeEnabled) tick();
    schedule();
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
}
