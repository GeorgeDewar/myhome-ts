import type { MultiPolygon, Polygon } from "polygon-clipping";

type Point = { x: number; y: number };

export const toPoint = (point: { x: { metres: number }; y: { metres: number } }): Point => ({
  x: point.x.metres,
  y: point.y.metres,
});

export const toPolygon = (points: Point[]): Polygon => [
  [...points.map((point) => [point.x, point.y] as [number, number]), [points[0].x, points[0].y]],
];

export const slidingDoorLeaves = (start: Point, end: Point, normal: Point, thickness: number): Point[][] => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const offset = { x: normal.x * thickness, y: normal.y * thickness };
  const leftEnd = { x: start.x + dx * 0.55, y: start.y + dy * 0.55 };
  const rightStart = { x: start.x + dx * 0.45, y: start.y + dy * 0.45 };

  return [
    [
      start,
      leftEnd,
      { x: leftEnd.x + offset.x, y: leftEnd.y + offset.y },
      { x: start.x + offset.x, y: start.y + offset.y },
    ],
    [
      { x: rightStart.x - offset.x, y: rightStart.y - offset.y },
      { x: end.x - offset.x, y: end.y - offset.y },
      end,
      rightStart,
    ],
  ];
};

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
