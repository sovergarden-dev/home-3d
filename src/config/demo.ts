/** Public demo intentionally has no geographic configuration or external data endpoint. */
export const DEMO_CONFIG = Object.freeze({
  mode: "fictional" as const,
  seed: 20261013,
  realStreetEnabled: false,
  realWeatherEnabled: false,
  privateDataEnabled: false,
});
