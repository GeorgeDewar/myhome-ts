import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Layers, type LayerVisibility } from "../gui/Layers";
import { selectedTargets, toggleRoomSelection } from "../gui/selection";
import { Fence } from "../model/Fence";
import { Plan } from "../model/Plan";
import { Room } from "../model/Room";
import { drawFences, drawOpenings, isVisibleTarget, targetsAtPoint, visibleWalls } from "./PlanView2D";
import { slidingDoorLeaves } from "./renderPolygons";

describe("room multi-selection", () => {
  it("adds and removes rooms without treating overlapping hit candidates as selected rooms", () => {
    const first = new Room("First", []);
    const second = new Room("Second", []);
    const fence = Fence.fromJson({ id: "f", start: [0, 0], end: [1000, 0] });
    const initial = {
      targets: [{ kind: "room" as const, item: first }, { kind: "fence" as const, item: fence }],
      activeIndex: 0,
    };
    const both = toggleRoomSelection(initial, second);
    expect(selectedTargets(both)).toEqual([{ kind: "room", item: first }, { kind: "room", item: second }]);
    expect(both.targets[both.activeIndex]).toEqual({ kind: "room", item: second });
    const one = toggleRoomSelection(both, first);
    expect(selectedTargets(one)).toEqual([{ kind: "room", item: second }]);
    expect(toggleRoomSelection(one, second)).toEqual({ targets: [], activeIndex: -1 });
  });
});

describe("drawFences", () => {
  it("draws fence geometry in brown", () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
    };
    const fences = [Fence.fromJson({ id: "fence", start: [0, 0], end: [1000, 0] })];

    drawFences(context as unknown as CanvasRenderingContext2D, fences, 20);

    expect(context.fillStyle).toBe("#8b5a2b");
    expect(context.strokeStyle).toBe("#6b3f1c");
    expect(context.fill).toHaveBeenCalledWith("evenodd");
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenCalledOnce();
    expect(context.lineTo).toHaveBeenCalled();
  });

  describe("2D layers", () => {
    const visibility: LayerVisibility = {
      fences: true, normalWalls: true, virtualWalls: false, roomLabels: true, doors: true,
    };
    const setup = () => {
      const plan = Plan.fromJson({
        buildings: [{
          name: "House",
          levels: [{
            number: 0,
            name: "Ground",
            walls: [
              {
                id: "normal",
                start: [0, 0],
                end: [4000, 0],
                openings: [{
                  id: "opening",
                  width: 1000,
                  distanceAlongWall: 2000,
                  contents: [
                    { type: "StandardDoor", hingeSide: "left", swingDirection: "in" },
                    { type: "SlidingDoor" },
                    { type: "StandardWindow" },
                  ],
                }],
              },
              { id: "virtual", start: [0, 1000], end: [4000, 1000], virtual: true },
            ],
          }],
        }],
      });

      const walls = plan.buildings[0].levels[0].walls;
      return { walls, opening: walls[0].openings[0] };
    };

    it("renders all layer controls with the supplied visibility", () => {
      const markup = renderToStaticMarkup(
        createElement(Layers, { visibility, onChange: () => {} }),
      );
      expect(markup).toContain('<input type="checkbox"/>Walls, virtual');
      for (const label of ["Fences", "Walls, normal", "Room labels", "Doors"]) {
        expect(markup).toContain(`<input type="checkbox" checked=""/>${label}`);
      }
    });

    it("filters normal and virtual walls independently, including their selection highlights", () => {
      const { walls, opening } = setup();
      const visible = visibleWalls(walls, { ...visibility, normalWalls: false, virtualWalls: true });
      expect(visible).toEqual([walls[1]]);
      expect(targetsAtPoint({ x: 2, y: 0 }, visible, [], [], true)).toEqual([]);
      expect(targetsAtPoint({ x: 2, y: 1 }, visible, [], [], true)).toEqual([{ kind: "wall", item: walls[1] }]);
      expect(isVisibleTarget({ kind: "opening", item: opening }, visible, [], true)).toBe(false);
      expect(isVisibleTarget({ kind: "wall", item: walls[1] }, visible, [], true)).toBe(true);
    });

    it("does not select or highlight a hidden fence", () => {
      const fence = Fence.fromJson({ id: "fence", start: [0, 0], end: [1000, 0] });
      expect(targetsAtPoint({ x: 0.5, y: 0 }, [], [], [fence], true)).toEqual([{ kind: "fence", item: fence }]);
      expect(targetsAtPoint({ x: 0.5, y: 0 }, [], [], [], true)).toEqual([]);
      expect(isVisibleTarget({ kind: "fence", item: fence }, [], [], true)).toBe(false);
    });

    it("hides both kinds of doors without hiding windows or openings", () => {
      const { walls, opening } = setup();
      const context = {
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        stroke: vi.fn(), arc: vi.fn(), strokeStyle: "", lineWidth: 0,
      };
      drawOpenings(context as unknown as CanvasRenderingContext2D, [walls[0]], 20, false);
      expect(context.stroke).toHaveBeenCalledTimes(3);
      expect(context.arc).not.toHaveBeenCalled();
      const targets = targetsAtPoint({ x: 2, y: 0 }, [walls[0]], [], [], false);
      expect(targets.map((target) => target.kind)).toEqual(["wall", "opening", "window"]);
      const [door, slidingDoor] = opening.contents;
      if (door.type !== "StandardDoor" || slidingDoor.type !== "SlidingDoor") throw new Error("Unexpected door type");
      expect(isVisibleTarget({ kind: "door", item: door, opening }, [walls[0]], [], false)).toBe(false);
      expect(isVisibleTarget({ kind: "slidingDoor", item: slidingDoor, opening }, [walls[0]], [], false)).toBe(false);

      drawOpenings(context as unknown as CanvasRenderingContext2D, [walls[0]], 20, true);
      expect(context.arc).toHaveBeenCalledOnce();
      expect(targetsAtPoint({ x: 2, y: 0 }, [walls[0]], [], [], true).map((target) => target.kind))
        .toEqual(["wall", "opening", "door", "slidingDoor", "window"]);
    });
  });

  describe("slidingDoorLeaves", () => {
    it("creates overlapping horizontal leaves with the specified thickness", () => {
      const [left, right] = slidingDoorLeaves({ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 0, y: 1 }, 0.06);

      expect(left[0]).toEqual({ x: 1, y: 2 });
      expect(right[2]).toEqual({ x: 3, y: 2 });
      expect(left[1].x).toBeGreaterThan(right[3].x);
      expect(left[2].y - left[1].y).toBeCloseTo(0.06);
      expect(right[2].y - right[1].y).toBeCloseTo(0.06);
    });

    it("rotates the leaves with the wall and handles a zero-width opening", () => {
      const [first, second] = slidingDoorLeaves({ x: 1, y: 2 }, { x: 1, y: 4 }, { x: -1, y: 0 }, 0.035);

      expect(first[1].y).toBeGreaterThan(second[3].y);
      expect(first[1].x - first[2].x).toBeCloseTo(0.035);
      expect(second[1].x - second[2].x).toBeCloseTo(0.035);
      const collapsed = slidingDoorLeaves({ x: 1, y: 2 }, { x: 1, y: 2 }, { x: -1, y: 0 }, 0.035);
      expect(collapsed.flat().every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    });
  });

  it("does not draw when there are no fences", () => {
    const context = { beginPath: vi.fn() };

    drawFences(context as unknown as CanvasRenderingContext2D, [], 20);

    expect(context.beginPath).not.toHaveBeenCalled();
  });
});
