import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Plan } from "../model/Plan";
import { PlanEditor } from "../model/PlanEditor";
import { applyPropertyDraft, createPropertyDraft } from "./propertyDraft";
import { PropertyWindow } from "./PropertyWindow";

const setup = () => {
  const plan = Plan.fromJson({
    buildings: [
      {
        name: "House",
        levels: [
          {
            number: 0,
            name: "Ground",
            rooms: [{ name: "Room", walls: [{ ref: "wall" }] }],
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
  return { plan, level, wall, opening, door, slidingDoor, window, notify, editor: new PlanEditor(plan, notify) };
};

describe("property drafts", () => {
  it("applies wall edits only on request, preserving defaults for unchanged values", () => {
    const { wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(wall.explicitWidth).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();

    draft.values = { width: "250" };
    expect(wall.width.toJson()).toBe(100);
    expect(notify).not.toHaveBeenCalled();
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(wall.width.toJson()).toBe(250);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("rejects invalid and stale wall edits without mutating or notifying", () => {
    const { level, wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    draft.values = { width: "" };
    expect(applyPropertyDraft(draft, editor).width).toBeDefined();
    draft.values = { width: "-10" };
    expect(applyPropertyDraft(draft, editor).width).toBeDefined();
    level.walls.pop();
    draft.values = { width: "200" };
    expect(applyPropertyDraft(draft, editor).width).toBe("This wall is no longer in the plan.");
    expect(wall.width.toJson()).toBe(100);
    expect(notify).not.toHaveBeenCalled();
  });

  it("validates all opening fields before applying either change", () => {
    const { opening, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "opening", item: opening });
    draft.values = { width: "1200", distanceAlongWall: "" };
    expect(applyPropertyDraft(draft, editor).distanceAlongWall).toBeDefined();
    expect(opening.width.toJson()).toBe(1000);
    expect(opening.distanceAlongWall.toJson()).toBe(500);
    expect(notify).not.toHaveBeenCalled();

    draft.values = { width: "1200", distanceAlongWall: "600" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(opening.width.toJson()).toBe(1200);
    expect(opening.distanceAlongWall.toJson()).toBe(600);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("applies door selections and thickness together, without materializing untouched defaults", () => {
    const { opening, door, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "door", item: door, opening });
    draft.values = { ...draft.values, hingeSide: "right", swingDirection: "out", thickness: "" };
    expect(applyPropertyDraft(draft, editor).thickness).toBeDefined();
    expect(door.hingeSide).toBe("left");
    expect(door.swingDirection).toBe("in");
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, thickness: "35" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(door.hingeSide).toBe("right");
    expect(door.swingDirection).toBe("out");
    expect(door.thickness).toBeUndefined();
    expect(notify).toHaveBeenCalledOnce();

    const next = createPropertyDraft({ kind: "door", item: door, opening });
    next.values = { ...next.values, thickness: "50" };
    expect(applyPropertyDraft(next, editor)).toEqual({});
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

    expect(applyPropertyDraft(roomDraft, editor)).toEqual({});
    expect(applyPropertyDraft(slidingDraft, editor)).toEqual({});
    expect(applyPropertyDraft(createPropertyDraft({ kind: "window", item: window, opening }), editor)).toEqual({});
    expect(room.name).toBe("Kitchen");
    expect(room.walls).toEqual([level.walls[0]]);
    expect(slidingDoor.leafThickness.toJson()).toBe(55);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("reports removed rooms and doors without applying their drafts", () => {
    const { level, opening, door, editor, notify } = setup();
    const room = level.rooms[0];
    const roomDraft = createPropertyDraft({ kind: "room", item: room });
    roomDraft.values = { name: "Kitchen" };
    const doorDraft = createPropertyDraft({ kind: "door", item: door, opening });
    doorDraft.values = { ...doorDraft.values, hingeSide: "right" };
    level.rooms.pop();
    level.walls.pop();

    expect(applyPropertyDraft(roomDraft, editor).form).toBe("This room is no longer in the plan.");
    expect(applyPropertyDraft(doorDraft, editor).form).toBe("This door is no longer in the plan.");
    expect(room.name).toBe("Room");
    expect(door.hingeSide).toBe("left");
    expect(notify).not.toHaveBeenCalled();
  });

  it("applies wall endpoints atomically with width and rejects collapsed or fractional lines", () => {
    const { wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    draft.values = { ...draft.values, width: "200", endX: "0" };
    expect(applyPropertyDraft(draft, editor).form).toBeDefined();
    expect(wall.width.toJson()).toBe(100);
    expect(wall.to.x.toPositionJson()).toBe(3000);
    draft.values = { ...draft.values, endX: "1500.5" };
    expect(applyPropertyDraft(draft, editor).form).toBeDefined();
    expect(notify).not.toHaveBeenCalled();
    draft.values = { ...draft.values, endX: "1500", endY: "1000" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(wall.to.toJson()).toEqual([1500, 1000]);
    expect(wall.width.toJson()).toBe(200);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("edits wall virtual status atomically and preserves an untouched default", () => {
    const { plan, wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    expect(draft.values.virtual).toBe(false);
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(wall.toJson()).not.toHaveProperty("virtual");
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, virtual: true, width: "-1" };
    expect(applyPropertyDraft(draft, editor).width).toBeDefined();
    expect(wall.virtual).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, width: "200" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(wall.width.toJson()).toBe(200);
    expect(wall.virtual).toBe(true);
    expect(Plan.fromJson(plan.toJson()).buildings[0].levels[0].walls[0].virtual).toBe(true);
    expect(notify).toHaveBeenCalledOnce();

    const next = createPropertyDraft({ kind: "wall", item: wall });
    next.values = { ...next.values, virtual: false };
    expect(applyPropertyDraft(next, editor)).toEqual({});
    expect(wall.toJson().virtual).toBe(false);
    expect(Plan.fromJson(plan.toJson()).buildings[0].levels[0].walls[0].virtual).toBe(false);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("reports a removed wall when applying a virtual status change", () => {
    const { level, wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    draft.values = { ...draft.values, virtual: true };
    level.walls.pop();
    expect(applyPropertyDraft(draft, editor).form).toBe("This wall is no longer in the plan.");
    expect(wall.virtual).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it("renders a checkbox reflecting wall virtual status", () => {
    const { wall, editor } = setup();
    const render = () =>
      renderToStaticMarkup(
        createElement(PropertyWindow, { target: { kind: "wall", item: wall }, editPlan: editor, onClose: () => {} }),
      );
    expect(render()).toContain('<input type="checkbox"/>Virtual');
    wall.virtual = true;
    expect(render()).toContain('<input type="checkbox" checked=""/>Virtual');
  });

  it("edits and clears optional opening heights and offsets atomically", () => {
    const { opening, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "opening", item: opening });
    draft.values = { ...draft.values, height: "2100", distanceFromFloor: "0.5", width: "1200" };
    expect(applyPropertyDraft(draft, editor).distanceFromFloor).toBeDefined();
    expect(opening.width.toJson()).toBe(1000);
    expect(opening.height).toBeUndefined();
    draft.values = { ...draft.values, distanceFromFloor: "100" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(opening.toJson()).toMatchObject({ width: 1200, height: 2100, distanceFromFloor: 100 });
    const next = createPropertyDraft({ kind: "opening", item: opening });
    next.values = { ...next.values, height: "", distanceFromFloor: "" };
    expect(applyPropertyDraft(next, editor)).toEqual({});
    expect(opening.height).toBeUndefined();
    expect(opening.distanceFromFloor).toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("renders room properties with a name field but no wall selection", () => {
    const { level, editor } = setup();
    const room = level.rooms[0];
    const markup = renderToStaticMarkup(
      createElement(PropertyWindow, { target: { kind: "room", item: room }, editPlan: editor, onClose: () => {} }),
    );
    expect(markup).toContain("Name<input");
    expect(markup).toContain('value="Room"');
    expect(markup).not.toContain('type="checkbox"');
  });
});
