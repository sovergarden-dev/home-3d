export interface GeodeticPoint {
  longitude: number;
  latitude: number;
  altitude?: number;
}

export interface EnuPoint {
  east: number;
  north: number;
  up: number;
}

interface EcefPoint {
  x: number;
  y: number;
  z: number;
}

const SEMI_MAJOR_AXIS = 6378137;
const FLATTENING = 1 / 298.257223563;
const ECCENTRICITY_SQUARED = FLATTENING * (2 - FLATTENING);
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function assertGeodetic(point: GeodeticPoint) {
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new Error("GEO_LONGITUDE_OUT_OF_RANGE");
  }
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    throw new Error("GEO_LATITUDE_OUT_OF_RANGE");
  }
  if (point.altitude !== undefined && !Number.isFinite(point.altitude)) {
    throw new Error("GEO_ALTITUDE_INVALID");
  }
}

export function geodeticToEcef(point: GeodeticPoint): EcefPoint {
  assertGeodetic(point);
  const latitude = point.latitude * RAD;
  const longitude = point.longitude * RAD;
  const altitude = point.altitude ?? 0;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const radius = SEMI_MAJOR_AXIS / Math.sqrt(1 - ECCENTRICITY_SQUARED * sinLatitude ** 2);

  return {
    x: (radius + altitude) * cosLatitude * Math.cos(longitude),
    y: (radius + altitude) * cosLatitude * Math.sin(longitude),
    z: (radius * (1 - ECCENTRICITY_SQUARED) + altitude) * sinLatitude,
  };
}

export function ecefToGeodetic(point: EcefPoint): Required<GeodeticPoint> {
  const longitude = Math.atan2(point.y, point.x);
  const radialDistance = Math.hypot(point.x, point.y);
  let latitude = Math.atan2(point.z, radialDistance * (1 - ECCENTRICITY_SQUARED));
  let altitude = 0;

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sinLatitude = Math.sin(latitude);
    const radius = SEMI_MAJOR_AXIS / Math.sqrt(1 - ECCENTRICITY_SQUARED * sinLatitude ** 2);
    altitude = radialDistance / Math.cos(latitude) - radius;
    const nextLatitude = Math.atan2(
      point.z,
      radialDistance * (1 - (ECCENTRICITY_SQUARED * radius) / (radius + altitude)),
    );
    if (Math.abs(nextLatitude - latitude) < 1e-13) {
      latitude = nextLatitude;
      break;
    }
    latitude = nextLatitude;
  }

  const sinLatitude = Math.sin(latitude);
  const radius = SEMI_MAJOR_AXIS / Math.sqrt(1 - ECCENTRICITY_SQUARED * sinLatitude ** 2);
  altitude = radialDistance / Math.cos(latitude) - radius;
  return { longitude: longitude * DEG, latitude: latitude * DEG, altitude };
}

export function geodeticToEnu(point: GeodeticPoint, origin: GeodeticPoint): EnuPoint {
  assertGeodetic(point);
  assertGeodetic(origin);
  const source = geodeticToEcef(point);
  const reference = geodeticToEcef(origin);
  const latitude = origin.latitude * RAD;
  const longitude = origin.longitude * RAD;
  const dx = source.x - reference.x;
  const dy = source.y - reference.y;
  const dz = source.z - reference.z;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinLongitude = Math.sin(longitude);
  const cosLongitude = Math.cos(longitude);

  return {
    east: -sinLongitude * dx + cosLongitude * dy,
    north: -sinLatitude * cosLongitude * dx - sinLatitude * sinLongitude * dy + cosLatitude * dz,
    up: cosLatitude * cosLongitude * dx + cosLatitude * sinLongitude * dy + sinLatitude * dz,
  };
}

export function enuToGeodetic(point: EnuPoint, origin: GeodeticPoint): Required<GeodeticPoint> {
  assertGeodetic(origin);
  if (![point.east, point.north, point.up].every(Number.isFinite)) {
    throw new Error("ENU_COORDINATE_INVALID");
  }

  const reference = geodeticToEcef(origin);
  const latitude = origin.latitude * RAD;
  const longitude = origin.longitude * RAD;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinLongitude = Math.sin(longitude);
  const cosLongitude = Math.cos(longitude);

  return ecefToGeodetic({
    x:
      reference.x -
      sinLongitude * point.east -
      sinLatitude * cosLongitude * point.north +
      cosLatitude * cosLongitude * point.up,
    y:
      reference.y +
      cosLongitude * point.east -
      sinLatitude * sinLongitude * point.north +
      cosLatitude * sinLongitude * point.up,
    z: reference.z + cosLatitude * point.north + sinLatitude * point.up,
  });
}
