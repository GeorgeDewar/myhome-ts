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

describe("PlanEditor deletion", () => {
  const setup = () => {
    const plan = Plan.fromJson({
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 0,
              name: "Ground",
              walls: [
                {
                  id: "wall",
                  start: [0, 0],
                  end: [3000, 0],
                  openings: [
                    {
                      id: "opening",
                      width: 900,
                      distanceAlongWall: 500,
                      contents: [
                        { type: "StandardDoor", hingeSide: "left", swingDirection: "in" },
                        { type: "StandardWindow" },
                      ],
                    },
                  ],
                },
                { id: "other", start: [0, 1000], end: [3000, 1000] },
              ],
              rooms: [
                { name: "Affected", walls: [{ ref: "wall" }, { ref: "other" }] },
                { name: "Also affected", walls: [{ ref: "wall" }] },
                { name: "Unaffected", walls: [{ ref: "other" }] },
              ],
            },
          ],
        },
      ],
    });
    const level = plan.buildings[0].levels[0];
    const [wall, other] = level.walls;
    const [affected, alsoAffected, unaffected] = level.rooms;
    const opening = wall.openings[0];
    const [door, window] = opening.contents;
    const notify = vi.fn();
    return {
      plan,
      level,
      wall,
      other,
      affected,
      alsoAffected,
      unaffected,
      opening,
      door,
      window,
      notify,
      editor: new PlanEditor(plan, notify),
    };
  };

  it("deletes a wall, its openings and all rooms referencing it", () => {
    const { plan, level, wall, other, affected, alsoAffected, unaffected, opening, door, notify, editor } = setup();
    expect(editor.deleteWall(wall)).toEqual({ ok: true });
    expect(level.walls).toEqual([other]);
    expect(level.rooms).toEqual([unaffected]);
    expect(wall.level).toBeUndefined();
    expect(affected.level).toBeUndefined();
    expect(alsoAffected.level).toBeUndefined();
    expect(editor.contains(opening)).toBe(false);
    expect(editor.contains(door)).toBe(false);
    expect(editor.contains(unaffected)).toBe(true);
    expect(Plan.fromJson(plan.toJson()).loadWarnings).toEqual([]);
    expect(editor.deleteWall(wall).ok).toBe(false);
    expect(editor.deleteRoom(affected).ok).toBe(false);
    expect(editor.deleteOpening(opening).ok).toBe(false);
    expect(editor.deleteOpeningItem(door).ok).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("deletes an opening and its contents without affecting its wall", () => {
    const { wall, opening, door, notify, editor } = setup();
    expect(editor.deleteOpening(opening)).toEqual({ ok: true });
    expect(wall.openings).toEqual([]);
    expect(opening.wall).toBeUndefined();
    expect(editor.contains(door)).toBe(false);
    expect(editor.deleteOpeningItem(door).ok).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("deletes individual opening items and rooms, rejecting foreign or removed objects", () => {
    const { plan, level, wall, affected, opening, door, window, notify, editor } = setup();
    const foreign = setup();
    const before = plan.toJson();
    expect(editor.deleteWall(foreign.wall).ok).toBe(false);
    expect(editor.deleteRoom(foreign.affected).ok).toBe(false);
    expect(editor.deleteOpening(foreign.opening).ok).toBe(false);
    expect(editor.deleteOpeningItem(foreign.door).ok).toBe(false);
    expect(plan.toJson()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();

    expect(editor.deleteOpeningItem(door)).toEqual({ ok: true });
    expect(opening.contents).toEqual([window]);
    expect(editor.deleteRoom(affected)).toEqual({ ok: true });
    expect(level.walls).toContain(wall);
    expect(level.rooms).not.toContain(affected);
    expect(affected.level).toBeUndefined();
    expect(editor.deleteOpeningItem(door).ok).toBe(false);
    expect(editor.deleteRoom(affected).ok).toBe(false);
    expect(notify).toHaveBeenCalledTimes(2);
  });
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

    it("validates label changes atomically and preserves other label overrides", () => {
      const { room, editor, notify } = setup();
      expect(editor.updateRoom(room, { name: "Changed", label: { fontSize: -1 } }).ok).toBe(false);
      expect(editor.updateRoom(room, { label: { fontSize: 125.5 } }).ok).toBe(false);
      expect(editor.updateRoom(room, { label: { position: [1.5, 0] } }).ok).toBe(false);
      expect(editor.updateRoom(room, { label: { rotation: Infinity } }).ok).toBe(false);
      expect(room.name).toBe("Room");
      expect(room.label).toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
      expect(editor.updateRoom(room, { label: { text: "Two\nlines", position: [100, 200] } }).ok).toBe(true);
      expect(editor.updateRoom(room, { label: { fontSize: 126, rotation: 45 } }).ok).toBe(true);
      expect(room.label).toEqual({ text: "Two\nlines", position: [100, 200], fontSize: 126, rotation: 45 });
      expect(editor.updateRoom(room, { label: { position: [100, 200], rotation: 45 } }).ok).toBe(true);
      expect(notify).toHaveBeenCalledTimes(2);
      expect(editor.updateRoom(room, { label: { text: null } }).ok).toBe(true);
      expect(room.label?.text).toBeUndefined();
      expect(room.label?.position).toEqual([100, 200]);
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

    it("rejects an invalid opening shape without applying other changes", () => {
      const { opening, editor, notify } = setup();
      // @ts-expect-error Exercise validation of untyped input.
      expect(editor.updateOpening(opening, { shape: "triangle", width: 1200 })).toEqual({
        ok: false,
        field: "shape",
        error: "Select a valid opening shape.",
      });
      expect(opening.width.toJson()).toBe(1000);
      expect(opening.shape).toBeUndefined();
      expect(notify).not.toHaveBeenCalled();
    });

    it("edits door open angles and validates them atomically", () => {
      const { plan, door, editor, notify } = setup();
      const before = plan.toJson();
      expect(door.effectiveOpenAngle).toBe(90);
      expect(editor.updateDoor(door, { openAngle: 181, hingeSide: "right" })).toEqual({
        ok: false, field: "openAngle", error: "Enter an angle between 0 and 180 degrees.",
      });
      expect(plan.toJson()).toEqual(before);
      expect(notify).not.toHaveBeenCalled();
      expect(editor.updateDoor(door, { openAngle: 0 })).toEqual({ ok: true });
      expect(door.toJson().openAngle).toBe(0);
      const reloaded = Plan.fromJson(plan.toJson());
      const reloadedDoor = reloaded.buildings[0].levels[0].walls[0].openings[0].contents[0];
      if (reloadedDoor.type !== "StandardDoor") throw new Error("Expected a standard door");
      expect(reloadedDoor.effectiveOpenAngle).toBe(0);
      expect(editor.updateDoor(door, { openAngle: 180 })).toEqual({ ok: true });
      expect(door.effectiveOpenAngle).toBe(180);
    });

    it("rejects fractional opening positions without applying other fields", () => {
      const { opening, editor, notify } = setup();
      expect(editor.updateOpening(opening, { width: 1200, distanceAlongWall: 500.5 })).toEqual({
        ok: false,
        field: "distanceAlongWall",
        error: "Position must be an accurately representable integer number of millimetres.",
      });
      expect(opening.width.toJson()).toBe(1000);
      expect(opening.distanceAlongWall.toJson()).toBe(500);
      expect(notify).not.toHaveBeenCalled();
      expect(editor.updateOpening(opening, { width: 1200.5, distanceAlongWall: -2 })).toEqual({ ok: true });
      expect(opening.toJson()).toMatchObject({ width: 1200.5, distanceAlongWall: -2 });
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
        field: "width",
        error: "Wall width must be a positive, finite number of millimetres.",
      });
    }
    for (const width of [Number.MIN_VALUE, 0.0000000001]) {
      expect(editor.updateWall(wall, { width })).toEqual({
        ok: false,
        field: "width",
        error: "Wall width is too small to save.",
      });
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
