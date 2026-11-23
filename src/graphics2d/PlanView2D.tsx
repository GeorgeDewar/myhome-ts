import { useContext, useEffect, useRef } from "react";
import { PlanContext } from "../context/PlanContext";
import type { LayerVisibility } from "../gui/Layers";
import {
  isSelectionTarget,
  selectedTargets,
  type SelectionState,
  type SelectionTarget,
} from "../gui/selection";
import type { JsonPosition } from "../model/json/Document";
import type { Room } from "../model/Room";
import {
  drawFences, drawGrid, drawOpenings, drawRooms, drawSelection, drawWalls,
  isVisibleTarget, targetsAtPoint, visibleWalls,
} from "./planView2DHelpers";
import { toPoint } from "./renderPolygons";
import "./PlanView2D.css";

type Point = { x: number; y: number };
type Viewport = { offsetX: number; offsetY: number; scale: number };

export type PlanView2DStatus = { cursor: Point; offset: Point; scale: number };

export const PlanView2D = ({
  level,
  layerVisibility,
  onStatusChange,
  selection,
  onSelectionChange,
  onToggleRoom,
  onEdit,
  onContextMenu,
  drawingWall,
  onDrawWall,
  version,
}: {
  level: number;
  layerVisibility: LayerVisibility;
  onStatusChange: (status: PlanView2DStatus) => void;
  selection: SelectionState;
  onSelectionChange: (selection: SelectionState) => void;
  onToggleRoom: (room: Room) => void;
  onEdit: (target: SelectionTarget) => void;
  onContextMenu: (target: SelectionTarget, x: number, y: number) => boolean;
  drawingWall: boolean;
  onDrawWall: (start: JsonPosition, end: JsonPosition) => boolean;
  version: number;
}) => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 20 });
  const hasFittedRef = useRef(false);
  const wallStartRef = useRef<JsonPosition>(undefined);

  useEffect(() => {
    if (!drawingWall) wallStartRef.current = undefined;
  }, [drawingWall]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plan) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const allWalls = plan.getWallsOnLevel(level);
    const walls = visibleWalls(allWalls, layerVisibility);
    const fences = layerVisibility.fences ? plan.fences : [];
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
      const fitItems = [...allWalls.filter((wall) => !wall.virtual && !wall.attic), ...plan.fences];
      if (fitItems.length === 0) fitItems.push(...allWalls);
      const points = fitItems.flatMap((item) => item.basicPolygon2D().map(toPoint));
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
      drawWalls(context, walls.filter((wall) => !wall.virtual && !wall.attic), viewport.scale);
      drawWalls(context, walls.filter((wall) => wall.virtual || wall.attic), viewport.scale, true);
      drawOpenings(context, walls, viewport.scale, layerVisibility.doors);
      if (layerVisibility.roomLabels) drawRooms(context, rooms);
      drawSelection(
        context,
        selectedTargets(selection).filter((target) => isVisibleTarget(target, walls, fences, layerVisibility.doors)),
        selection.targets[selection.activeIndex],
        viewport.scale,
      );
      if (drawingWall && wallStartRef.current) {
        context.beginPath();
        context.moveTo(wallStartRef.current[0] / 1000, wallStartRef.current[1] / 1000);
        context.lineTo(cursor.x, cursor.y);
        context.strokeStyle = "#d64545";
        context.lineWidth = 2 / viewport.scale;
        context.setLineDash([6 / viewport.scale, 4 / viewport.scale]);
        context.stroke();
        context.setLineDash([]);
      }
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
      if (drawingWall) {
        render();
        reportStatus();
        return;
      }
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
          if (drawingWall) {
            cursor = point;
            const position: JsonPosition = [Math.round(point.x * 1000), Math.round(point.y * 1000)];
            if (!wallStartRef.current) wallStartRef.current = position;
            else if (onDrawWall(wallStartRef.current, position)) wallStartRef.current = undefined;
            render();
            dragOrigin = undefined;
            return;
          }
          const targets = targetsAtPoint(point, walls, rooms, fences, layerVisibility.doors);
          if (event.ctrlKey || event.metaKey) {
            const room = targets.findLast((target) => target.kind === "room");
            if (room?.kind === "room") onToggleRoom(room.item);
            dragOrigin = undefined;
            return;
          }
          onSelectionChange({ targets, activeIndex: targets.length - 1 });
        }
      }
      dragOrigin = undefined;
    };
    const pointerCancel = () => { dragOrigin = undefined; };
    const doubleClick = (event: MouseEvent) => {
      if (drawingWall) return;
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
      };
      const targets = targetsAtPoint(point, walls, rooms, fences, layerVisibility.doors);
      const activeTarget = targets.at(-1);
      onSelectionChange({ targets, activeIndex: targets.length - 1 });
      if (activeTarget) onEdit(activeTarget);
    };
    const contextMenu = (event: MouseEvent) => {
      if (drawingWall) return;
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
      };
      const activeTarget = selection.targets[selection.activeIndex];
      const hits = targetsAtPoint(point, walls, rooms, fences, layerVisibility.doors);
      const target = hits.find((candidate) => activeTarget && isSelectionTarget(activeTarget, candidate)) ??
        hits.find((candidate) => candidate.kind === "room" && selection.rooms?.includes(candidate.item));
      if (target) {
        if (onContextMenu(target, event.clientX, event.clientY)) event.preventDefault();
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
    canvas.addEventListener("pointercancel", pointerCancel);
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
      canvas.removeEventListener("pointercancel", pointerCancel);
      canvas.removeEventListener("dblclick", doubleClick);
      canvas.removeEventListener("contextmenu", contextMenu);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [drawingWall, layerVisibility, level, onContextMenu, onDrawWall, onEdit, onSelectionChange, onStatusChange, onToggleRoom, plan, selection, version]);

  return <canvas className={`plan-view-2d${drawingWall ? " is-drawing" : ""}`} ref={canvasRef} tabIndex={0} />;
};
