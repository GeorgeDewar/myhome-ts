import { union, xor, type Pair, type Polygon } from "polygon-clipping";
import { Room } from "../Room";
import type { Wall } from "../Wall";
import { roomPolygon } from "./roomPolygon";

type Point = { x: number; y: number };
type Edge = { start: Point; end: Point; wall: Wall };

const tolerance = 1e-7;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const area = (points: Point[]) => {
  const origin = points[0];
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + (point.x - origin.x) * (next.y - origin.y) - (next.x - origin.x) * (point.y - origin.y);
  }, 0)) / 2;
};
const polygon = (points: Point[]): Polygon => [
  [...points.map(({ x, y }): Pair => [x, y]), [points[0].x, points[0].y]],
];
const onSegment = (point: Point, start: Point, end: Point) =>
  Math.abs(distance(start, point) + distance(point, end) - distance(start, end)) <= tolerance;
const onLine = (point: Point, wall: Wall) => {
  const start = { x: wall.from.x.metres, y: wall.from.y.metres };
  const end = { x: wall.to.x.metres, y: wall.to.y.metres };
  return Math.abs((point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x)) /
    distance(start, end) <= tolerance;
};

export const mergeRoomWalls = (rooms: readonly Room[]): Wall[] | undefined => {
  const polygons: Polygon[] = [];
  const edges: Edge[] = [];
  let totalArea = 0;
  for (const room of rooms) {
    const points = roomPolygon(room);
    if (points.length < 3 || points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return;
    const roomArea = area(points);
    if (roomArea <= tolerance) return;
    totalArea += roomArea;
    polygons.push(polygon(points));
    for (let i = 0; i < points.length; i++) {
      const start = points[i];
      const end = points[(i + 1) % points.length];
      if (distance(start, end) <= tolerance) continue;
      const wall = room.walls.find((candidate) => onLine(start, candidate) && onLine(end, candidate));
      if (!wall) return;
      edges.push({ start, end, wall });
    }
  }
  if (polygons.length < 2) return;
  const merged = union(polygons[0], ...polygons.slice(1));
  if (merged.length !== 1 || merged[0].length !== 1) return;
  const perimeter = merged[0][0].slice(0, -1).map(([x, y]) => ({ x, y }));
  const mergedArea = area(perimeter);
  if (Math.abs(totalArea - mergedArea) > Math.max(tolerance, mergedArea * 1e-9)) return;

  const walls: Wall[] = [];
  for (let i = 0; i < perimeter.length; i++) {
    const start = perimeter[i];
    const end = perimeter[(i + 1) % perimeter.length];
    const points = [start, end, ...edges.flatMap((edge) => [edge.start, edge.end])]
      .filter((point) => onSegment(point, start, end))
      .sort((a, b) => distance(start, a) - distance(start, b));
    for (let j = 0; j < points.length - 1; j++) {
      const a = points[j];
      const b = points[j + 1];
      if (distance(a, b) <= tolerance) continue;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const edge = edges.find((candidate) =>
        onSegment(midpoint, candidate.start, candidate.end) &&
        onLine(a, candidate.wall) && onLine(b, candidate.wall),
      );
      if (!edge) return;
      if (walls.at(-1) !== edge.wall) walls.push(edge.wall);
    }
  }
  if (walls.length > 1 && walls[0] === walls.at(-1)) walls.pop();
  if (walls.length < 3) return;
  const result = roomPolygon(new Room("", walls));
  if (result.length < 3) return;
  const difference = xor(merged, polygon(result));
  const differenceArea = difference.reduce((sum, shape) => sum + shape.reduce((shapeArea, ring, index) =>
    shapeArea + (index === 0 ? 1 : -1) * area(ring.map(([x, y]) => ({ x, y }))), 0), 0);
  if (differenceArea > Math.max(tolerance, mergedArea * 1e-9)) return;
  return walls;
};
