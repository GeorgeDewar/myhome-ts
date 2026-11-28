// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanContext } from "../context/PlanContext";
import type { SelectionState } from "../gui/selection";
import { Plan } from "../model/Plan";
import { PlanEditor } from "../model/PlanEditor";
import { PlanView2D, type PlanTool } from "./PlanView2D";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLCanvasElement.prototype, "setPointerCapture");
  document.body.replaceChildren();
});

const mount = async (tool?: PlanTool, onPlaceOpening: (...args: unknown[]) => boolean = () => false) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  const context = new Proxy({}, { get: () => () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", { configurable: true, value: () => {} });

  const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{ number: 0, name: "Ground", walls: [
    { id: "wall", start: [0, 0], end: [4000, 0], width: 100 },
  ] }] }] });
  const wall = plan.buildings[0].levels[0].walls[0];
  const onSelectionChange = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const Harness = () => {
    const [selection, setSelection] = useState<SelectionState>({ targets: [], activeIndex: -1 });
    return createElement(PlanContext.Provider, { value: plan }, createElement(PlanView2D, {
      level: 0,
      layerVisibility: { fences: true, normalWalls: true, virtualWalls: false, atticWalls: false,
        roomLabels: true, doors: true, compass: true },
      onStatusChange: () => {},
      selection,
      onSelectionChange: (next) => { onSelectionChange(next); setSelection(next); },
      onToggleRoom: () => {},
      onToggleOpening: () => {},
      onEdit: () => {},
      onContextMenu: () => false,
      tool,
      onDrawLine: () => false,
      onPlaceOpening,
      editPlan: new PlanEditor(plan, () => {}),
      version: 0,
    }));
  };
  await act(() => root.render(createElement(Harness)));
  const canvas = host.querySelector("canvas")!;
  const pointer = (type: string, x: number, y: number) =>
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
  return { wall, onSelectionChange, pointer, root };
};

describe("plan pointer gestures", () => {
  it("selects on clicks but preserves selection when panning over a wall", async () => {
    const { wall, onSelectionChange, pointer, root } = await mount();

    await act(() => { pointer("pointerdown", 200, 200); pointer("pointerup", 200, 200); });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      targets: [{ kind: "wall", item: wall }], activeIndex: 0,
    });
    onSelectionChange.mockClear();

    await act(() => {
      pointer("pointerdown", 200, 200);
      pointer("pointermove", 220, 220);
      pointer("pointerup", 220, 220);
    });
    expect(onSelectionChange).not.toHaveBeenCalled();

    await act(() => { pointer("pointerdown", 220, 220); pointer("pointerup", 221, 220); });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      targets: [{ kind: "wall", item: wall }], activeIndex: 0,
    });
    onSelectionChange.mockClear();
    await act(() => { pointer("pointerdown", 220, 220); pointer("pointerup", 230, 220); });
    expect(onSelectionChange).not.toHaveBeenCalled();
    await act(() => root.unmount());
  });

  it("places an opening where the wall is clicked, and only on a wall", async () => {
    const onPlaceOpening = vi.fn(() => true);
    const { wall, onSelectionChange, pointer, root } = await mount("opening", onPlaceOpening);
    await act(() => { pointer("pointerdown", 200, 200); pointer("pointerup", 200, 200); });
    expect(onPlaceOpening).toHaveBeenCalledWith(wall, expect.closeTo(2000, 0));
    await act(() => { pointer("pointerdown", 200, 100); pointer("pointerup", 200, 100); });
    expect(onPlaceOpening).toHaveBeenCalledOnce();
    expect(onSelectionChange).not.toHaveBeenCalled();
    await act(() => root.unmount());
  });
});
