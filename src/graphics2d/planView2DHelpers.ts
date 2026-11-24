import { difference, union } from "polygon-clipping";
import type { LayerVisibility } from "../gui/Layers";
import { isSelectionTarget, selectionTargetForOpeningItem, type SelectionTarget } from "../gui/selection";
import type { Fence } from "../model/Fence";
import type { Opening, SlidingDoor, StandardDoor } from "../model/Opening";
import type { Room } from "../model/Room";
import type { Wall } from "../model/Wall";
import { doorSweep } from "../model/geom/doorSweep";
import { roomPolygon } from "../model/geom/roomPolygon";
import { drawMultiPolygon, slidingDoorLeaves, toPoint, toPolygon } from "./renderPolygons";

type Point = { x: number; y: number };
type Viewport = { offsetX: number; offsetY: number; scale: number };

const GRID_SIZE_METRES = 1;
const GRID_COLOR = "#d9e2ec";

const openingPoints = (wall: Wall, opening: Opening) => {
  const from = toPoint(wall.from);
  const to = toPoint(wall.to);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const normal = { x: -direction.y, y: direction.x };
  const halfWidth = opening.width.metres / 2;
  const start = {
    x: from.x + direction.x * (opening.distanceAlongWall.metres - halfWidth),
    y: from.y + direction.y * (opening.distanceAlongWall.metres - halfWidth),
  };
  const end = { x: start.x + direction.x * opening.width.metres, y: start.y + direction.y * opening.width.metres };
  return { direction, end, normal, start };
};

const openingPolygon = (wall: Wall, opening: Opening) => {
  const { end, normal, start } = openingPoints(wall, opening);
  const halfWallWidth = wall.width.metres / 2;
  return [
    { x: start.x + normal.x * halfWallWidth, y: start.y + normal.y * halfWallWidth },
    { x: end.x + normal.x * halfWallWidth, y: end.y + normal.y * halfWallWidth },
    { x: end.x - normal.x * halfWallWidth, y: end.y - normal.y * halfWallWidth },
    { x: start.x - normal.x * halfWallWidth, y: start.y - normal.y * halfWallWidth },
  ];
};

const drawPolygon = (context: CanvasRenderingContext2D, points: Point[]) => {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
};

export const drawGrid = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, viewport: Viewport) => {
  const left = -viewport.offsetX / viewport.scale;
  const top = -viewport.offsetY / viewport.scale;
  const right = left + canvas.clientWidth / viewport.scale;
  const bottom = top + canvas.clientHeight / viewport.scale;

  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1 / viewport.scale;
  context.beginPath();
  for (let x = Math.floor(left / GRID_SIZE_METRES) * GRID_SIZE_METRES; x <= right; x += GRID_SIZE_METRES) {
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }
  for (let y = Math.floor(top / GRID_SIZE_METRES) * GRID_SIZE_METRES; y <= bottom; y += GRID_SIZE_METRES) {
    context.moveTo(left, y);
    context.lineTo(right, y);
  }
  context.stroke();

  context.strokeStyle = "#d64545";
  context.lineWidth = 1.5 / viewport.scale;
  context.beginPath();
  context.moveTo(-10 / viewport.scale, 0);
  context.lineTo(10 / viewport.scale, 0);
  context.moveTo(0, -10 / viewport.scale);
  context.lineTo(0, 10 / viewport.scale);
  context.stroke();
};

export const drawWalls = (context: CanvasRenderingContext2D, walls: Wall[], scale: number, virtual = false) => {
  if (walls.length === 0) return;
  const wallGeometry = walls.map((wall) => toPolygon(wall.basicPolygon2D().map(toPoint)));
  const openingGeometry = walls.flatMap((wall) =>
    wall.openings.map((opening) => {
      const { end, normal, start } = openingPoints(wall, opening);
      const halfWallWidth = wall.width.metres / 2;
      return toPolygon([
        { x: start.x + normal.x * halfWallWidth, y: start.y + normal.y * halfWallWidth },
        { x: end.x + normal.x * halfWallWidth, y: end.y + normal.y * halfWallWidth },
        { x: end.x - normal.x * halfWallWidth, y: end.y - normal.y * halfWallWidth },
        { x: start.x - normal.x * halfWallWidth, y: start.y - normal.y * halfWallWidth },
      ]);
    }),
  );
  const mergedWalls = union(wallGeometry[0], ...wallGeometry.slice(1));
  const wallArea = openingGeometry.length > 0 ? difference(mergedWalls, ...openingGeometry) : mergedWalls;

  context.fillStyle = virtual ? "rgba(100, 100, 100, 0.12)" : "#ffd700";
  context.strokeStyle = virtual ? "#666666" : "#1f2933";
  context.lineWidth = 1 / scale;
  if (virtual) context.setLineDash([6 / scale, 4 / scale]);
  drawMultiPolygon(context, wallArea);
  context.fill("evenodd");
  context.stroke();
  if (virtual) context.setLineDash([]);
};

export const drawFences = (context: CanvasRenderingContext2D, fences: Fence[], scale: number) => {
  const geometry = fences.map((fence) => toPolygon(fence.basicPolygon2D().map(toPoint)));
  if (geometry.length === 0) return;
  const fenceArea = union(geometry[0], ...geometry.slice(1));
  context.fillStyle = "#8b5a2b";
  context.strokeStyle = "#6b3f1c";
  context.lineWidth = 1 / scale;
  drawMultiPolygon(context, fenceArea);
  context.fill("evenodd");
  context.stroke();
};

const drawWindow = (context: CanvasRenderingContext2D, wall: Wall, opening: Opening, scale: number) => {
  const { end, normal, start } = openingPoints(wall, opening);
  const halfWallWidth = wall.width.metres / 2;
  context.strokeStyle = "#1f2933";
  context.lineWidth = 1 / scale;
  [-halfWallWidth, 0, halfWallWidth].forEach((offset) => {
    context.beginPath();
    context.moveTo(start.x + normal.x * offset, start.y + normal.y * offset);
    context.lineTo(end.x + normal.x * offset, end.y + normal.y * offset);
    context.stroke();
  });
};

const drawDoor = (
  context: CanvasRenderingContext2D,
  wall: Wall,
  opening: Opening,
  door: StandardDoor,
  scale: number,
) => {
  const { direction, end, normal, start } = openingPoints(wall, opening);
  const isLeftHinged = door.hingeSide === "left";
  const hingeEdge = isLeftHinged ? start : end;
  const outward = door.swingDirection === "out";
  const hingeOffset = ((outward ? -1 : 1) * wall.width.metres) / 2;
  const hinge = { x: hingeEdge.x + normal.x * hingeOffset, y: hingeEdge.y + normal.y * hingeOffset };
  const closedDirection = isLeftHinged ? direction : { x: -direction.x, y: -direction.y };
  const sweep = doorSweep(door);
  const rotatedDirection = {
    x: closedDirection.x * Math.cos(sweep) - closedDirection.y * Math.sin(sweep),
    y: closedDirection.x * Math.sin(sweep) + closedDirection.y * Math.cos(sweep),
  };
  const leafEnd = {
    x: hinge.x + rotatedDirection.x * opening.width.metres,
    y: hinge.y + rotatedDirection.y * opening.width.metres,
  };
  const leafNormal = { x: -rotatedDirection.y, y: rotatedDirection.x };
  const leafSide = { x: -leafNormal.x * door.leafThickness.metres, y: -leafNormal.y * door.leafThickness.metres };
  const startAngle = Math.atan2(closedDirection.y, closedDirection.x);

  context.strokeStyle = "#1f2933";
  context.lineWidth = 1 / scale;
  drawPolygon(context, [
    hinge,
    leafEnd,
    { x: leafEnd.x + leafSide.x, y: leafEnd.y + leafSide.y },
    { x: hinge.x + leafSide.x, y: hinge.y + leafSide.y },
  ]);
  context.stroke();
  context.beginPath();
  context.arc(hinge.x, hinge.y, opening.width.metres, startAngle, startAngle + sweep, sweep < 0);
  context.stroke();
};

const drawSlidingDoor = (
  context: CanvasRenderingContext2D,
  wall: Wall,
  opening: Opening,
  door: SlidingDoor,
  scale: number,
) => {
  const { start, end, normal } = openingPoints(wall, opening);
  context.strokeStyle = "#1f2933";
  context.lineWidth = 1 / scale;
  for (const leaf of slidingDoorLeaves(start, end, normal, door.leafThickness.metres)) {
    drawPolygon(context, leaf);
    context.stroke();
  }
};

export const drawOpenings = (context: CanvasRenderingContext2D, walls: Wall[], scale: number, showDoors: boolean) => {
  for (const wall of walls) {
    for (const opening of wall.openings) {
      opening.contents.forEach((content) => {
        if (showDoors && content.type === "StandardDoor") drawDoor(context, wall, opening, content, scale);
        if (showDoors && content.type === "SlidingDoor") drawSlidingDoor(context, wall, opening, content, scale);
        if (content.type === "StandardWindow") drawWindow(context, wall, opening, scale);
      });
    }
  }
};

const isInsidePolygon = (point: Point, polygon: Point[]) => {
  let isInside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (
      current.y > point.y !== prior.y > point.y &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x
    ) {
      isInside = !isInside;
    }
  }
  return isInside;
};

export const targetsAtPoint = (
  point: Point, walls: Wall[], rooms: Room[], fences: Fence[], showDoors: boolean,
): SelectionTarget[] => {
  const targets: SelectionTarget[] = [];
  rooms.forEach((room) => {
    const corners = roomPolygon(room);
    if (corners.length >= 3 && isInsidePolygon(point, corners)) targets.push({ kind: "room", item: room });
  });
  walls.forEach((wall) => {
    if (!isInsidePolygon(point, wall.basicPolygon2D().map(toPoint))) return;
    targets.push({ kind: "wall", item: wall });
    wall.openings.forEach((opening) => {
      if (!isInsidePolygon(point, openingPolygon(wall, opening))) return;
      targets.push({ kind: "opening", item: opening });
      opening.contents.forEach((content) => {
        if (showDoors || content.type === "StandardWindow") {
          targets.push(selectionTargetForOpeningItem(content, opening));
        }
      });
    });
  });
  fences.forEach((fence) => {
    if (isInsidePolygon(point, fence.basicPolygon2D().map(toPoint))) targets.push({ kind: "fence", item: fence });
  });
  return targets;
};

export const isVisibleTarget = (target: SelectionTarget, walls: Wall[], fences: Fence[], showDoors: boolean) => {
  if (target.kind === "room") return true;
  if (target.kind === "roomLabel") return false;
  if (target.kind === "fence") return fences.includes(target.item);
  if (target.kind === "wall") return walls.includes(target.item);
  if ((target.kind === "door" || target.kind === "slidingDoor") && !showDoors) return false;
  const wall = target.kind === "opening" ? target.item.wall : target.opening.wall;
  return wall !== undefined && walls.includes(wall);
};

export const visibleWalls = (walls: Wall[], visibility: LayerVisibility) =>
  walls.filter((wall) =>
    wall.virtual || wall.attic
      ? (wall.virtual && visibility.virtualWalls) || (wall.attic && visibility.atticWalls)
      : visibility.normalWalls,
  );

export const drawSelection = (
  context: CanvasRenderingContext2D,
  targets: SelectionTarget[],
  activeTarget: SelectionTarget | undefined,
  scale: number,
) => {
  targets.forEach((target) => {
    const isActive = activeTarget !== undefined && isSelectionTarget(activeTarget, target);
    if (target.kind === "roomLabel") return;
    context.strokeStyle = isActive ? "#d64545" : "#2680c2";
    context.lineWidth = (isActive ? 3 : 1.5) / scale;
    if (target.kind === "room") {
      const corners = roomPolygon(target.item);
      if (corners.length >= 3) {
        drawPolygon(context, corners);
        context.stroke();
      }
      return;
    }
    if (target.kind === "wall" || target.kind === "fence") {
      drawPolygon(context, target.item.basicPolygon2D().map(toPoint));
      context.stroke();
      return;
    }
    const wall = target.kind === "opening" ? target.item.wall : target.opening.wall;
    const opening = target.kind === "opening" ? target.item : target.opening;
    if (!wall) return;
    drawPolygon(context, openingPolygon(wall, opening));
    context.stroke();
  });
};

