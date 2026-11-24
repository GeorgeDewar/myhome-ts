import polylabel from "polylabel";
import type { JsonRoomLabel } from "../model/json/Document";
import type { Room } from "../model/Room";
import { roomPolygon } from "../model/geom/roomPolygon";

type Point = { x: number; y: number };
export type LabelLayout = {
  position: Point;
  rotation: number;
  fontSize: number;
  lines: string[];
  bounds: { left: number; top: number; right: number; bottom: number };
};

const setFont = (context: CanvasRenderingContext2D, fontSize: number) => {
  context.font = `${fontSize}px "IBM Plex Sans", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
};

export const labelLayout = (
  context: CanvasRenderingContext2D,
  room: Room,
  label: JsonRoomLabel | undefined = room.label,
): LabelLayout | undefined => {
  const corners = roomPolygon(room);
  if (corners.length < 3) return;
  const ring = [
    ...corners.map((corner) => [corner.x, corner.y] as [number, number]),
    [corners[0].x, corners[0].y] as [number, number],
  ];
  const [x, y] = polylabel([ring], 0.01);
  const position = label?.position ? { x: label.position[0] / 1000, y: label.position[1] / 1000 } : { x, y };
  const lines = (label?.text ?? room.name).split("\n");
  let fontSize = label?.fontSize === undefined ? 0.3 : label.fontSize / 1000;
  if (label?.fontSize === undefined) {
    const minX = Math.min(...corners.map((corner) => corner.x));
    const maxX = Math.max(...corners.map((corner) => corner.x));
    const minY = Math.min(...corners.map((corner) => corner.y));
    const maxY = Math.max(...corners.map((corner) => corner.y));
    while (fontSize > 0.1) {
      setFont(context, fontSize);
      const halfWidth = Math.max(...lines.map((line) => context.measureText(line).width)) / 2;
      const halfHeight = fontSize * (1 + (lines.length - 1) * 1.2) / 2;
      if (x - halfWidth >= minX && x + halfWidth <= maxX && y - halfHeight >= minY && y + halfHeight <= maxY) break;
      fontSize *= 0.8;
    }
  }
  const measurementScale = 1000;
  setFont(context, fontSize * measurementScale);
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  lines.forEach((line, index) => {
    const metrics = context.measureText(line);
    const lineY = (index - (lines.length - 1) / 2) * fontSize * 1.2;
    bounds.left = Math.min(bounds.left, -metrics.actualBoundingBoxLeft / measurementScale);
    bounds.right = Math.max(bounds.right, metrics.actualBoundingBoxRight / measurementScale);
    bounds.top = Math.min(bounds.top, lineY - metrics.actualBoundingBoxAscent / measurementScale);
    bounds.bottom = Math.max(bounds.bottom, lineY + metrics.actualBoundingBoxDescent / measurementScale);
  });
  if (bounds.left === bounds.right) {
    bounds.left = -fontSize * 0.1;
    bounds.right = fontSize * 0.1;
  }
  if (bounds.top === bounds.bottom) {
    bounds.top -= fontSize / 2;
    bounds.bottom += fontSize / 2;
  }
  return { position, rotation: label?.rotation ?? 0, fontSize, lines, bounds };
};

const rotate = (point: Point, angle: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});

export const labelWorldPoint = (layout: LabelLayout, point: Point): Point => {
  const rotated = rotate(point, -layout.rotation * Math.PI / 180);
  return { x: layout.position.x + rotated.x, y: layout.position.y + rotated.y };
};

export const labelLocalPoint = (layout: LabelLayout, point: Point): Point =>
  rotate({ x: point.x - layout.position.x, y: point.y - layout.position.y }, layout.rotation * Math.PI / 180);

export const labelHandles = (layout: LabelLayout, scale: number) => {
  const { left, right, top, bottom } = layout.bounds;
  return {
    corners: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }],
    rotation: { x: (left + right) / 2, y: top - 24 / scale },
  };
};

export const labelHit = (layout: LabelLayout, point: Point, scale: number, selected: boolean) => {
  const local = labelLocalPoint(layout, point);
  const handles = labelHandles(layout, scale);
  if (selected) {
    if (Math.hypot(local.x - handles.rotation.x, local.y - handles.rotation.y) <= 7 / scale) return "rotate";
    if (handles.corners.some((corner) => Math.hypot(local.x - corner.x, local.y - corner.y) <= 8 / scale)) return "resize";
  }
  const { left, right, top, bottom } = layout.bounds;
  if (local.x >= left && local.x <= right && local.y >= top && local.y <= bottom) return "move";
};

export const labelDragUpdate = (
  layout: LabelLayout, mode: "move" | "resize" | "rotate", start: Point, point: Point, freeRotation: boolean,
): JsonRoomLabel => {
  if (mode === "move") return {
    position: [
      Math.round((layout.position.x + point.x - start.x) * 1000),
      Math.round((layout.position.y + point.y - start.y) * 1000),
    ],
  };
  if (mode === "resize") {
    const dx = start.x - layout.position.x;
    const dy = start.y - layout.position.y;
    const factor = ((point.x - layout.position.x) * dx + (point.y - layout.position.y) * dy) / (dx * dx + dy * dy);
    return { fontSize: Math.max(1, layout.fontSize * 1000 * factor) };
  }
  const startAngle = Math.atan2(start.y - layout.position.y, start.x - layout.position.x);
  const angle = Math.atan2(point.y - layout.position.y, point.x - layout.position.x);
  const delta = Math.atan2(Math.sin(angle - startAngle), Math.cos(angle - startAngle));
  const rotation = layout.rotation - delta * 180 / Math.PI;
  return { rotation: freeRotation ? rotation : Math.round(rotation / 45) * 45 };
};

export const drawRoomLabel = (context: CanvasRenderingContext2D, layout: LabelLayout, selected: boolean, scale: number) => {
  context.save();
  context.translate(layout.position.x, layout.position.y);
  context.rotate(-layout.rotation * Math.PI / 180);
  setFont(context, layout.fontSize);
  context.fillStyle = "#243b53";
  layout.lines.forEach((line, index) => {
    context.fillText(line, 0, (index - (layout.lines.length - 1) / 2) * layout.fontSize * 1.2);
  });
  if (selected) {
    const { left, top, right, bottom } = layout.bounds;
    const handles = labelHandles(layout, scale);
    context.strokeStyle = "#d64545";
    context.lineWidth = 1 / scale;
    context.strokeRect(left, top, right - left, bottom - top);
    context.beginPath();
    context.moveTo((left + right) / 2, top);
    context.lineTo(handles.rotation.x, handles.rotation.y);
    context.stroke();
    context.fillStyle = "#ffffff";
    for (const point of [...handles.corners, handles.rotation]) {
      context.beginPath();
      context.rect(point.x - 4 / scale, point.y - 4 / scale, 8 / scale, 8 / scale);
      context.fill();
      context.stroke();
    }
  }
  context.restore();
};
