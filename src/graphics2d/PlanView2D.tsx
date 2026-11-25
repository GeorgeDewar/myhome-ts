import { useContext, useEffect, useLayoutEffect, useRef } from "react";
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
  doubleClickSelection, drawFences, drawGrid, drawOpenings, drawSelection, drawWalls,
  isVisibleTarget, selectionAtPoint, targetsAtPoint, visibleWalls,
} from "./planView2DHelpers";
import { toPoint } from "./renderPolygons";
import {
  drawRoomLabel, labelDragUpdate, labelHit, labelLayout, oppositeLabelCorner, type LabelLayout,
} from "./roomLabel";
import type { JsonRoomLabel } from "../model/json/Document";
import type { JsonGeoreference } from "../model/json/Document";
import { BaseMap, type BaseMapSettings } from "./BaseMap";
import { planToGeographic, referenceAt } from "./georeference";
import "./PlanView2D.css";

type Point = { x: number; y: number };
type Viewport = { offsetX: number; offsetY: number; scale: number };

export type PlanView2DStatus = { cursor: Point; offset: Point; scale: number };
export type MapAlignment = {
  reference: JsonGeoreference;
  pivot: Point;
  choosingPivot: boolean;
  onReferenceChange: (reference: JsonGeoreference) => void;
  onPivotChange: (pivot: Point) => void;
};

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
  baseMap,
  alignment,
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
  baseMap?: { settings: BaseMapSettings; reference: JsonGeoreference; status: PlanView2DStatus };
  alignment?: MapAlignment;
}) => {
  const plan = useContext(PlanContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ offsetX: 0, offsetY: 0, scale: 20 });
  const hasFittedRef = useRef(false);
  const wallStartRef = useRef<JsonPosition>(undefined);
  const selectedLabelRef = useRef<Room>(undefined);
  const doubleClickStartRef = useRef<SelectionState>(undefined);
  const alignmentRef = useRef(alignment);
  const renderRef = useRef<() => void>(() => undefined);
  useLayoutEffect(() => { alignmentRef.current = alignment; }, [alignment]);

  useEffect(() => { renderRef.current(); }, [alignment]);

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
    selectedLabelRef.current = layerVisibility.roomLabels && active?.kind === "roomLabel" && rooms.includes(active.item)
      ? active.item : undefined;
    let dragOrigin: Point | undefined;
    let dragStart: Point | undefined;
    let hasPanned = false;
    let mapDragReference: JsonGeoreference | undefined;
    let labelDrag: {
      room: Room;
      mode: "move" | "resize" | "rotate";
      start: Point;
      layout: LabelLayout;
      oppositeCorner?: Point;
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
        selectedTargets(selection).filter((target) => isVisibleTarget(target, walls, rooms, fences, layerVisibility.doors)),
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
      const currentAlignment = alignmentRef.current;
      if (currentAlignment) {
        const { pivot } = currentAlignment;
        context.strokeStyle = "#d64545";
        context.lineWidth = 2 / viewport.scale;
        context.beginPath();
        context.arc(pivot.x, pivot.y, 7 / viewport.scale, 0, Math.PI * 2);
        context.moveTo(pivot.x - 12 / viewport.scale, pivot.y);
        context.lineTo(pivot.x + 12 / viewport.scale, pivot.y);
        context.moveTo(pivot.x, pivot.y - 12 / viewport.scale);
        context.lineTo(pivot.x, pivot.y + 12 / viewport.scale);
        context.stroke();
      }
    };
    renderRef.current = render;

    const resizeObserver = new ResizeObserver(() => {
      fitToPlan();
      render();
    });
    const mouseDown = (event: MouseEvent) => {
      if (event.button === 0 && event.detail % 2 === 1) doubleClickStartRef.current = selection;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      canvas.focus();
      if (alignmentRef.current) {
        dragOrigin = { x: event.clientX, y: event.clientY };
        dragStart = dragOrigin;
        mapDragReference = alignmentRef.current.reference;
        hasPanned = false;
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (!drawingWall && layerVisibility.roomLabels && !event.metaKey) {
        const point = worldPoint(event);
        const selected = selectedLabelRef.current;
        const room = active?.kind === "room" || active?.kind === "roomLabel" ? active.item : undefined;
        if (room && rooms.includes(room)) {
          const layout = labelLayout(context, room);
          const mode = layout && labelHit(layout, point, viewport.scale, selected === room);
          const hits = mode && selectionAtPoint(
            context, point, walls, rooms, fences, layerVisibility.doors, layerVisibility.roomLabels, viewport.scale,
          );
          const top = hits && hits.targets[hits.activeIndex];
          const otherLabelHasPriority = top?.kind === "roomLabel" && top.item !== room;
          if (layout && mode && !otherLabelHasPriority && (!event.ctrlKey || mode !== "move")) {
            selectedLabelRef.current = room;
            labelDrag = {
              room, mode, start: point, layout, previousSelected: selected,
              ...(mode === "resize" ? { oppositeCorner: oppositeLabelCorner(layout, point, viewport.scale) } : {}),
            };
            canvas.setPointerCapture(event.pointerId);
            render();
            return;
          }
        }
      }
      dragOrigin = { x: event.clientX, y: event.clientY };
      dragStart = dragOrigin;
      hasPanned = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      cursor = worldPoint(event);
      const currentAlignment = alignmentRef.current;
      if (currentAlignment && dragStart && mapDragReference) {
        const dx = (event.clientX - dragStart.x) / viewport.scale;
        const dy = (event.clientY - dragStart.y) / viewport.scale;
        if (Math.hypot(dx, dy) * viewport.scale > 3) hasPanned = true;
        if (hasPanned && !currentAlignment.choosingPivot) {
          const location = planToGeographic(mapDragReference, {
            x: currentAlignment.pivot.x - dx, y: currentAlignment.pivot.y - dy,
          });
          currentAlignment.onReferenceChange(referenceAt(currentAlignment.pivot, location.latitude, location.longitude,
            mapDragReference.bearing));
        }
        reportStatus();
        return;
      }
      if (labelDrag) {
        if (labelDrag.update || Math.hypot(cursor.x - labelDrag.start.x, cursor.y - labelDrag.start.y) * viewport.scale > 2) {
          labelDrag.update = labelDragUpdate(labelDrag.layout, labelDrag.mode, labelDrag.start, cursor, {
            free: event.ctrlKey,
            ...(event.shiftKey && labelDrag.mode === "resize" ? { oppositeCorner: labelDrag.oppositeCorner } : {}),
          });
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
      if (!hasPanned && dragStart && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) <= 3) {
        reportStatus();
        return;
      }
      hasPanned = true;
      viewport.offsetX += event.clientX - dragOrigin.x;
      viewport.offsetY += event.clientY - dragOrigin.y;
      dragOrigin = { x: event.clientX, y: event.clientY };
      render();
      reportStatus();
    };
    const pointerUp = (event: PointerEvent) => {
      const currentAlignment = alignmentRef.current;
      if (currentAlignment && dragStart) {
        if (currentAlignment.choosingPivot && !hasPanned) {
          const point = worldPoint(event);
          const endpoints = [...allWalls, ...plan.fences].flatMap((item) => [toPoint(item.from), toPoint(item.to)]);
          const nearest = endpoints.reduce<Point | undefined>((best, candidate) =>
            Math.hypot(candidate.x - point.x, candidate.y - point.y) <= 10 / viewport.scale &&
            (!best || Math.hypot(candidate.x - point.x, candidate.y - point.y) < Math.hypot(best.x - point.x, best.y - point.y))
              ? candidate : best, undefined);
          currentAlignment.onPivotChange(nearest ?? point);
        }
        dragOrigin = undefined;
        dragStart = undefined;
        mapDragReference = undefined;
        return;
      }
      if (labelDrag) {
        const { room, update } = labelDrag;
        labelDrag = undefined;
        if (update) {
          const result = editPlan.updateRoom(room, { label: update });
          if (!result.ok) window.alert(result.error);
        }
        const next = selectionAtPoint(
          context, worldPoint(event), walls, rooms, fences, layerVisibility.doors, layerVisibility.roomLabels, viewport.scale,
        );
        const index = next.targets.findIndex((target) => target.kind === "roomLabel" && target.item === room);
        const layout = labelLayout(context, room);
        if (index >= 0) onSelectionChange({ ...next, activeIndex: index });
        else if (layout) onSelectionChange({
          targets: [{ kind: "roomLabel", item: room }], activeIndex: 0,
        });
        render();
        return;
      }
      if (dragOrigin && dragStart) {
        const moved = hasPanned || Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 3;
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
          const next = selectionAtPoint(
            context, point, walls, rooms, fences, layerVisibility.doors, layerVisibility.roomLabels, viewport.scale,
          );
          const targets = next.targets;
          selectedLabelRef.current = undefined;
          if (event.ctrlKey || event.metaKey) {
            const room = targets.findLast((target) => target.kind === "room");
            if (room?.kind === "room") onToggleRoom(room.item);
            dragOrigin = undefined;
            return;
          }
          onSelectionChange(next);
        }
      }
      dragOrigin = undefined;
    };
    const pointerCancel = () => {
      if (alignmentRef.current && mapDragReference) alignmentRef.current.onReferenceChange(mapDragReference);
      dragOrigin = undefined;
      dragStart = undefined;
      mapDragReference = undefined;
      if (labelDrag) selectedLabelRef.current = labelDrag.previousSelected;
      labelDrag = undefined;
      render();
    };
    const doubleClick = (event: MouseEvent) => {
      if (drawingWall || alignmentRef.current) return;
      const before = doubleClickStartRef.current ?? selection;
      doubleClickStartRef.current = undefined;
      const priorActive = before.targets[before.activeIndex];
      const point = worldPoint(event);
      const hits = selectionAtPoint(
        context, point, walls, rooms, fences, layerVisibility.doors, layerVisibility.roomLabels, viewport.scale,
      );
      const top = hits.targets[hits.activeIndex];
      const otherLabelHasPriority = top?.kind === "roomLabel" && top.item !== priorActive?.item;
      if (priorActive?.kind === "roomLabel" && layerVisibility.roomLabels) {
        const layout = labelLayout(context, priorActive.item);
        if (layout && !otherLabelHasPriority && labelHit(layout, point, viewport.scale, true)) {
          onSelectionChange({ targets: [priorActive], activeIndex: 0 });
          onEdit(priorActive);
          return;
        }
      }
      const next = doubleClickSelection(before, hits);
      const activeTarget = next.targets[next.activeIndex];
      onSelectionChange(next);
      if (activeTarget) onEdit(activeTarget);
    };
    const contextMenu = (event: MouseEvent) => {
      if (drawingWall || alignmentRef.current) return;
      const bounds = canvas.getBoundingClientRect();
      const point = {
        x: (event.clientX - bounds.left - viewport.offsetX) / viewport.scale,
        y: (event.clientY - bounds.top - viewport.offsetY) / viewport.scale,
      };
      const activeTarget = selection.targets[selection.activeIndex];
      if (activeTarget?.kind === "roomLabel" && layerVisibility.roomLabels) {
        const layout = labelLayout(context, activeTarget.item);
        if (layout && labelHit(layout, point, viewport.scale, true)) {
          if (onContextMenu(activeTarget, event.clientX, event.clientY)) event.preventDefault();
          return;
        }
      }
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
      const pivot = alignmentRef.current?.pivot;
      const point = pivot
        ? { x: pivot.x * viewport.scale + viewport.offsetX, y: pivot.y * viewport.scale + viewport.offsetY }
        : { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
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
    canvas.addEventListener("mousedown", mouseDown);
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
      renderRef.current = () => undefined;
      resizeObserver.disconnect();
      canvas.removeEventListener("mousedown", mouseDown);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerCancel);
      canvas.removeEventListener("dblclick", doubleClick);
      canvas.removeEventListener("contextmenu", contextMenu);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [drawingWall, editPlan, layerVisibility, level, onContextMenu, onDrawWall, onEdit, onSelectionChange, onStatusChange, onToggleRoom, plan, selection, version]);

  return <div className="plan-view-host">
    {baseMap && <BaseMap {...baseMap} rooms={plan?.getRoomsOnLevel(level) ?? []} version={version} level={level} />}
    <canvas className={`plan-view-2d${drawingWall ? " is-drawing" : ""}`} ref={canvasRef} tabIndex={0} />
  </div>;
};
