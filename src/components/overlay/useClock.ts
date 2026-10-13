import { useEffect } from "react";
import { useAppStore } from "@/state/appStore";
import { vietnamTime } from "@/lib/vietnamTime";

/** Advances store time by timeSpeed (game-minutes per real second), or syncs to real time. */
export function useClock() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useAppStore.getState();
      if (s.realTimeEnabled) {
        s.setTimeOfDayMinutes(vietnamTime().minutes);
      } else if (s.timeSpeed > 0 && !document.hidden) {
        s.setTimeOfDayMinutes(s.timeOfDayMinutes + s.timeSpeed);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
}
