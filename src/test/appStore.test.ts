import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearMomentBlobs } from "@/memories/moments";
import { useAppStore } from "@/state/appStore";

const initialState = useAppStore.getState();

beforeEach(() => {
  clearMomentBlobs();
  useAppStore.setState(initialState, true);
});

afterEach(() => {
  useAppStore.getState().clearMoments();
});

describe("application state boundaries", () => {
  it("accepts only valid dates and wraps simulation minutes into the day", () => {
    const { setSelectedDate, setTimeOfDayMinutes } = useAppStore.getState();
    setSelectedDate("not-a-date");
    expect(useAppStore.getState().selectedDate).toBe(initialState.selectedDate);
    setSelectedDate("2028-02-29");
    expect(useAppStore.getState().selectedDate).toBe("2028-02-29");
    setTimeOfDayMinutes(-1);
    expect(useAppStore.getState().timeOfDayMinutes).toBe(1439);
    setTimeOfDayMinutes(1441);
    expect(useAppStore.getState().timeOfDayMinutes).toBe(1);
  });

  it("clamps atmosphere and life values and clears live-weather metadata on disable", () => {
    const state = useAppStore.getState();
    state.setSeason("wet");
    state.setFestivalAuto(false);
    state.setAtmosphereEnabled(false);
    state.setFloodLevel(Number.NaN);
    expect(useAppStore.getState().floodLevel).toBe(0);
    state.setFloodLevel(2);
    expect(useAppStore.getState().floodLevel).toBe(1);
    state.setTimeSpeed(4);
    state.setRealTimeEnabled(true);
    state.setRealWeatherKind("storm");
    state.setRealWeatherEnabled(true);
    state.setWeather("cloudy");
    expect(useAppStore.getState()).toMatchObject({
      season: "wet",
      festivalAuto: false,
      atmosphereEnabled: false,
      timeSpeed: 4,
      realTimeEnabled: true,
      weather: "cloudy",
      realWeatherEnabled: false,
      realWeatherKind: null,
    });
    state.setRealWeatherKind("rain");
    state.setRealWeatherEnabled(false);
    expect(useAppStore.getState()).toMatchObject({
      realWeatherEnabled: false,
      realWeatherKind: null,
    });
    state.setFestival("tet");
    state.setLifeEnabled(false);
    state.setIllustrativeDetails(false);
    state.setLifeDensity(Number.NaN);
    expect(useAppStore.getState()).toMatchObject({
      festival: "tet",
      lifeEnabled: false,
      illustrativeDetails: false,
      lifeDensity: 0,
    });
    state.setLifeDensity(2);
    expect(useAppStore.getState().lifeDensity).toBe(1);
  });

  it("normalizes camera controls, reset, presentation toggles and progress", () => {
    const state = useAppStore.getState();
    state.setZoom(2);
    state.setViewMode("topdown");
    expect(useAppStore.getState()).toMatchObject({ viewMode: "topdown", zoom: 1 });
    state.setZoom(3);
    state.setViewMode("topdown");
    expect(useAppStore.getState().zoom).toBe(3);
    state.setHeading(-10);
    state.setZoom(Number.POSITIVE_INFINITY);
    expect(useAppStore.getState()).toMatchObject({ heading: 350, zoom: 4 });
    state.zoomIn();
    expect(useAppStore.getState().zoom).toBe(4);
    state.zoomOut();
    expect(useAppStore.getState().zoom).toBe(3.2);
    state.setRidePaused(true);
    state.toggleSound();
    state.toggleTrees();
    state.toggleLabels();
    state.setPlanMeasurement({ metresPerCssPixel: 0.5, revision: 3 });
    state.setLanguage("en");
    state.setLoadingProgress(-1);
    expect(useAppStore.getState()).toMatchObject({
      ridePaused: true,
      soundOn: true,
      showTrees: false,
      showLabels: false,
      planMeasurement: { metresPerCssPixel: 0.5, revision: 3 },
      language: "en",
      loadingProgress: 0,
    });
    state.setPlanMeasurement(null);
    state.setLoadingProgress(2);
    state.resetView();
    expect(useAppStore.getState()).toMatchObject({
      viewMode: "diorama",
      heading: 0,
      zoom: 1,
      viewReset: initialState.viewReset + 1,
      planMeasurement: null,
      loadingProgress: 1,
    });
  });
});
