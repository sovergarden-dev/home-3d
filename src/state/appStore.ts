import { create } from "zustand";

export type TimeSpeed = 0 | 1 | 4;
export type Weather = "sunny" | "cloudy" | "rain" | "storm";
export type Festival = "normal" | "tet" | "midautumn";
export type ViewMode = "diorama" | "walk" | "topdown" | "real";
export type Language = "vi" | "en";

export interface PlanMeasurement {
  metresPerCssPixel: number;
  revision: number;
}

export type CameraFrame = "home" | "core" | "full";

/**
 * Single source of truth shared by the UI overlay and the future 3D engine.
 * The map uses the supplied ENU origin; confirming a point does not confirm a surveyed parcel boundary.
 */
export interface AppState {
  timeOfDayMinutes: number;
  timeSpeed: TimeSpeed;
  realTimeEnabled: boolean;
  weather: Weather;
  realWeatherEnabled: boolean;
  festival: Festival;
  viewMode: ViewMode;
  heading: number;
  zoom: number;
  soundOn: boolean;
  language: Language;
  loadingProgress: number;
  sceneStatus: "loading" | "ready" | "fallback";
  viewReset: number;
  cameraFrame: { kind: CameraFrame; request: number };
  showTrees: boolean;
  showLabels: boolean;
  planMeasurement: PlanMeasurement | null;
  moments: { id: number; image: string; minutes: number }[];
  addMoment: (image: string) => void;
  clearMoments: () => void;
  setTimeOfDayMinutes: (m: number) => void;
  setTimeSpeed: (s: TimeSpeed) => void;
  setRealTimeEnabled: (v: boolean) => void;
  setWeather: (w: Weather) => void;
  setRealWeatherEnabled: (v: boolean) => void;
  setFestival: (f: Festival) => void;
  setViewMode: (v: ViewMode) => void;
  setHeading: (deg: number) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Restore the default camera state without changing the world origin. */
  resetView: () => void;
  requestCameraFrame: (kind: CameraFrame) => void;
  toggleSound: () => void;
  toggleTrees: () => void;
  toggleLabels: () => void;
  setPlanMeasurement: (measurement: PlanMeasurement | null) => void;
  setLanguage: (l: Language) => void;
  setLoadingProgress: (p: number) => void;
}

const wrapMinutes = (m: number) => ((Math.round(m) % 1440) + 1440) % 1440;

export const useAppStore = create<AppState>((set) => ({
  timeOfDayMinutes: 7 * 60,
  timeSpeed: 0,
  realTimeEnabled: false,
  weather: "sunny",
  realWeatherEnabled: false,
  festival: "normal",
  viewMode: "diorama",
  heading: 28,
  zoom: 1,
  soundOn: false,
  language: "vi",
  loadingProgress: 0,
  sceneStatus: "loading",
  viewReset: 0,
  cameraFrame: { kind: "home", request: 0 },
  showTrees: true,
  showLabels: true,
  planMeasurement: null,
  moments: [],
  addMoment: (image) =>
    set((s) => ({
      moments: [{ id: Date.now(), image, minutes: s.timeOfDayMinutes }, ...s.moments].slice(0, 4),
    })),
  clearMoments: () => set({ moments: [] }),
  setTimeOfDayMinutes: (m) => set({ timeOfDayMinutes: wrapMinutes(m) }),
  setTimeSpeed: (timeSpeed) => set({ timeSpeed }),
  setRealTimeEnabled: (realTimeEnabled) => set({ realTimeEnabled }),
  setWeather: (weather) => set({ weather }),
  setRealWeatherEnabled: (realWeatherEnabled) => set({ realWeatherEnabled }),
  setFestival: (festival) => set({ festival }),
  setViewMode: (viewMode) =>
    set((state) => ({
      viewMode,
      // A long private-world perspective can hit OrbitControls' distance cap;
      // Plan begins at its own 1× core, without resetting an active Plan zoom.
      zoom: viewMode === "topdown" && state.viewMode !== "topdown" ? 1 : state.zoom,
    })),
  setHeading: (deg) => set({ heading: ((deg % 360) + 360) % 360 }),
  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(4, +(s.zoom * 1.25).toFixed(3)) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.25, +(s.zoom / 1.25).toFixed(3)) })),
  resetView: () =>
    set((s) => ({ zoom: 1, heading: 0, viewMode: "diorama", viewReset: s.viewReset + 1 })),
  requestCameraFrame: (kind) =>
    set((s) => ({ cameraFrame: { kind, request: s.cameraFrame.request + 1 } })),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
  toggleTrees: () => set((s) => ({ showTrees: !s.showTrees })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setPlanMeasurement: (planMeasurement) => set({ planMeasurement }),
  setLanguage: (language) => set({ language }),
  setLoadingProgress: (p) => set({ loadingProgress: Math.max(0, Math.min(1, p)) }),
}));
