import type { MultiPolygon, Polygon } from "polygon-clipping";

type Point = { x: number; y: number };

export const toPoint = (point: { x: { metres: number }; y: { metres: number } }): Point => ({
  x: point.x.metres,
  y: point.y.metres,
});

export const toPolygon = (points: Point[]): Polygon => [
  [...points.map((point) => [point.x, point.y] as [number, number]), [points[0].x, points[0].y]],
];

export const drawMultiPolygon = (context: CanvasRenderingContext2D, geometry: MultiPolygon) => {
  context.beginPath();
  geometry.forEach((polygon) => {
    polygon.forEach((ring) => {
      context.moveTo(ring[0][0], ring[0][1]);
      ring.slice(1).forEach(([x, y]) => context.lineTo(x, y));
      context.closePath();
    });
  });
};

