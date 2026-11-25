import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Layers, type LayerVisibility } from "../gui/Layers";
import { selectedTargets, toggleRoomSelection } from "../gui/selection";
import { Fence } from "../model/Fence";
import { Plan } from "../model/Plan";
import { Room } from "../model/Room";
import {
  drawFences, drawOpenings, isVisibleTarget, mapRotationHandle, rotateMapFromDrag, targetsAtPoint, visibleWalls,
} from "./planView2DHelpers";
import { planToGeographic, referenceAt } from "./georeference";
import { Compass } from "./Compass";
import { slidingDoorLeaves } from "./renderPolygons";

describe("plan compass", () => {
  it("is absent without a bearing and shows all cardinal directions at zero", () => {
    expect(renderToStaticMarkup(createElement(Compass, {}))).toBe("");
    const markup = renderToStaticMarkup(createElement(Compass, { bearing: 0 }));
    expect(markup).toContain('rotate(0)');
    for (const direction of ["N", "E", "S", "W"]) expect(markup).toContain(`>${direction}</text>`);
  });

  it("rotates the directions opposite to the bearing while keeping labels upright", () => {
    const markup = renderToStaticMarkup(createElement(Compass, { bearing: 90 }));
    expect(markup).toContain('rotate(-90)');
    expect(markup).toContain('rotate(90 0 -27)');
  });
});

describe("basemap rotation handle", () => {
  it("keeps its distance from the pivot in screen pixels and follows the bearing", () => {
    const pivot = { x: 10, y: 20 };
    expect(mapRotationHandle(pivot, 0, 21)).toEqual({ x: 10, y: 18 });
    const handle = mapRotationHandle(pivot, 90, 42);
    expect(handle.x).toBeCloseTo(9);
    expect(handle.y).toBeCloseTo(20);
  });

  it("rotates the map in the drag direction around a fixed geographic pivot", () => {
    const pivot = { x: 10, y: 20 };
    const reference = referenceAt(pivot, -41.178, 174.82, 0);
    const rotated = rotateMapFromDrag(reference, pivot, { x: 10, y: 18 }, { x: 12, y: 20 });
    expect(rotated.bearing).toBe(270);
    expect(planToGeographic(rotated, pivot).latitude).toBeCloseTo(-41.178, 9);
    expect(planToGeographic(rotated, pivot).longitude).toBeCloseTo(174.82, 9);
  });

  it("wraps drag angles across the bearing boundary", () => {
    const pivot = { x: 0, y: 0 };
    const reference = referenceAt(pivot, -41.178, 174.82, 350);
    const rotated = rotateMapFromDrag(reference, pivot, { x: 0, y: -1 }, { x: -1, y: 0 });
    expect(rotated.bearing).toBe(80);
  });
});

it.each([
  ["left", "in", 0], ["left", "in", 45], ["left", "in", 90], ["left", "in", 180],
  ["left", "out", 45], ["right", "in", 45], ["right", "out", 45],
] as const)("draws a %s-hinged %s door at %s degrees", (hingeSide, swingDirection, openAngle) => {
  const plan = Plan.fromJson({
    buildings: [{
      name: "House", levels: [{
        number: 0, name: "Ground", walls: [{
          id: "wall", start: [0, 0], end: [4000, 0],
          openings: [{
            id: "opening", width: 1000, distanceAlongWall: 2000,
            contents: [{ type: "StandardDoor", hingeSide, swingDirection, ...(openAngle === 90 ? {} : { openAngle }) }],
          }],
        }],
      }],
    }],
  });
  const context = {
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    stroke: vi.fn(), arc: vi.fn(), strokeStyle: "", lineWidth: 0,
  };
  drawOpenings(context as unknown as CanvasRenderingContext2D, plan.getWallsOnLevel(0), 20, true);
  const hingeX = hingeSide === "left" ? 1.5 : 2.5;
  const hingeY = swingDirection === "out" ? -0.05 : 0.05;
  const sweep = (hingeSide === "left") === (swingDirection === "out") ? -openAngle : openAngle;
  const direction = hingeSide === "left" ? 1 : -1;
  expect(context.moveTo).toHaveBeenCalledWith(hingeX, hingeY);
  expect(context.lineTo.mock.calls[0][0]).toBeCloseTo(hingeX + direction * Math.cos(sweep * Math.PI / 180));
  expect(context.lineTo.mock.calls[0][1]).toBeCloseTo(hingeY + direction * Math.sin(sweep * Math.PI / 180));
  const arc = context.arc.mock.calls[0];
  expect(Math.abs(arc[4] - arc[3])).toBeCloseTo(openAngle * Math.PI / 180);
});

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

  it("only highlights selected rooms on the displayed level", () => {
    const plan = Plan.fromJson({
      buildings: [
        { name: "House", levels: [
          { number: 0, name: "Ground", rooms: [{ name: "Room", walls: [] }] },
          { number: 1, name: "Upper", rooms: [{ name: "Room", walls: [] }] },
        ] },
        { name: "Garage", levels: [
          { number: 0, name: "Ground", rooms: [{ name: "Room", walls: [] }] },
        ] },
      ],
    });
    const groundRooms = plan.getRoomsOnLevel(0);
    const upperRooms = plan.getRoomsOnLevel(1);
    const selection = {
      targets: [{ kind: "room" as const, item: upperRooms[0] }],
      activeIndex: 0,
      rooms: [...groundRooms, ...upperRooms],
    };
    const visibleRooms = (rooms: Room[]) =>
      selectedTargets(selection).filter((target) => isVisibleTarget(target, [], rooms, [], true));

    expect(visibleRooms(groundRooms).map((target) => target.item)).toEqual(groundRooms);
    expect(visibleRooms(upperRooms).map((target) => target.item)).toEqual(upperRooms);
    expect(visibleRooms([])).toEqual([]);
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
      fences: true, normalWalls: true, virtualWalls: false, atticWalls: false, roomLabels: true, doors: true, compass: true,
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
              { id: "attic", start: [0, 2000], end: [4000, 2000], attic: true, openings: [
                { id: "attic-opening", width: 1000, distanceAlongWall: 2000, contents: [{ type: "StandardWindow" }] },
              ] },
              { id: "both", start: [0, 3000], end: [4000, 3000], virtual: true, attic: true },
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
      expect(markup).toContain('<input type="checkbox"/>Walls, attic');
      for (const label of ["Fences", "Walls, normal", "Room labels", "Doors", "Compass"]) {
        expect(markup).toContain(`<input type="checkbox" checked=""/>${label}`);
      }
    });

    it("filters normal and virtual walls independently, including their selection highlights", () => {
      const { walls, opening } = setup();
      const visible = visibleWalls(walls, { ...visibility, normalWalls: false, virtualWalls: true });
      expect(visible).toEqual([walls[1], walls[3]]);
      expect(targetsAtPoint({ x: 2, y: 0 }, visible, [], [], true)).toEqual([]);
      expect(targetsAtPoint({ x: 2, y: 1 }, visible, [], [], true)).toEqual([{ kind: "wall", item: walls[1] }]);
      expect(isVisibleTarget({ kind: "opening", item: opening }, visible, [], [], true)).toBe(false);
      expect(isVisibleTarget({ kind: "wall", item: walls[1] }, visible, [], [], true)).toBe(true);
    });

    it("filters attic walls independently and shows a dual-flagged wall on either layer", () => {
      const { walls } = setup();
      const atticOpening = walls[2].openings[0];
      expect(visibleWalls(walls, visibility)).toEqual([walls[0]]);
      expect(visibleWalls(walls, { ...visibility, normalWalls: false, atticWalls: true })).toEqual([walls[2], walls[3]]);
      expect(visibleWalls(walls, { ...visibility, normalWalls: false, virtualWalls: true })).toEqual([walls[1], walls[3]]);
      expect(visibleWalls(walls, { ...visibility, normalWalls: false, virtualWalls: true, atticWalls: true }))
        .toEqual([walls[1], walls[2], walls[3]]);
      expect(isVisibleTarget({ kind: "opening", item: atticOpening }, visibleWalls(walls, visibility), [], [], true)).toBe(false);
      expect(targetsAtPoint({ x: 2, y: 2 }, visibleWalls(walls, visibility), [], [], true)).toEqual([]);
      expect(targetsAtPoint({ x: 2, y: 2 }, visibleWalls(walls, { ...visibility, atticWalls: true }), [], [], true)
        .some((target) => target.kind === "wall" && target.item === walls[2])).toBe(true);
    });

    it("does not select or highlight a hidden fence", () => {
      const fence = Fence.fromJson({ id: "fence", start: [0, 0], end: [1000, 0] });
      expect(targetsAtPoint({ x: 0.5, y: 0 }, [], [], [fence], true)).toEqual([{ kind: "fence", item: fence }]);
      expect(targetsAtPoint({ x: 0.5, y: 0 }, [], [], [], true)).toEqual([]);
      expect(isVisibleTarget({ kind: "fence", item: fence }, [], [], [], true)).toBe(false);
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
      expect(isVisibleTarget({ kind: "door", item: door, opening }, [walls[0]], [], [], false)).toBe(false);
      expect(isVisibleTarget({ kind: "slidingDoor", item: slidingDoor, opening }, [walls[0]], [], [], false)).toBe(false);

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
