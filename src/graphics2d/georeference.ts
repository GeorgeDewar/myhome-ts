import type { JsonGeoreference } from "../model/json/Document";

export type Point = { x: number; y: number };
const radius = 6378137;
const eccentricitySquared = 0.00669437999014;
export const mercatorLimit = 85.05112878;

const projected = (latitude: number, longitude: number): Point => ({
  x: (radius * longitude * Math.PI) / 180,
  y: radius * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
});

const geographic = (point: Point) => ({
  latitude: ((2 * Math.atan(Math.exp(point.y / radius)) - Math.PI / 2) * 180) / Math.PI,
  longitude: ((((((point.x / radius) * 180) / Math.PI + 180) % 360) + 360) % 360) - 180,
});

export const mapScales = (latitude: number) => {
  const radians = (latitude * Math.PI) / 180;
  const q = 1 - eccentricitySquared * Math.sin(radians) ** 2;
  return { east: Math.sqrt(q) / Math.cos(radians), north: q ** 1.5 / ((1 - eccentricitySquared) * Math.cos(radians)) };
};

const offset = (point: Point, bearing: number, latitude: number): Point => {
  const angle = (bearing * Math.PI) / 180;
  const { east, north } = mapScales(latitude);
  return {
    x: (point.x * Math.cos(angle) - point.y * Math.sin(angle)) * east,
    y: -(point.x * Math.sin(angle) + point.y * Math.cos(angle)) * north,
  };
};

export const planToGeographic = (reference: JsonGeoreference, point: Point) => {
  const origin = projected(reference.latitude, reference.longitude);
  const delta = offset(point, reference.bearing, reference.latitude);
  return geographic({ x: origin.x + delta.x, y: origin.y + delta.y });
};

export const referenceAt = (point: Point, latitude: number, longitude: number, bearing: number): JsonGeoreference => {
  const remainder = bearing % 360;
  const normalizedBearing = remainder < 0 ? (remainder + 360) % 360 : remainder === 0 ? 0 : remainder;
  const target = projected(latitude, longitude);
  let origin = target;
  for (let i = 0; i < 4; i++) {
    const delta = offset(point, normalizedBearing, geographic(origin).latitude);
    origin = { x: target.x - delta.x, y: target.y - delta.y };
  }
  return { ...geographic(origin), bearing: normalizedBearing };
};
