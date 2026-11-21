import { difference, union } from "polygon-clipping";
import polylabel from "polylabel";
import { useContext, useEffect, useRef } from "react";
import { PlanContext } from "../context/PlanContext";
import {
  isSelectionTarget,
  selectionTargetForOpeningItem,
  type SelectionState,
  type SelectionTarget,
} from "../gui/selection";
import type { Fence } from "../model/Fence";
import type { Opening, SlidingDoor, StandardDoor } from "../model/Opening";
import type { Room } from "../model/Room";
import type { Wall } from "../model/Wall";
import { roomPolygon } from "../model/geom/roomPolygon";
import { drawMultiPolygon, slidingDoorLeaves, toPoint, toPolygon } from "./renderPolygons";
import "./PlanView2D.css";

type Point = { x: number; y: number };
type Viewport = { offsetX: number; offsetY: number; scale: number };

export type PlanView2DStatus = { cursor: Point; offset: Point; scale: number };

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
  const sweep = ((isLeftHinged === outward ? -1 : 1) * Math.PI) / 2;
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

const drawOpenings = (context: CanvasRenderingContext2D, walls: Wall[], scale: number) => {
  for (const wall of walls) {
    for (const opening of wall.openings) {
      opening.contents.forEach((content) => {
        if (content.type === "StandardDoor") drawDoor(context, wall, opening, content, scale);
        if (content.type === "SlidingDoor") drawSlidingDoor(context, wall, opening, content, scale);
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

const targetsAtPoint = (point: Point, walls: Wall[], rooms: Room[], fences: Fence[]): SelectionTarget[] => {
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
      opening.contents.forEach((content) => targets.push(selectionTargetForOpeningItem(content, opening)));
    });
  });
  fences.forEach((fence) => {
    if (isInsidePolygon(point, fence.basicPolygon2D().map(toPoint))) targets.push({ kind: "fence", item: fence });
  });
  return targets;
};

const drawSelection = (
  context: CanvasRenderingContext2D,
  targets: SelectionTarget[],
  activeTarget: SelectionTarget | undefined,
  scale: number,
) => {
  targets.forEach((target) => {
    const isActive = activeTarget !== undefined && isSelectionTarget(activeTarget, target);
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

const drawRooms = (context: CanvasRenderingContext2D, rooms: Room[]) => {
  context.fillStyle = "#243b53";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const room of rooms) {
    const corners = roomPolygon(room);
    if (corners.length < 3) continue;

    const ring = [
      ...corners.map((corner) => [corner.x, corner.y] as [number, number]),
      [corners[0].x, corners[0].y] as [number, number],
    ];
    const [labelX, labelY] = polylabel([ring], 0.01);
    const minX = Math.min(...corners.map((corner) => corner.x));
    const maxX = Math.max(...corners.map((corner) => corner.x));
    const minY = Math.min(...corners.map((corner) => corner.y));
    const maxY = Math.max(...corners.map((corner) => corner.y));
    let fontSize = 0.3;

    while (fontSize > 0.1) {
      context.font = `${fontSize}px "IBM Plex Sans", sans-serif`;
      const halfWidth = context.measureText(room.name).width / 2;
      const halfHeight = fontSize / 2;
      if (
        labelX - halfWidth >= minX &&
        labelX + halfWidth <= maxX &&
        labelY - halfHeight >= minY &&
        labelY + halfHeight <= maxY
      )
        break;
      fontSize *= 0.8;
    }

    context.font = `${fontSize}px "IBM Plex Sans", sans-serif`;
    context.fillText(room.name, labelX, labelY);
  }
};

export const PlanView2D = ({
  level,
  onStatusChange,
  selection,
  onSelectionChange,
  onEdit,
  onContextMenu,
  version,
}: {
  level: number;
  onStatusChange: (status: PlanView2DStatus) => void;
  selection: SelectionState;
  onSelectionChange: (selection: SelectionState) => void;
  onEdit: (target: SelectionTarget) => void;
  onContextMenu: (target: SelectionTarget, x: number, y: number) => boolean;
  version: number;
}) => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 20 });
  const hasFittedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plan) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const walls = plan.getWallsOnLevel(level).filter((wall) => !wall.virtual);
    const fences = plan.fences;
    const rooms = plan.getRoomsOnLevel(level);
    const viewport = viewportRef.current;
    let dragOrigin: Point | undefined;
    let cursor = { x: 0, y: 0 };

    const reportStatus = () => {
      onStatusChange({
        cursor,
        offset: { x: -viewport.offsetX / viewport.scale, y: -viewport.offsetY / viewport.scale },
        scale: viewport.scale,
      });
    };

    const fitToPlan = () => {
      if (hasFittedRef.current || !canvas.clientWidth || !canvas.clientHeight) return;
      const points = [...walls, ...fences].flatMap((item) => item.basicPolygon2D().map(toPoint));
      if (points.length === 0) return;
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const padding = 80;
      viewport.scale = Math.max(
        0.1,
        Math.min(
          200,
          Math.max(1, canvas.clientWidth - padding * 2) / (maxX - minX),
          Math.max(1, canvas.clientHeight - padding * 2) / (maxY - minY),
        ),
      );
      viewport.offsetX = (canvas.clientWidth - (minX + maxX) * viewport.scale) / 2;
      viewport.offsetY = (canvas.clientHeight - (minY + maxY) * viewport.scale) / 2;
      hasFittedRef.current = true;
    };

    const render = () => {
      const pixelRatio = window.devicePixelRatio;
      canvas.width = Math.round(canvas.clientWidth * pixelRatio);
      canvas.height = Math.round(canvas.clientHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      context.setTransform(
        viewport.scale * pixelRatio,
        0,
        0,
        viewport.scale * pixelRatio,
        viewport.offsetX * pixelRatio,
        viewport.offsetY * pixelRatio,
      );
      drawGrid(context, canvas, viewport);
      drawFences(context, fences, viewport.scale);
      drawWalls(context, walls, viewport.scale);
      drawOpenings(context, walls, viewport.scale);
      drawRooms(context, rooms);
      drawSelection(context, selection.targets, selection.targets[selection.activeIndex], viewport.scale);
    };

    const resizeObserver = new ResizeObserver(() => {
      fitToPlan();
      render();
    });
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      canvas.focus();
      dragOrigin = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      cursor = {
        x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
      };
      if (!dragOrigin) {
        reportStatus();
        return;
      }
      viewport.offsetX += event.clientX - dragOrigin.x;
      viewport.offsetY += event.clientY - dragOrigin.y;
      dragOrigin = { x: event.clientX, y: event.clientY };
      render();
      reportStatus();
    };
    const pointerUp = (event: PointerEvent) => {
      if (dragOrigin) {
        const moved = Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y) > 3;
        if (!moved) {
          const bounds = canvas.getBoundingClientRect();
          const point = {
            x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
            y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
          };
          const targets = targetsAtPoint(point, walls, rooms, fences);
          onSelectionChange({ targets, activeIndex: targets.length - 1 });
        }
      }
      dragOrigin = undefined;
    };
    const doubleClick = (event: MouseEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
      };
      const targets = targetsAtPoint(point, walls, rooms, fences);
      const activeTarget = targets.at(-1);
      onSelectionChange({ targets, activeIndex: targets.length - 1 });
      if (activeTarget) onEdit(activeTarget);
    };
    const contextMenu = (event: MouseEvent) => {
      const activeTarget = selection.targets[selection.activeIndex];
      if (!activeTarget) return;
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
      };
      if (targetsAtPoint(point, walls, rooms, fences).some((target) => isSelectionTarget(activeTarget, target))) {
        if (onContextMenu(activeTarget, event.clientX, event.clientY)) event.preventDefault();
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextScale = Math.min(200, Math.max(0.1, viewport.scale * zoomFactor));
      const worldPoint = {
        x: (point.x - viewport.offsetX) / viewport.scale,
        y: (point.y - viewport.offsetY) / viewport.scale,
      };
      viewport.scale = nextScale;
      viewport.offsetX = point.x - worldPoint.x * viewport.scale;
      viewport.offsetY = point.y - worldPoint.y * viewport.scale;
      render();
      reportStatus();
    };

    resizeObserver.observe(canvas);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("dblclick", doubleClick);
    canvas.addEventListener("contextmenu", contextMenu);
    canvas.addEventListener("wheel", wheel, { passive: false });
    fitToPlan();
    render();
    reportStatus();
    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("dblclick", doubleClick);
      canvas.removeEventListener("contextmenu", contextMenu);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [level, onContextMenu, onEdit, onSelectionChange, plan, selection, version]);

  return <canvas className="plan-view-2d" ref={canvasRef} tabIndex={0} />;
};
