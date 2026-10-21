export interface AstronomyReference {
  latitude: number;
  longitude: number;
}
export interface CelestialBody {
  azimuth: number;
  elevation: number;
  direction: [number, number, number];
}
export interface AstronomyResult {
  sun: CelestialBody | null;
  moon: CelestialBody | null;
  synthetic: boolean;
}
export interface SunEvents {
  sunriseMinutes: number | null;
  sunsetMinutes: number | null;
  phaseMoon: number;
}
const RAD = Math.PI / 180;
const SYNTHETIC: AstronomyReference = { latitude: 15, longitude: 105 };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function body(ra: number, dec: number, jd: number, lat: number, lon: number): CelestialBody {
  const d = jd - 2451545,
    lst = (280.46061837 + 360.98564736629 * d + lon) * RAD;
  const h = lst - ra,
    la = lat * RAD;
  const altitude = Math.asin(
    clamp(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(h), -1, 1),
  );
  const az =
    Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(la) - Math.tan(dec) * Math.cos(la)) + Math.PI;
  const azimuth = (((az / RAD) % 360) + 360) % 360,
    ar = azimuth * RAD;
  return {
    azimuth,
    elevation: altitude / RAD,
    direction: [
      Math.sin(ar) * Math.cos(altitude),
      Math.sin(altitude),
      -Math.cos(ar) * Math.cos(altitude),
    ],
  };
}
function validDate(dateISO: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return null;
  const y = +m[1]!,
    mo = +m[2]!,
    d = +m[3]!,
    check = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || y > 2100) return null;
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d
    ? { y, mo, d }
    : null;
}
function julianAt(dateISO: string, minutes: number) {
  const p = validDate(dateISO);
  if (!p || !Number.isFinite(minutes) || minutes < 0 || minutes > 1440) return null;
  return (Date.UTC(p.y, p.mo - 1, p.d) + (minutes - 420) * 60000) / 86400000 + 2440587.5;
}
function positions(dateISO: string, minutes: number, ref: AstronomyReference): AstronomyResult {
  const jd = julianAt(dateISO, minutes);
  if (jd === null) return { sun: null, moon: null, synthetic: false };
  const n = jd - 2451545,
    L = (280.46 + 0.9856474 * n) * RAD,
    g = (357.528 + 0.9856003 * n) * RAD;
  const sunLon = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD,
    eps = (23.439 - 0.0000004 * n) * RAD;
  const sunRa = Math.atan2(Math.cos(eps) * Math.sin(sunLon), Math.cos(sunLon)),
    sunDec = Math.asin(Math.sin(eps) * Math.sin(sunLon));
  const moonLon = (218.316 + 13.176396 * n) * RAD,
    moonLat = 5.145 * RAD * Math.sin((134.963 + 13.064993 * n) * RAD);
  const moonRa = Math.atan2(
    Math.sin(moonLon) * Math.cos(eps) - Math.tan(moonLat) * Math.sin(eps),
    Math.cos(moonLon),
  );
  const moonDec = Math.asin(
    Math.sin(moonLat) * Math.cos(eps) + Math.cos(moonLat) * Math.sin(eps) * Math.sin(moonLon),
  );
  return {
    sun: body(sunRa, sunDec, jd, ref.latitude, ref.longitude),
    moon: body(moonRa, moonDec, jd, ref.latitude, ref.longitude),
    synthetic: false,
  };
}
export function getAstronomy(
  dateISO: string,
  minutes: number,
  reference: AstronomyReference | null,
): AstronomyResult {
  if (!validDate(dateISO) || !Number.isFinite(minutes))
    return { sun: null, moon: null, synthetic: false };
  const ref = reference ?? SYNTHETIC;
  if (
    !Number.isFinite(ref.latitude) ||
    !Number.isFinite(ref.longitude) ||
    ref.latitude < -90 ||
    ref.latitude > 90 ||
    ref.longitude < -180 ||
    ref.longitude > 180
  )
    return { sun: null, moon: null, synthetic: false };
  const result = positions(dateISO, minutes, ref);
  return { ...result, synthetic: reference === null };
}
export function phaseMoon(dateISO: string, minutes = 720): number | null {
  const jd = julianAt(dateISO, minutes);
  if (jd === null) return null;
  return ((((jd - 2451550.25972) / 29.530588853) % 1) + 1) % 1;
}
export function sunEvents(dateISO: string, reference: AstronomyReference | null): SunEvents | null {
  if (!validDate(dateISO)) return null;
  const ref = reference ?? SYNTHETIC;
  if (
    !Number.isFinite(ref.latitude) ||
    !Number.isFinite(ref.longitude) ||
    ref.latitude < -90 ||
    ref.latitude > 90 ||
    ref.longitude < -180 ||
    ref.longitude > 180
  )
    return null;
  let rise: number | null = null,
    set: number | null = null;
  let previous = getAstronomy(dateISO, 0, ref).sun?.elevation ?? NaN;
  for (let minute = 10; minute <= 1440; minute += 10) {
    const current = getAstronomy(dateISO, minute, ref).sun?.elevation ?? NaN;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
    if (previous < -0.833 && current >= -0.833 && rise === null)
      rise = minute - 10 + (10 * (-0.833 - previous)) / (current - previous);
    if (previous >= -0.833 && current < -0.833 && set === null)
      set = minute - 10 + (10 * (previous + 0.833)) / (previous - current);
    previous = current;
  }
  return {
    sunriseMinutes: rise === null ? null : Math.round(rise),
    sunsetMinutes: set === null ? null : Math.round(set),
    phaseMoon: phaseMoon(dateISO) ?? 0,
  };
}
