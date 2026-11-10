import { useEffect } from "react";
import { SITE_CONFIG } from "@/config/site";
import { useAppStore } from "@/state/appStore";

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest("input, textarea, select, button, a, [role='radio'], [role='button']"),
  );
}

export function useSceneShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isInteractiveTarget(event.target)) return;
      const state = useAppStore.getState();
      if (state.loadingProgress < 1) return;

      const key = event.key.toLowerCase();
      if (key === "1") {
        event.preventDefault();
        state.setTimeOfDayMinutes(SITE_CONFIG.timePresets[0].minutes);
        return;
      }
      if (key === "2") {
        event.preventDefault();
        state.setTimeOfDayMinutes(SITE_CONFIG.timePresets[1].minutes);
        return;
      }
      if (key === "3") {
        event.preventDefault();
        state.setTimeOfDayMinutes(SITE_CONFIG.timePresets[2].minutes);
        return;
      }
      if (key === "q") {
        event.preventDefault();
        state.setWeather(SITE_CONFIG.weatherPresets[0].weather);
        return;
      }
      if (key === "w" && !(event.target instanceof HTMLCanvasElement)) {
        event.preventDefault();
        state.setWeather(SITE_CONFIG.weatherPresets[1].weather);
        return;
      }
      if (key === "e") {
        event.preventDefault();
        state.setWeather(SITE_CONFIG.weatherPresets[2].weather);
        return;
      }
      if (state.sceneStatus !== "ready") return;
      if (key === "m") {
        event.preventDefault();
        state.setViewMode(state.viewMode === "topdown" ? "diorama" : "topdown");
        return;
      }
      if (key === "h" || (key === "r" && !(event.target instanceof HTMLCanvasElement))) {
        event.preventDefault();
        state.resetView();
        return;
      }
      if ((key === "+" || key === "=") && !(event.target instanceof HTMLCanvasElement)) {
        event.preventDefault();
        state.zoomIn();
        return;
      }
      if (key === "-" && !(event.target instanceof HTMLCanvasElement)) {
        event.preventDefault();
        state.zoomOut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
