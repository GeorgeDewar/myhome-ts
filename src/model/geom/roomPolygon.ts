import type { Room } from "../Room";
import type { Wall } from "../Wall";

type Point = { x: number; y: number };

const intersection = (first: Wall, second: Wall): Point | undefined => {
  const a = { x: first.from.x.metres, y: first.from.y.metres };
  const b = { x: first.to.x.metres, y: first.to.y.metres };
  const c = { x: second.from.x.metres, y: second.from.y.metres };
  const d = { x: second.to.x.metres, y: second.to.y.metres };
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (denominator === 0) return undefined;
  const determinantA = a.x * b.y - a.y * b.x;
  const determinantB = c.x * d.y - c.y * d.x;
  return {
    x: (determinantA * (c.x - d.x) - (a.x - b.x) * determinantB) / denominator,
    y: (determinantA * (c.y - d.y) - (a.y - b.y) * determinantB) / denominator,
  };
};

export const roomPolygon = (room: Room): Point[] =>
  room.walls
    .map((wall, index) => intersection(wall, room.walls[(index + 1) % room.walls.length]))
    .filter((corner): corner is Point => corner !== undefined);
