import { useEffect } from "react";
import { useAppStore } from "@/state/appStore";

/** Advances store time by timeSpeed (game-minutes per real second), or syncs to real time. */
export function useClock() {
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = useAppStore.getState();
      if (s.realTimeEnabled) {
        const d = new Date();
        s.setTimeOfDayMinutes(d.getHours() * 60 + d.getMinutes());
      } else if (s.timeSpeed > 0) {
        s.setTimeOfDayMinutes(s.timeOfDayMinutes + s.timeSpeed);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
}
