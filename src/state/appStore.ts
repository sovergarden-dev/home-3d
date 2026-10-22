import { parseIsoDate } from "@/atmosphere/calendar";
import { vietnamDateTime } from "@/atmosphere/clock";
import { create } from "zustand";

export type TimeSpeed = 0 | 1 | 4;
export type Weather = "sunny" | "cloudy" | "rain" | "storm";
export type Festival = "normal" | "tet" | "midautumn" | "christmas" | "reunification" | "national";
export type Season = "auto" | "dry" | "wet";
export type ViewMode = "diorama" | "walk" | "topdown" | "real" | "ride";
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
  selectedDate: string;
  timeOfDayMinutes: number;
  season: Season;
  festivalAuto: boolean;
  atmosphereEnabled: boolean;
  floodLevel: number;
  timeSpeed: TimeSpeed;
  realTimeEnabled: boolean;
  weather: Weather;
  realWeatherEnabled: boolean;
  realWeatherKind: Weather | null;
  festival: Festival;
  viewMode: ViewMode;
  heading: number;
  zoom: number;
  soundOn: boolean;
  lifeEnabled: boolean;
  lifeDensity: number;
  ridePaused: boolean;
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
  setSelectedDate: (date: string) => void;
  setTimeOfDayMinutes: (m: number) => void;
  setSeason: (season: Season) => void;
  setFestivalAuto: (enabled: boolean) => void;
  setAtmosphereEnabled: (enabled: boolean) => void;
  setFloodLevel: (level: number) => void;
  setTimeSpeed: (s: TimeSpeed) => void;
  setRealTimeEnabled: (v: boolean) => void;
  setWeather: (w: Weather) => void;
  setRealWeatherKind: (w: Weather | null) => void;
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
  setLifeEnabled: (enabled: boolean) => void;
  setLifeDensity: (density: number) => void;
  setRidePaused: (paused: boolean) => void;
  toggleTrees: () => void;
  toggleLabels: () => void;
  setPlanMeasurement: (measurement: PlanMeasurement | null) => void;
  setLanguage: (l: Language) => void;
  setLoadingProgress: (p: number) => void;
}

const wrapMinutes = (m: number) => ((Math.round(m) % 1440) + 1440) % 1440;

export const useAppStore = create<AppState>((set) => ({
  selectedDate: vietnamDateTime().date,
  timeOfDayMinutes: 7 * 60,
  season: "auto",
  festivalAuto: true,
  atmosphereEnabled: true,
  floodLevel: 0,
  timeSpeed: 0,
  realTimeEnabled: false,
  weather: "sunny",
  realWeatherEnabled: false,
  realWeatherKind: null,
  festival: "normal",
  viewMode: "diorama",
  heading: 28,
  zoom: 1,
  soundOn: false,
  lifeEnabled: true,
  lifeDensity: 0.65,
  ridePaused: false,
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
  setSelectedDate: (selectedDate) => {
    if (parseIsoDate(selectedDate)) set({ selectedDate });
  },
  setTimeOfDayMinutes: (m) => set({ timeOfDayMinutes: wrapMinutes(m) }),
  setSeason: (season) => set({ season }),
  setFestivalAuto: (festivalAuto) => set({ festivalAuto }),
  setAtmosphereEnabled: (atmosphereEnabled) => set({ atmosphereEnabled }),
  setFloodLevel: (floodLevel) =>
    set({ floodLevel: Math.max(0, Math.min(1, Number.isFinite(floodLevel) ? floodLevel : 0)) }),
  setTimeSpeed: (timeSpeed) => set({ timeSpeed }),
  setRealTimeEnabled: (realTimeEnabled) => set({ realTimeEnabled }),
  setWeather: (weather) => set({ weather, realWeatherEnabled: false, realWeatherKind: null }),
  setRealWeatherKind: (realWeatherKind) => set({ realWeatherKind }),
  setRealWeatherEnabled: (realWeatherEnabled) =>
    set(
      realWeatherEnabled ? { realWeatherEnabled } : { realWeatherEnabled, realWeatherKind: null },
    ),
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
  setLifeEnabled: (lifeEnabled) => set({ lifeEnabled }),
  setLifeDensity: (density) =>
    set({ lifeDensity: Math.max(0, Math.min(1, Number.isFinite(density) ? density : 0)) }),
  setRidePaused: (ridePaused) => set({ ridePaused }),
  toggleTrees: () => set((s) => ({ showTrees: !s.showTrees })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setPlanMeasurement: (planMeasurement) => set({ planMeasurement }),
  setLanguage: (language) => set({ language }),
  setLoadingProgress: (p) => set({ loadingProgress: Math.max(0, Math.min(1, p)) }),
}));
