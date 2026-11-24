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
import type { PlanEditor } from "../model/PlanEditor";
import type { Room } from "../model/Room";
import {
  drawFences, drawGrid, drawOpenings, drawSelection, drawWalls,
  isVisibleTarget, targetsAtPoint, visibleWalls,
} from "./planView2DHelpers";
import { toPoint } from "./renderPolygons";
import { drawRoomLabel, labelDragUpdate, labelHit, labelLayout, type LabelLayout } from "./roomLabel";
import type { JsonRoomLabel } from "../model/json/Document";
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
  editPlan,
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
  editPlan: PlanEditor;
  version: number;
}) => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 20 });
  const hasFittedRef = useRef(false);
  const wallStartRef = useRef<JsonPosition>(undefined);
  const selectedLabelRef = useRef<Room>(undefined);

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
    const active = selection.targets[selection.activeIndex];
    if (!layerVisibility.roomLabels || active?.kind !== "room" || active.item !== selectedLabelRef.current) {
      selectedLabelRef.current = undefined;
    }
    let dragOrigin: Point | undefined;
    let labelDrag: {
      room: Room;
      mode: "move" | "resize" | "rotate";
      start: Point;
      layout: LabelLayout;
      previousSelected?: Room;
      update?: JsonRoomLabel;
    } | undefined;
    let cursor = { x: 0, y: 0 };

    const worldPoint = (event: MouseEvent | PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
      };
    };

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
      drawSelection(
        context,
        selectedTargets(selection).filter((target) => isVisibleTarget(target, walls, fences, layerVisibility.doors)),
        selection.targets[selection.activeIndex],
        viewport.scale,
      );
      if (layerVisibility.roomLabels) {
        for (const room of rooms) {
          const label = labelDrag?.room === room && labelDrag.update
            ? { ...room.label, ...labelDrag.update } : room.label;
          const layout = labelLayout(context, room, label);
          if (layout) drawRoomLabel(context, layout, selectedLabelRef.current === room, viewport.scale);
        }
      }
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
      if (!drawingWall && layerVisibility.roomLabels && !event.metaKey) {
        const point = worldPoint(event);
        const selected = selectedLabelRef.current;
        const candidates = selected ? [selected, ...rooms.filter((room) => room !== selected).reverse()] : [...rooms].reverse();
        for (const room of candidates) {
          const layout = labelLayout(context, room);
          const mode = layout && labelHit(layout, point, viewport.scale, selected === room);
          if (layout && mode && (!event.ctrlKey || mode === "rotate")) {
            selectedLabelRef.current = room;
            labelDrag = { room, mode, start: point, layout, previousSelected: selected };
            canvas.setPointerCapture(event.pointerId);
            render();
            return;
          }
        }
      }
      dragOrigin = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      cursor = worldPoint(event);
      if (labelDrag) {
        if (labelDrag.update || Math.hypot(cursor.x - labelDrag.start.x, cursor.y - labelDrag.start.y) * viewport.scale > 2) {
          labelDrag.update = labelDragUpdate(labelDrag.layout, labelDrag.mode, labelDrag.start, cursor, event.ctrlKey);
        }
        render();
        reportStatus();
        return;
      }
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
      if (labelDrag) {
        const { room, update } = labelDrag;
        labelDrag = undefined;
        if (update) {
          const result = editPlan.updateRoom(room, { label: update });
          if (!result.ok) window.alert(result.error);
        }
        onSelectionChange({ targets: [{ kind: "room", item: room }], activeIndex: 0 });
        render();
        return;
      }
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
          selectedLabelRef.current = undefined;
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
    const pointerCancel = () => {
      dragOrigin = undefined;
      if (labelDrag) selectedLabelRef.current = labelDrag.previousSelected;
      labelDrag = undefined;
      render();
    };
    const doubleClick = (event: MouseEvent) => {
      if (drawingWall) return;
      if (selectedLabelRef.current && layerVisibility.roomLabels) {
        const layout = labelLayout(context, selectedLabelRef.current);
        if (layout && labelHit(layout, worldPoint(event), viewport.scale, true)) {
          onEdit({ kind: "room", item: selectedLabelRef.current });
          return;
        }
      }
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
  }, [drawingWall, editPlan, layerVisibility, level, onContextMenu, onDrawWall, onEdit, onSelectionChange, onStatusChange, onToggleRoom, plan, selection, version]);

  return <canvas className={`plan-view-2d${drawingWall ? " is-drawing" : ""}`} ref={canvasRef} tabIndex={0} />;
};
