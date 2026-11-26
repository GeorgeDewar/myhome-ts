import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Plan } from "../model/Plan";
import { PlanEditor } from "../model/PlanEditor";
import { applyPropertyDraft, createPropertyDraft } from "./propertyDraft";
import { PropertyWindow } from "./PropertyWindow";
import { OpeningEditor } from "./OpeningEditor";

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
                      { type: "SashWindow", windowType: "awning" },
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
  if (door.type !== "StandardDoor" || slidingDoor.type !== "SlidingDoor" || window.type !== "SashWindow") {
    throw new Error("Unexpected opening contents");
  }
  const notify = vi.fn();
  return { plan, level, wall, opening, door, slidingDoor, window, notify, editor: new PlanEditor(plan, notify) };
};

describe("opening editor", () => {
  it("shows the opening outline and its items with opening properties", () => {
    const { opening, editor } = setup();
    const markup = renderToStaticMarkup(createElement(OpeningEditor, { opening, editPlan: editor, onClose: () => {} }));
    expect(markup).toContain("Opening outline");
    expect(markup).toContain("Warning: opening items overlap.");
    expect(markup).toContain("1. Standard Door");
    expect(markup).toContain("2. Sliding Door");
    expect(markup).toContain("3. Sash Window");
    expect(markup).toContain("Opening Properties");
  });

  it("opens a selected item's properties in the same editor", () => {
    const { opening, door, editor } = setup();
    const markup = renderToStaticMarkup(createElement(OpeningEditor, {
      opening, initialItem: door, editPlan: editor, onClose: () => {},
    }));
    expect(markup).toContain("Standard Door Properties");
    expect(markup).toContain("Hinge side");
    expect(markup).toContain("Swing direction");
  });
});

describe("property drafts", () => {
  it("edits and clears multiline label text independently of the room name", () => {
    const { level, editor } = setup();
    const room = level.rooms[0];
    const draft = createPropertyDraft({ kind: "roomLabel", item: room });
    draft.values = { ...draft.values, labelText: "First\nSecond" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(room.name).toBe("Room");
    expect(room.toJson().label).toEqual({ text: "First\nSecond" });
    const reset = createPropertyDraft({ kind: "roomLabel", item: room });
    reset.values = { ...reset.values, labelText: "" };
    expect(applyPropertyDraft(reset, editor)).toEqual({});
    expect(room.toJson().label).toBeUndefined();
  });

  it("edits label size and angle atomically, without saving unchanged automatic values", () => {
    const { level, editor, notify } = setup();
    const room = level.rooms[0];
    const target = { kind: "roomLabel" as const, item: room };
    const draft = createPropertyDraft(target);
    expect(draft.values).toEqual({ labelText: "", fontSize: "", rotation: "" });
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(room.label).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, labelText: "New", fontSize: "150.5", rotation: "35" };
    expect(applyPropertyDraft(draft, editor).fontSize).toBeDefined();
    expect(room.label).toBeUndefined();
    draft.values = { ...draft.values, fontSize: "151" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(room.label).toEqual({ text: "New", fontSize: 151, rotation: 35 });
    const reset = createPropertyDraft(target);
    expect(reset.values).toMatchObject({ fontSize: "151", rotation: "35" });
    reset.values = { ...reset.values, fontSize: "", rotation: "" };
    expect(applyPropertyDraft(reset, editor)).toEqual({});
    expect(room.label).toEqual({ text: "New" });
    room.label = { text: "New", rotation: 0 };
    const zeroRotation = createPropertyDraft(target);
    expect(zeroRotation.values.rotation).toBe("0");
    expect(applyPropertyDraft(zeroRotation, editor)).toEqual({});
    expect(room.label.rotation).toBe(0);
  });

  it("shows a separate label dialog with a read-only room name", () => {
    const { level, editor } = setup();
    const room = level.rooms[0];
    const target = { kind: "roomLabel" as const, item: room };
    const markup = renderToStaticMarkup(createElement(PropertyWindow, { target, editPlan: editor, onClose: () => {} }));
    expect(markup).toContain("Room Label Properties");
    expect(markup).toContain("Room name");
    expect(markup).toContain('readOnly=""');
    expect(markup).toContain("Font size (mm)");
    expect(markup).toContain("Rotation (degrees)");
    expect(markup).toContain('placeholder="Automatic"');
    expect(markup).toContain('placeholder="0"');
    const roomMarkup = renderToStaticMarkup(createElement(PropertyWindow, {
      target: { kind: "room", item: room }, editPlan: editor, onClose: () => {},
    }));
    expect(roomMarkup).not.toContain("Label text (optional)");
  });

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
    expect(applyPropertyDraft(draft, editor)).toEqual({ form: "This wall is no longer in the plan." });
    draft.values = { ...draft.initialValues, virtual: true };
    expect(applyPropertyDraft(draft, editor)).toEqual({ form: "This wall is no longer in the plan." });
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

  it("edits a door's open angle with validation", () => {
    const { opening, door, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "door", item: door, opening });
    expect(draft.values.openAngle).toBe("90");
    draft.values = { ...draft.values, openAngle: "-1", hingeSide: "right" };
    expect(applyPropertyDraft(draft, editor).openAngle).toBeDefined();
    expect(door.hingeSide).toBe("left");
    expect(notify).not.toHaveBeenCalled();
    draft.values = { ...draft.values, openAngle: "22.5", hingeSide: "left" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(door.toJson().openAngle).toBe(22.5);
    expect(createPropertyDraft({ kind: "door", item: door, opening }).values.openAngle).toBe("22.5");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("edits sash window type and dimensions atomically, retaining and clearing optional overrides", () => {
    const { opening, window, editor, notify } = setup();
    const target = { kind: "window" as const, item: window, opening };
    const draft = createPropertyDraft(target);
    expect(draft.values.windowType).toBe("awning");
    expect(draft.values.widthTop).toBe("");
    draft.values = { ...draft.values, windowType: "fixed", widthTop: "45.5", depth: "0" };
    expect(applyPropertyDraft(draft, editor).depth).toBeDefined();
    expect(window.windowType).toBe("awning");
    expect(window.sash).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
    draft.values.depth = "30";
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(window.toJson()).toMatchObject({ windowType: "fixed", sash: { widthTop: 45.5, depth: 30 } });
    expect(notify).toHaveBeenCalledOnce();
    const next = createPropertyDraft(target);
    next.values = { ...next.values, widthTop: "" };
    expect(applyPropertyDraft(next, editor)).toEqual({});
    expect(window.toJson().sash).toEqual({ depth: 30 });
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
    draft.values = { ...draft.values, width: "-1", endX: "1500" };
    expect(applyPropertyDraft(draft, editor)).toEqual({
      width: "Wall width must be a positive, finite number of millimetres.",
    });
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

  it("reports fence dimension errors under their fields and geometry errors at form level", () => {
    const { editor, notify } = setup();
    const added = editor.addFence([0, 0], [1000, 0]);
    if (!added.ok) throw new Error(added.error);
    notify.mockClear();
    const draft = createPropertyDraft({ kind: "fence", item: added.item });
    draft.values = { ...draft.values, width: "-1", endX: "500" };
    expect(applyPropertyDraft(draft, editor)).toEqual({
      width: "Fence width must be a positive, finite number of millimetres.",
    });
    draft.values = { ...draft.values, width: "75", height: "-1" };
    expect(applyPropertyDraft(draft, editor)).toEqual({
      height: "Fence height must be a positive, finite number of millimetres.",
    });
    draft.values = { ...draft.values, height: "", endX: "0" };
    expect(applyPropertyDraft(draft, editor)).toEqual({ form: "Start and end must define a finite, non-zero line." });
    expect(added.item.width.toJson()).toBe(50);
    expect(notify).not.toHaveBeenCalled();
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

  it("edits attic status atomically and preserves an untouched default", () => {
    const { plan, level, wall, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "wall", item: wall });
    expect(draft.values.attic).toBe(false);
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(wall.toJson()).not.toHaveProperty("attic");

    draft.values = { ...draft.values, attic: true, width: "-1" };
    expect(applyPropertyDraft(draft, editor).width).toBeDefined();
    expect(wall.attic).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, width: "200" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(wall.attic).toBe(true);
    expect(Plan.fromJson(plan.toJson()).buildings[0].levels[0].walls[0].attic).toBe(true);
    expect(notify).toHaveBeenCalledOnce();

    const next = createPropertyDraft({ kind: "wall", item: wall });
    next.values = { ...next.values, attic: false };
    expect(applyPropertyDraft(next, editor)).toEqual({});
    expect(wall.toJson().attic).toBe(false);
    expect(notify).toHaveBeenCalledTimes(2);
    level.walls.pop();
    next.values = { ...next.values, attic: false };
    expect(applyPropertyDraft(next, editor)).toEqual({ form: "This wall is no longer in the plan." });
  });

  it("renders a checkbox reflecting wall attic status", () => {
    const { wall, editor } = setup();
    const render = () =>
      renderToStaticMarkup(
        createElement(PropertyWindow, { target: { kind: "wall", item: wall }, editPlan: editor, onClose: () => {} }),
      );
    expect(render()).toContain('<input type="checkbox"/>Attic');
    wall.attic = true;
    expect(render()).toContain('<input type="checkbox" checked=""/>Attic');
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

  it("edits opening shape atomically and omits the rectangle default", () => {
    const { plan, opening, editor, notify } = setup();
    const draft = createPropertyDraft({ kind: "opening", item: opening });
    expect(draft.values.shape).toBe("rectangle");
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(opening.toJson()).not.toHaveProperty("shape");
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, shape: "halfCircleArch", width: "-1" };
    expect(applyPropertyDraft(draft, editor).width).toBeDefined();
    expect(opening.shape).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();

    draft.values = { ...draft.values, width: "1000" };
    expect(applyPropertyDraft(draft, editor)).toEqual({});
    expect(Plan.fromJson(plan.toJson()).buildings[0].levels[0].walls[0].openings[0].shape).toBe("halfCircleArch");
    expect(notify).toHaveBeenCalledOnce();

    const next = createPropertyDraft({ kind: "opening", item: opening });
    next.values = { ...next.values, shape: "rectangle" };
    expect(applyPropertyDraft(next, editor)).toEqual({});
    expect(opening.shape).toBeUndefined();
    expect(opening.toJson()).not.toHaveProperty("shape");
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("renders the opening shape selector with the current value", () => {
    const { opening, editor } = setup();
    const render = () =>
      renderToStaticMarkup(
        createElement(PropertyWindow, { target: { kind: "opening", item: opening }, editPlan: editor, onClose: () => {} }),
      );
    expect(render()).toContain('<option value="rectangle" selected="">Rectangle</option>');
    opening.shape = "halfCircleArch";
    expect(render()).toContain('<option value="halfCircleArch" selected="">Half-circle arch</option>');
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
