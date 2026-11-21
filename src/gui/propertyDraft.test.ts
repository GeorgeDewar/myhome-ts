import { describe, expect, it, vi } from "vitest";
import { Plan } from "../model/Plan";
import { PlanEditor } from "../model/PlanEditor";
import { applyPropertyDraft, createPropertyDraft } from "./propertyDraft";

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
                      { type: "StandardWindow" },
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
  const wall = level.walls[0];
  const opening = wall.openings[0];
  const [door, slidingDoor, window] = opening.contents;
  if (door.type !== "StandardDoor" || slidingDoor.type !== "SlidingDoor" || window.type !== "StandardWindow") {
    throw new Error("Unexpected opening contents");
  }
  const notify = vi.fn();
  return { level, wall, opening, door, slidingDoor, window, notify, editor: new PlanEditor(plan, notify) };
};

describe("property drafts", () => {
  it("applies wall edits only on request, preserving defaults for unchanged values", () => {
    const { wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    expect(applyPropertyDraft(draft, editor, notify)).toEqual({});
    expect(wall.explicitWidth).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();

    draft.values = { width: "250" };
    expect(wall.width.toJson()).toBe(100);
    expect(notify).not.toHaveBeenCalled();
    expect(applyPropertyDraft(draft, editor, notify)).toEqual({});
    expect(wall.width.toJson()).toBe(250);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("rejects invalid and stale wall edits without mutating or notifying", () => {
    const { level, wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    draft.values = { width: "" };
    expect(applyPropertyDraft(draft, editor, notify).width).toBeDefined();
    draft.values = { width: "-10" };
    expect(applyPropertyDraft(draft, editor, notify).width).toBeDefined();
    level.walls.pop();
    draft.values = { width: "200" };
    expect(applyPropertyDraft(draft, editor, notify).width).toBe("This wall is no longer in the plan.");
    expect(wall.width.toJson()).toBe(100);
    expect(notify).not.toHaveBeenCalled();
  });

  it("validates all opening fields before applying either change", () => {
    const { opening, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "opening", item: opening });
    draft.values = { width: "1200", distanceAlongWall: "" };
    expect(applyPropertyDraft(draft, editor, notify).distanceAlongWall).toBeDefined();
    expect(opening.width.toJson()).toBe(1000);
    expect(opening.distanceAlongWall.toJson()).toBe(500);
    expect(notify).not.toHaveBeenCalled();

    draft.values = { width: "1200", distanceAlongWall: "600" };
    expect(applyPropertyDraft(draft, editor, notify)).toEqual({});
    expect(opening.width.toJson()).toBe(1200);
    expect(opening.distanceAlongWall.toJson()).toBe(600);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("applies door selections and thickness together, without materializing untouched defaults", () => {
    const { opening, door, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "door", item: door, opening });
    draft.values = { ...draft.values, hingeSide: "right", swingDirection: "out", thickness: "" };
    expect(applyPropertyDraft(draft, editor, notify).thickness).toBeDefined();
    expect(door.hingeSide).toBe("left");
    expect(door.swingDirection).toBe("in");
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, thickness: "35" };
    expect(applyPropertyDraft(draft, editor, notify)).toEqual({});
    expect(door.hingeSide).toBe("right");
    expect(door.swingDirection).toBe("out");
    expect(door.thickness).toBeUndefined();
    expect(notify).toHaveBeenCalledOnce();

    const next = createPropertyDraft({ kind: "door", item: door, opening });
    next.values = { ...next.values, thickness: "50" };
    expect(applyPropertyDraft(next, editor, notify)).toEqual({});
    expect(door.leafThickness.toJson()).toBe(50);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("applies room and sliding-door changes, and leaves windows unchanged", () => {
    const { level, opening, slidingDoor, window, editor, notify } = setup();
    const room = level.rooms[0];
    const roomDraft = createPropertyDraft({ kind: "room", item: room });
    roomDraft.values = { name: "Kitchen" };
    const slidingDraft = createPropertyDraft({ kind: "slidingDoor", item: slidingDoor, opening });
    slidingDraft.values = { thickness: "55" };
    expect(room.name).toBe("Room");
    expect(slidingDoor.thickness).toBeUndefined();

    expect(applyPropertyDraft(roomDraft, editor, notify)).toEqual({});
    expect(applyPropertyDraft(slidingDraft, editor, notify)).toEqual({});
    expect(applyPropertyDraft(createPropertyDraft({ kind: "window", item: window, opening }), editor, notify)).toEqual(
      {},
    );
    expect(room.name).toBe("Kitchen");
    expect(slidingDoor.leafThickness.toJson()).toBe(55);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
