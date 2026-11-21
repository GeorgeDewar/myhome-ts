import { describe, expect, it, vi } from "vitest";
import { Plan } from "./Plan";
import { PlanEditor } from "./PlanEditor";

const createPlan = () =>
  Plan.fromJson({
    buildings: [
      {
        name: "House",
        levels: [{ number: 0, name: "Ground", walls: [{ id: "wall", start: [0, 0], end: [1000, 0] }] }],
      },
    ],
  });

describe("PlanEditor.updateWall", () => {
  it("updates width in millimetres and notifies once", () => {
    const plan = createPlan();
    const wall = plan.buildings[0].levels[0].walls[0];
    const notify = vi.fn();
    const editor = new PlanEditor(plan, notify);

    expect(editor.updateWall(wall, { width: 200 })).toEqual({ ok: true });
    expect(wall.width.metres).toBe(0.2);
    expect(plan.toJson().buildings![0].levels[0].walls![0].width).toBe(200);
    expect(notify).toHaveBeenCalledOnce();
    editor.updateWall(wall, { width: 200 });
    editor.updateWall(wall, {});
    expect(notify).toHaveBeenCalledOnce();
  });

  describe("PlanEditor property updates", () => {
    const setup = () => {
      const plan = Plan.fromJson({
        buildings: [
          {
            name: "House",
            levels: [
              {
                number: 0,
                name: "Ground",
                rooms: [{ name: "Room", walls: [] }],
                walls: [
                  {
                    id: "wall",
                    start: [0, 0],
                    end: [3000, 0],
                    openings: [
                      {
                        id: "opening",
                        width: 1000,
                        distanceAlongWall: 500,
                        contents: [
                          { type: "StandardDoor", hingeSide: "left", swingDirection: "in" },
                          { type: "SlidingDoor" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const level = plan.buildings[0].levels[0];
      const room = level.rooms[0];
      const wall = level.walls[0];
      const opening = wall.openings[0];
      const [door, slidingDoor] = opening.contents;
      if (door.type !== "StandardDoor" || slidingDoor.type !== "SlidingDoor") throw new Error("Unexpected door type");
      const notify = vi.fn();
      return { plan, level, room, wall, opening, door, slidingDoor, notify, editor: new PlanEditor(plan, notify) };
    };

    it("edits a room name and skips no-op notifications", () => {
      const { room, editor, notify } = setup();
      expect(editor.updateRoom(room, { name: "Kitchen" })).toEqual({ ok: true });
      expect(room.name).toBe("Kitchen");
      expect(editor.updateRoom(room, { name: "Kitchen" })).toEqual({ ok: true });
      expect(editor.updateRoom(room, {})).toEqual({ ok: true });
      expect(notify).toHaveBeenCalledOnce();
    });

    it("updates ordered room walls and rejects foreign or removed walls atomically", () => {
      const plan = Plan.fromJson({
        buildings: [
          {
            name: "House",
            levels: [
              {
                number: 0,
                name: "Ground",
                walls: [
                  { id: "a", start: [0, 0], end: [1000, 0] },
                  { id: "b", start: [1000, 0], end: [1000, 1000] },
                  { id: "removed", start: [0, 0], end: [0, 1000] },
                ],
                rooms: [{ name: "Room", walls: [{ ref: "a" }] }],
              },
              { number: 1, name: "Upper", walls: [{ id: "a", start: [0, 0], end: [1000, 0] }] },
            ],
          },
        ],
      });
      const [level, otherLevel] = plan.buildings[0].levels;
      const [a, b, removed] = level.walls;
      const room = level.rooms[0];
      const notify = vi.fn();
      const editor = new PlanEditor(plan, notify);
      const walls = [b, a];

      expect(editor.updateRoom(room, { name: "Updated", walls })).toEqual({ ok: true });
      walls.reverse();
      expect(room.toJson()).toEqual({ name: "Updated", walls: [{ ref: "b" }, { ref: "a" }] });
      expect(editor.updateRoom(room, { walls: [b, a] })).toEqual({ ok: true });
      expect(notify).toHaveBeenCalledOnce();

      level.walls.pop();
      const foreign = setup().wall;
      for (const invalid of [otherLevel.walls[0], removed, foreign]) {
        expect(editor.updateRoom(room, { name: "Rejected", walls: [a, invalid] })).toEqual({
          ok: false,
          error: "Room walls must belong to the same level as the room.",
        });
      }
      expect(room.toJson()).toEqual({ name: "Updated", walls: [{ ref: "b" }, { ref: "a" }] });
      expect(notify).toHaveBeenCalledOnce();

      expect(editor.updateRoom(room, { walls: [a, b] })).toEqual({ ok: true });
      expect(room.toJson().walls).toEqual([{ ref: "a" }, { ref: "b" }]);
      expect(notify).toHaveBeenCalledTimes(2);
    });

    it("validates an opening patch before applying any field", () => {
      const { plan, opening, editor, notify } = setup();
      const before = plan.toJson();
      expect(editor.updateOpening(opening, { width: 1200, distanceAlongWall: NaN })).toEqual({
        ok: false,
        field: "distanceAlongWall",
        error: "Enter a finite number of millimetres.",
      });
      expect(editor.updateOpening(opening, { width: Infinity })).toEqual({
        ok: false,
        field: "width",
        error: "Opening width must be a positive, finite number of millimetres.",
      });
      expect(plan.toJson()).toEqual(before);
      expect(notify).not.toHaveBeenCalled();

      expect(editor.updateOpening(opening, { width: 1200, distanceAlongWall: 700 })).toEqual({ ok: true });
      expect(opening.toJson()).toMatchObject({ width: 1200, distanceAlongWall: 700 });
      expect(editor.updateOpening(opening, { width: 1200, distanceAlongWall: 700 })).toEqual({ ok: true });
      expect(notify).toHaveBeenCalledOnce();
    });

    it("validates and applies standard door properties together", () => {
      const { door, editor, notify } = setup();
      expect(editor.updateDoor(door, { hingeSide: "right", thickness: NaN })).toEqual({
        ok: false,
        field: "thickness",
        error: "Door leaf thickness must be a positive, finite number of millimetres.",
      });
      expect(door.hingeSide).toBe("left");
      expect(notify).not.toHaveBeenCalled();

      expect(editor.updateDoor(door, { hingeSide: "right", swingDirection: "out", thickness: 35 })).toEqual({
        ok: true,
      });
      expect(door.toJson()).toMatchObject({ hingeSide: "right", swingDirection: "out", thickness: 35 });
      expect(editor.updateDoor(door, { hingeSide: "right", swingDirection: "out", thickness: 35 })).toEqual({
        ok: true,
      });
      expect(notify).toHaveBeenCalledOnce();
    });

    it("updates sliding-door thickness and rejects non-finite values", () => {
      const { slidingDoor, editor, notify } = setup();
      expect(editor.updateSlidingDoor(slidingDoor, { thickness: Infinity })).toEqual({
        ok: false,
        field: "thickness",
        error: "Door leaf thickness must be a positive, finite number of millimetres.",
      });
      expect(slidingDoor.thickness).toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
      expect(editor.updateSlidingDoor(slidingDoor, { thickness: 35 })).toEqual({ ok: true });
      expect(slidingDoor.toJson().thickness).toBe(35);
      expect(editor.updateSlidingDoor(slidingDoor, { thickness: 35 })).toEqual({ ok: true });
      expect(notify).toHaveBeenCalledOnce();
    });

    it("rejects zero, negative and unrepresentably small dimensions atomically", () => {
      const { opening, door, slidingDoor, editor, notify } = setup();
      for (const value of [0, -1, Number.MIN_VALUE]) {
        expect(editor.updateOpening(opening, { width: value, distanceAlongWall: 700 }).ok).toBe(false);
        expect(editor.updateDoor(door, { thickness: value, hingeSide: "right" }).ok).toBe(false);
        expect(editor.updateSlidingDoor(slidingDoor, { thickness: value }).ok).toBe(false);
      }
      expect(opening.width.toJson()).toBe(1000);
      expect(opening.distanceAlongWall.toJson()).toBe(500);
      expect(door.hingeSide).toBe("left");
      expect(door.thickness).toBeUndefined();
      expect(slidingDoor.thickness).toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
    });

    it("rejects foreign and removed objects, including descendants of a removed wall", () => {
      const { level, room, opening, door, slidingDoor, editor, notify } = setup();
      const foreign = setup();
      expect(editor.updateRoom(foreign.room, { name: "Other" }).ok).toBe(false);
      expect(editor.updateOpening(foreign.opening, { width: 200 }).ok).toBe(false);
      expect(editor.updateDoor(foreign.door, { hingeSide: "right" }).ok).toBe(false);
      expect(editor.updateSlidingDoor(foreign.slidingDoor, { thickness: 50 }).ok).toBe(false);

      level.rooms.pop();
      level.walls.pop();
      expect(editor.updateRoom(room, { name: "Other" }).ok).toBe(false);
      expect(editor.updateOpening(opening, { width: 200 }).ok).toBe(false);
      expect(editor.updateDoor(door, { hingeSide: "right" }).ok).toBe(false);
      expect(editor.updateSlidingDoor(slidingDoor, { thickness: 50 }).ok).toBe(false);
      expect(room.name).toBe("Room");
      expect(opening.width.toJson()).toBe(1000);
      expect(door.hingeSide).toBe("left");
      expect(slidingDoor.thickness).toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
    });

    it("rejects removed openings and opening items even if their parents remain", () => {
      const { wall, opening, door, slidingDoor, editor, notify } = setup();
      opening.contents.pop();
      expect(editor.updateSlidingDoor(slidingDoor, { thickness: 50 }).ok).toBe(false);
      wall.openings.pop();
      expect(editor.updateOpening(opening, { width: 200 }).ok).toBe(false);
      expect(editor.updateDoor(door, { hingeSide: "right" }).ok).toBe(false);
      expect(notify).not.toHaveBeenCalled();
    });
  });

  it("rejects invalid widths without changing the wall or notifying", () => {
    const plan = createPlan();
    const wall = plan.buildings[0].levels[0].walls[0];
    const before = plan.toJson();
    const notify = vi.fn();
    const editor = new PlanEditor(plan, notify);

    for (const width of [0, -1, NaN, Infinity, -Infinity]) {
      expect(editor.updateWall(wall, { width })).toEqual({
        ok: false,
        error: "Wall width must be a positive, finite number of millimetres.",
      });
    }
    for (const width of [Number.MIN_VALUE, 0.0000000001]) {
      expect(editor.updateWall(wall, { width })).toEqual({ ok: false, error: "Wall width is too small to save." });
    }
    expect(plan.toJson()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  });

  it("records an explicit width even when it equals the default", () => {
    const plan = createPlan();
    const wall = plan.buildings[0].levels[0].walls[0];
    const notify = vi.fn();

    expect(new PlanEditor(plan, notify).updateWall(wall, { width: 100 })).toEqual({ ok: true });
    expect(wall.toJson().width).toBe(100);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("rejects foreign or removed walls, even when their IDs match", () => {
    const plan = createPlan();
    const otherWall = createPlan().buildings[0].levels[0].walls[0];
    const level = plan.buildings[0].levels[0];
    const removedWall = level.walls.pop()!;
    const notify = vi.fn();
    const editor = new PlanEditor(plan, notify);

    for (const wall of [otherWall, removedWall]) {
      expect(editor.updateWall(wall, { width: 200 })).toEqual({
        ok: false,
        error: "This wall is no longer in the plan.",
      });
      expect(wall.width.metres).toBe(0.1);
    }
    expect(notify).not.toHaveBeenCalled();
  });
});
