import { difference, union, type MultiPolygon, type Polygon } from "polygon-clipping";
import { useContext, useEffect, useRef } from "react";
import { PlanContext } from "../context/PlanContext";
import type { Opening, StandardDoor } from "../model/Opening";
import type { Room } from "../model/Room";
import type { Wall } from "../model/Wall";
import "./PlanView2D.css";

type Point = { x: number; y: number };
type Viewport = { offsetX: number; offsetY: number; scale: number };

const GRID_SIZE_METRES = 1;
const GRID_COLOR = "#d9e2ec";

const toPoint = (point: { x: { metres: number }; y: { metres: number } }): Point => ({
  x: point.x.metres,
  y: point.y.metres,
});

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
  const end = {
    x: start.x + direction.x * opening.width.metres,
    y: start.y + direction.y * opening.width.metres,
  };
  return { direction, end, normal, start };
};

const drawPolygon = (context: CanvasRenderingContext2D, points: Point[]) => {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
};

const toPolygon = (points: Point[]): Polygon => [[...points.map((point) => [point.x, point.y] as [number, number]), [points[0].x, points[0].y]]];

const drawMultiPolygon = (context: CanvasRenderingContext2D, geometry: MultiPolygon) => {
  context.beginPath();
  geometry.forEach((polygon) => {
    polygon.forEach((ring) => {
      context.moveTo(ring[0][0], ring[0][1]);
      ring.slice(1).forEach(([x, y]) => context.lineTo(x, y));
      context.closePath();
    });
  });
};

const drawGrid = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, viewport: Viewport) => {
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

const drawWalls = (context: CanvasRenderingContext2D, walls: Wall[], scale: number) => {
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

  context.fillStyle = "#ffd700";
  context.strokeStyle = "#1f2933";
  context.lineWidth = 1 / scale;
  drawMultiPolygon(context, wallArea);
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

const drawDoor = (context: CanvasRenderingContext2D, wall: Wall, opening: Opening, door: StandardDoor, scale: number) => {
  const { direction, end, normal, start } = openingPoints(wall, opening);
  const isLeftHinged = door.hingeSide === "left";
  const hingeEdge = isLeftHinged ? start : end;
  const outward = door.swingDirection === "out";
  const hingeOffset = (outward ? -1 : 1) * wall.width.metres / 2;
  const hinge = { x: hingeEdge.x + normal.x * hingeOffset, y: hingeEdge.y + normal.y * hingeOffset };
  const closedDirection = isLeftHinged ? direction : { x: -direction.x, y: -direction.y };
  const sweep = (isLeftHinged === outward ? -1 : 1) * Math.PI / 2;
  const rotatedDirection = {
    x: closedDirection.x * Math.cos(sweep) - closedDirection.y * Math.sin(sweep),
    y: closedDirection.x * Math.sin(sweep) + closedDirection.y * Math.cos(sweep),
  };
  const leafEnd = { x: hinge.x + rotatedDirection.x * opening.width.metres, y: hinge.y + rotatedDirection.y * opening.width.metres };
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

const drawOpenings = (context: CanvasRenderingContext2D, walls: Wall[], scale: number) => {
  for (const wall of walls) {
    for (const opening of wall.openings) {
      opening.contents.forEach((content) => {
        if (content.type === "StandardDoor") drawDoor(context, wall, opening, content, scale);
        if (content.type === "StandardWindow") drawWindow(context, wall, opening, scale);
      });
    }
  }
};

const intersection = (first: Wall, second: Wall): Point | undefined => {
  const a = toPoint(first.from);
  const b = toPoint(first.to);
  const c = toPoint(second.from);
  const d = toPoint(second.to);
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (denominator === 0) return undefined;
  const determinantA = a.x * b.y - a.y * b.x;
  const determinantB = c.x * d.y - c.y * d.x;
  return {
    x: (determinantA * (c.x - d.x) - (a.x - b.x) * determinantB) / denominator,
    y: (determinantA * (c.y - d.y) - (a.y - b.y) * determinantB) / denominator,
  };
};

const drawRooms = (context: CanvasRenderingContext2D, rooms: Room[], scale: number) => {
  context.fillStyle = "#243b53";
  context.font = `${0.28 / scale}px "IBM Plex Sans", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const room of rooms) {
    const corners = room.walls.map((wall, index) => intersection(wall, room.walls[(index + 1) % room.walls.length])).filter(
      (corner): corner is Point => corner !== undefined,
    );
    if (corners.length === 0) continue;
    const center = corners.reduce((sum, corner) => ({ x: sum.x + corner.x, y: sum.y + corner.y }), { x: 0, y: 0 });
    context.fillText(room.name, center.x / corners.length, center.y / corners.length);
  }
};

export const PlanView2D = ({ level }: { level: number }) => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 20 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plan) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const walls = plan.getWallsOnLevel(level);
    const rooms = plan.getRoomsOnLevel(level);
    const viewport = viewportRef.current;
    let didFit = false;
    let dragOrigin: Point | undefined;

    const fitToPlan = () => {
      if (didFit || walls.length === 0 || !canvas.clientWidth || !canvas.clientHeight) return;
      const points = walls.flatMap((wall) => [toPoint(wall.from), toPoint(wall.to)]);
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const padding = 80;
      viewport.scale = Math.max(12, Math.min((canvas.clientWidth - padding * 2) / (maxX - minX), (canvas.clientHeight - padding * 2) / (maxY - minY)));
      viewport.offsetX = (canvas.clientWidth - (minX + maxX) * viewport.scale) / 2;
      viewport.offsetY = (canvas.clientHeight - (minY + maxY) * viewport.scale) / 2;
      didFit = true;
    };

    const render = () => {
      const pixelRatio = window.devicePixelRatio;
      canvas.width = Math.round(canvas.clientWidth * pixelRatio);
      canvas.height = Math.round(canvas.clientHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      context.setTransform(viewport.scale * pixelRatio, 0, 0, viewport.scale * pixelRatio, viewport.offsetX * pixelRatio, viewport.offsetY * pixelRatio);
      drawGrid(context, canvas, viewport);
      drawWalls(context, walls, viewport.scale);
      drawOpenings(context, walls, viewport.scale);
      drawRooms(context, rooms, viewport.scale);
    };

    const resizeObserver = new ResizeObserver(() => {
      fitToPlan();
      render();
    });
    const pointerDown = (event: PointerEvent) => {
      dragOrigin = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragOrigin) return;
      viewport.offsetX += event.clientX - dragOrigin.x;
      viewport.offsetY += event.clientY - dragOrigin.y;
      dragOrigin = { x: event.clientX, y: event.clientY };
      render();
    };
    const pointerUp = () => { dragOrigin = undefined; };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextScale = Math.min(200, Math.max(12, viewport.scale * zoomFactor));
      const worldPoint = { x: (point.x - viewport.offsetX) / viewport.scale, y: (point.y - viewport.offsetY) / viewport.scale };
      viewport.scale = nextScale;
      viewport.offsetX = point.x - worldPoint.x * viewport.scale;
      viewport.offsetY = point.y - worldPoint.y * viewport.scale;
      render();
    };

    resizeObserver.observe(canvas);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    fitToPlan();
    render();
    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [level, plan]);

  return <canvas className="plan-view-2d" ref={canvasRef} />;
};