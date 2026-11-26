import { describe, expect, it, vi } from "vitest";
import testPlan from "../testData/McKeefry.json";
import { roomPolygon } from "./geom/roomPolygon";
import { Plan } from "./Plan";
import { PlanEditor } from "./PlanEditor";
import { Room } from "./Room";
import { Opening } from "./Opening";
import type { JsonOpening } from "./json/Document";

const setup = () => {
  const plan = Plan.fromJson({
    buildings: [{
      name: "House",
      levels: [{
        number: 0,
        name: "Ground",
        walls: [
          { id: "v0", start: [0, 0], end: [0, 1000] },
          { id: "v1", start: [1000, 0], end: [1000, 1000], openings: [
            { id: "door", width: 500, distanceAlongWall: 500 },
          ] },
          { id: "v2", start: [2000, 0], end: [2000, 1000] },
          { id: "v3", start: [3000, 0], end: [3000, 1000] },
          { id: "t0", start: [0, 0], end: [1000, 0] },
          { id: "t1", start: [1000, 0], end: [2000, 0] },
          { id: "t2", start: [2000, 0], end: [3000, 0] },
          { id: "b0", start: [0, 1000], end: [1000, 1000] },
          { id: "b1", start: [1000, 1000], end: [2000, 1000] },
          { id: "b2", start: [2000, 1000], end: [3000, 1000] },
        ],
        rooms: [
          { name: "First", walls: [{ ref: "t0" }, { ref: "v1" }, { ref: "b0" }, { ref: "v0" }] },
          { name: "Second", walls: [{ ref: "t1" }, { ref: "v2" }, { ref: "b1" }, { ref: "v1" }] },
          { name: "Third", walls: [{ ref: "t2" }, { ref: "v3" }, { ref: "b2" }, { ref: "v2" }] },
        ],
      }],
    }],
  });
  const level = plan.buildings[0].levels[0];
  const notify = vi.fn();
  return { plan, level, notify, editor: new PlanEditor(plan, notify) };
};

const unmergedFamilyPlan = () => {
  const plan = Plan.fromJson(testPlan);
  const wall = plan.buildings[0].levels[0].walls.find((item) => item.id === "wall30")!;
  const json: JsonOpening[] = [
    { id: "door16", distanceAlongWall: 1795, width: 900, height: 2100, distanceFromFloor: 0,
      contents: [{ type: "StandardDoor", hingeSide: "left", swingDirection: "out" }] },
    { id: "door17", distanceAlongWall: 2676, width: 842, height: 2100, distanceFromFloor: 0,
      contents: [{ type: "StandardDoor", hingeSide: "right", swingDirection: "out" }] },
    { id: "window22", distanceAlongWall: 1110, width: 450, height: 2000, distanceFromFloor: 0,
      contents: [{ type: "Window", windowType: "awning" }] },
    { id: "window23", distanceAlongWall: 3332, width: 450, height: 2000, distanceFromFloor: 0,
      contents: [{ type: "Window", windowType: "awning" }] },
  ];
  const originals = json.map((item) => Opening.fromJson(item));
  for (const opening of originals) opening.wall = wall;
  wall.openings = [...originals, ...wall.openings.filter((opening) => opening.id !== "window23")];
  return plan;
};

describe("merging rooms", () => {
  it("merges adjacent rooms, retaining the chosen name, shared wall and opening", () => {
    const { plan, level, notify, editor } = setup();
    const [first, second, third] = level.rooms;
    const walls = [...level.walls];
    expect(editor.canMergeRooms([first, second])).toBe(true);
    expect(editor.mergeRooms([first, second], second)).toEqual({ ok: true });
    expect(level.rooms).toEqual([second, third]);
    expect(second.name).toBe("Second");
    expect(first.level).toBeUndefined();
    expect(level.walls).toEqual(walls);
    expect(level.walls[1].openings).toHaveLength(1);
    expect(second.walls).not.toContain(level.walls[1]);
    expect(roomPolygon(second)).toHaveLength(6);
    expect(notify).toHaveBeenCalledOnce();
    const reloaded = Plan.fromJson(plan.toJson());
    expect(reloaded.loadWarnings).toEqual([]);
    expect(roomPolygon(reloaded.buildings[0].levels[0].rooms[0])).toEqual(roomPolygon(second));
  });

  describe("merging openings", () => {
    it("merges the family-room openings into a bounding rectangle and preserves their contents in wall order", () => {
      const plan = unmergedFamilyPlan();
      const wall = plan.buildings[0].levels[0].walls.find((item) => item.id === "wall30")!;
      const selected = ["door16", "door17", "window22", "window23"].map((id) =>
        wall.openings.find((opening) => opening.id === id)!,
      );
      const retained = selected[1];
      const remaining = wall.openings.filter((opening) => !selected.includes(opening));
      const notify = vi.fn();
      const editor = new PlanEditor(plan, notify);
      expect(editor.canMergeOpenings(selected)).toBe(true);
      expect(editor.mergeOpenings(selected, retained)).toEqual({ ok: true });
      expect(retained.toJson()).toMatchObject({
        id: "door17", distanceAlongWall: 2221, width: 2672, height: 2100, distanceFromFloor: 0,
      });
      expect(retained.contents.map((item) => item.type)).toEqual([
        "Window", "StandardDoor", "StandardDoor", "Window",
      ]);
      expect(wall.openings).toEqual(expect.arrayContaining([retained, ...remaining]));
      expect(wall.openings).toHaveLength(remaining.length + 1);
      expect(selected[0].wall).toBeUndefined();
      expect(notify).toHaveBeenCalledOnce();
      const reloaded = Plan.fromJson(plan.toJson());
      expect(reloaded.loadWarnings).toEqual([]);
      expect(reloaded.buildings[0].levels[0].walls.find((item) => item.id === "wall30")!
        .openings.find((opening) => opening.id === "door17")!.toJson()).toEqual(retained.toJson());
    });

    it("encloses fractional centre bounds, using the existing default height and a rectangle", () => {
      const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{ number: 0, name: "Ground", walls: [{
        id: "w", start: [0, 0], end: [5000, 0], openings: [
          { id: "a", distanceAlongWall: 500, width: 1000, shape: "halfCircleArch" },
          { id: "b", distanceAlongWall: 2001, width: 1000, height: 1000, distanceFromFloor: 500 },
        ],
      }] }] }] });
      const [a, b] = plan.buildings[0].levels[0].walls[0].openings;
      const editor = new PlanEditor(plan, () => {});
      expect(editor.mergeOpenings([a, b], a)).toEqual({ ok: true });
      expect(a.toJson()).toMatchObject({ distanceAlongWall: 1251, width: 2502, height: 2100, distanceFromFloor: 0 });
      expect(a.shape).toBeUndefined();
    });

    it("rejects foreign, duplicate, stale and obstructed selections without changes", () => {
      const plan = unmergedFamilyPlan();
      const level = plan.buildings[0].levels[0];
      const wall = level.walls.find((item) => item.id === "wall30")!;
      const [a, b, between] = wall.openings;
      const otherWall = level.walls.find((item) => item !== wall && item.openings.length)!;
      const notify = vi.fn();
      const editor = new PlanEditor(plan, notify);
      const before = plan.toJson();
      expect(editor.canMergeOpenings([a, a])).toBe(false);
      expect(editor.canMergeOpenings([a, otherWall.openings[0]])).toBe(false);
      expect(editor.canMergeOpenings([between, b])).toBe(false);
      expect(editor.mergeOpenings([a, b], otherWall.openings[0]).ok).toBe(false);
      expect(plan.toJson()).toEqual(before);
      expect(notify).not.toHaveBeenCalled();
      wall.openings = wall.openings.filter((opening) => opening !== b);
      expect(editor.canMergeOpenings([a, b])).toBe(false);
    });
  });

  it("merges a connected group, but rejects disconnected, overlapping and stale selections", () => {
    const { level, notify, editor } = setup();
    const [first, second, third] = level.rooms;
    expect(editor.canMergeRooms([first, third])).toBe(false);
    expect(editor.canMergeRooms([first, first])).toBe(false);
    expect(editor.canMergeRooms([first, setup().level.rooms[0]])).toBe(false);
    const overlapping = new Room("Overlap", first.walls);
    overlapping.level = level;
    level.rooms.push(overlapping);
    expect(editor.canMergeRooms([first, overlapping])).toBe(false);
    level.rooms.pop();
    expect(editor.mergeRooms([first, third], first).ok).toBe(false);
    expect(notify).not.toHaveBeenCalled();
    expect(editor.canMergeRooms([first, second, third])).toBe(true);
    expect(editor.mergeRooms([first, second, third], first)).toEqual({ ok: true });
    expect(level.rooms).toEqual([first]);
    expect(editor.mergeRooms([first, second], first).ok).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("merges adjacent rooms from the example plan", () => {
    const plan = Plan.fromJson(testPlan);
    const level = plan.buildings[0].levels[0];
    const lounge = level.rooms.find((room) => room.name === "Lounge")!;
    const dining = level.rooms.find((room) => room.name === "Dining Room")!;
    const editor = new PlanEditor(plan, () => {});
    expect(editor.canMergeRooms([lounge, dining])).toBe(true);
    expect(editor.mergeRooms([lounge, dining], lounge).ok).toBe(true);
  });

  it("preserves the exposed portion of a partially shared wall in a concave perimeter", () => {
    const plan = Plan.fromJson({
      buildings: [{
        name: "House",
        levels: [{
          number: 0,
          name: "Ground",
          walls: [
            { id: "top", start: [0, 0], end: [2000, 0] },
            { id: "shared", start: [2000, 0], end: [2000, 2000] },
            { id: "bottom", start: [2000, 2000], end: [0, 2000] },
            { id: "left", start: [0, 2000], end: [0, 0] },
            { id: "extension-top", start: [2000, 1000], end: [3000, 1000] },
            { id: "extension-right", start: [3000, 1000], end: [3000, 2000] },
            { id: "extension-bottom", start: [3000, 2000], end: [2000, 2000] },
          ],
          rooms: [
            { name: "Main", walls: [{ ref: "top" }, { ref: "shared" }, { ref: "bottom" }, { ref: "left" }] },
            { name: "Extension", walls: [{ ref: "extension-top" }, { ref: "extension-right" }, { ref: "extension-bottom" }, { ref: "shared" }] },
          ],
        }],
      }],
    });
    const level = plan.buildings[0].levels[0];
    const [main, extension] = level.rooms;
    const editor = new PlanEditor(plan, () => {});

    expect(editor.mergeRooms([main, extension], main)).toEqual({ ok: true });
    expect(main.walls).toContain(level.walls[1]);
    expect(roomPolygon(main)).toEqual(expect.arrayContaining([
      { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 0, y: 2 },
    ]));
    expect(roomPolygon(main)).toHaveLength(7);
  });

  it.each([false, true])("merges rooms with angled walls (extended shared wall: %s)", (extended) => {
    const plan = Plan.fromJson({
      buildings: [{
        name: "House",
        levels: [{
          number: 0,
          name: "Ground",
          walls: [
            { id: "left", start: [0, 0], end: [-100, 1000] },
            { id: "shared", start: extended ? [1100, -700] : [1000, 300], end: extended ? [800, 2300] : [900, 1300] },
            { id: "right", start: [2000, 600], end: [1900, 1600] },
            { id: "top1", start: [0, 0], end: [1000, 300] },
            { id: "top2", start: [1000, 300], end: [2000, 600] },
            { id: "bottom1", start: [-100, 1000], end: [900, 1300] },
            { id: "bottom2", start: [900, 1300], end: [1900, 1600] },
          ],
          rooms: [
            { name: "First", walls: [{ ref: "top1" }, { ref: "shared" }, { ref: "bottom1" }, { ref: "left" }] },
            { name: "Second", walls: [{ ref: "top2" }, { ref: "right" }, { ref: "bottom2" }, { ref: "shared" }] },
          ],
        }],
      }],
    });
    const [first, second] = plan.buildings[0].levels[0].rooms;
    const editor = new PlanEditor(plan, () => {});

    expect(editor.canMergeRooms([first, second])).toBe(true);
    expect(editor.mergeRooms([first, second], first)).toEqual({ ok: true });
  });

  it("rejects corner-only contact and connected rooms surrounding a hole", () => {
    const walls = [];
    for (let x = 0; x <= 3; x++) {
      for (let y = 0; y < 3; y++) {
        walls.push(
          { id: `v${x}-${y}`, start: [x * 1000, y * 1000], end: [x * 1000, (y + 1) * 1000] },
          { id: `h${x}-${y}`, start: [y * 1000, x * 1000], end: [(y + 1) * 1000, x * 1000] },
        );
      }
    }
    const rooms = [];
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        if (x === 1 && y === 1) continue;
        rooms.push({
          name: `${x}-${y}`,
          walls: [{ ref: `h${y}-${x}` }, { ref: `v${x + 1}-${y}` }, { ref: `h${y + 1}-${x}` }, { ref: `v${x}-${y}` }],
        });
      }
    }
    const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{ number: 0, name: "Ground", walls, rooms }] }] });
    const level = plan.buildings[0].levels[0];
    const editor = new PlanEditor(plan, () => {});

    const upperLeft = level.rooms.find((room) => room.name === "0-1")!;
    const lowerRight = level.rooms.find((room) => room.name === "1-2")!;
    expect(editor.canMergeRooms([upperLeft, lowerRight])).toBe(false);
    expect(editor.canMergeRooms(level.rooms)).toBe(false);
  });
});
