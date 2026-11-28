import { describe, expect, it, vi } from "vitest";
import { Plan } from "../Plan";
import { PlanEditor } from "../PlanEditor";
import { arrangementWarnings, emptySpaceMarkers, itemGeometry, itemRectangle, largestEmptyRectangle } from "./openingArrangement";

const setup = () => {
  const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{ number: 0, name: "Ground", walls: [{
    id: "wall", start: [0, 0], end: [4000, 0], openings: [{
      id: "opening", width: 2000, distanceAlongWall: 2000, height: 2000,
      contents: [{ type: "Window", windowType: "awning" }],
    }],
  }] }] }] });
  const opening = plan.buildings[0].levels[0].walls[0].openings[0];
  const notify = vi.fn();
  return { plan, opening, item: opening.contents[0], notify, editor: new PlanEditor(plan, notify) };
};

describe("opening arrangements", () => {
  it("shows markers in usable gaps, including below items, and none when full", () => {
    const items = [
      { x: 0, y: 0, width: 300, height: 400 },
      { x: 300, y: 0, width: 200, height: 1000 },
    ];
    const markers = emptySpaceMarkers(500, 1000, items);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ x: 150, y: 700 });
    expect(largestEmptyRectangle(500, 1000, items, markers[0])).toEqual({ x: 0, y: 400, width: 300, height: 600 });
    expect(emptySpaceMarkers(500, 1000, [{ x: 0, y: 0, width: 500, height: 1000 }])).toEqual([]);
    expect(emptySpaceMarkers(500, 1000, [])).toHaveLength(1);
  });

  it("finds the largest empty rectangle containing the click, not just a grid cell", () => {
    const items = [{ x: 0, y: 0, width: 60, height: 40 }];
    expect(largestEmptyRectangle(100, 100, items, { x: 70, y: 60 }))
      .toEqual({ x: 0, y: 40, width: 100, height: 60 });
    expect(largestEmptyRectangle(100, 100, items, { x: 20, y: 20 })).toBeUndefined();
    expect(largestEmptyRectangle(100, 100, items, { x: 100, y: 20 })).toBeUndefined();
  });

  it("finds space below windows and rounds fractional top edges away from items", () => {
    const items = [
      { x: 0, y: 0, width: 300, height: 400.5 },
      { x: 300, y: 0, width: 200, height: 1000 },
    ];
    expect(largestEmptyRectangle(500, 1000, items, { x: 150, y: 700 }))
      .toEqual({ x: 0, y: 401, width: 300, height: 599 });
    expect(largestEmptyRectangle(500, 1000, items, { x: 150, y: 400.75 })).toBeUndefined();
  });

  it("adds a chosen rectangle atomically and persists it", () => {
    const { plan, opening, item, editor, notify } = setup();
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 0, y: 0, width: 500, height: 1000 }).ok).toBe(true);
    const gap = largestEmptyRectangle(2000, 2000, [itemRectangle(opening, item)], { x: 250, y: 1500 });
    expect(gap).toEqual({ x: 0, y: 1000, width: 2000, height: 1000 });
    notify.mockClear();
    const added = editor.addOpeningItem(opening, "Window", gap);
    if (!added.ok) throw new Error(added.error);
    expect(itemRectangle(opening, added.item)).toEqual(gap);
    expect(notify).toHaveBeenCalledOnce();
    const loaded = Plan.fromJson(plan.toJson());
    expect(loaded.loadWarnings).toEqual([]);
    expect(loaded.toJson()).toEqual(plan.toJson());
    expect(editor.addOpeningItem(opening, "Post", { x: 1999, y: 0, width: 2, height: 100 }).ok).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("leaves geometry blank when an item fills an empty opening, and clears fields on request", () => {
    const { plan, opening, item, editor } = setup();
    opening.contents = [];
    const gap = largestEmptyRectangle(2000, 2000, [], { x: 1000, y: 1000 });
    const added = editor.addOpeningItem(opening, "StandardDoor", gap);
    if (!added.ok) throw new Error(added.error);
    expect(itemGeometry(added.item)).toEqual({});
    expect(plan.toJson().buildings![0].levels[0].walls![0].openings![0].contents).toEqual([
      expect.not.objectContaining({ x: expect.anything() }),
    ]);
    opening.contents = [item];
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 500, width: 500 }).ok).toBe(true);
    expect(itemGeometry(item)).toEqual({ x: 500, width: 500 });
    expect(editor.updateOpeningItemGeometry(opening, item, {}).ok).toBe(true);
    expect(itemRectangle(opening, item)).toEqual({ x: 0, y: 0, width: 2000, height: 2000 });
  });

  it("places new items in the remaining space after the rightmost item", () => {
    const { plan, opening, item, editor } = setup();
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 400, y: 200, width: 600.5, height: 800 }).ok).toBe(true);
    const post = editor.addOpeningItem(opening, "Post");
    if (!post.ok) throw new Error(post.error);
    expect(itemRectangle(opening, post.item)).toEqual({ x: 1001, y: 0, width: 999, height: 2000 });
    const loaded = Plan.fromJson(plan.toJson());
    expect(loaded.loadWarnings).toEqual([]);
    expect(loaded.toJson()).toEqual(plan.toJson());
  });

  it("finds the rightmost edge regardless of item order and retains the old default when full", () => {
    const { opening, item, editor } = setup();
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 500, y: 0, width: 500, height: 2000 }).ok).toBe(true);
    const second = editor.addOpeningItem(opening, "Window");
    if (!second.ok) throw new Error(second.error);
    expect(editor.updateOpeningItemGeometry(opening, second.item, { x: 0, y: 0, width: 250, height: 2000 }).ok).toBe(true);
    const third = editor.addOpeningItem(opening, "StandardDoor");
    if (!third.ok) throw new Error(third.error);
    expect(itemRectangle(opening, third.item)).toEqual({ x: 1000, y: 0, width: 1000, height: 2000 });
    const full = editor.addOpeningItem(opening, "SlidingDoor");
    if (!full.ok) throw new Error(full.error);
    expect(itemRectangle(opening, full.item)).toEqual({ x: 0, y: 0, width: 2000, height: 2000 });
  });

  it("uses opening dimensions as defaults, saves changed geometry and round-trips posts", () => {
    const { plan, opening, item, editor, notify } = setup();
    expect(itemRectangle(opening, item)).toEqual({ x: 0, y: 0, width: 2000, height: 2000 });
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 400, y: 200, width: 600.5, height: 1800 }).ok).toBe(true);
    const post = editor.addOpeningItem(opening, "Post");
    if (!post.ok) throw new Error(post.error);
    expect(editor.updateOpeningItemGeometry(opening, post.item, { x: 1001, y: 0, width: 100, height: 2000 }).ok).toBe(true);
    const saved = plan.toJson();
    const loaded = Plan.fromJson(saved);
    expect(loaded.loadWarnings).toEqual([]);
    expect(loaded.toJson()).toEqual(saved);
    expect(itemRectangle(loaded.buildings[0].levels[0].walls[0].openings[0], loaded.buildings[0].levels[0].walls[0].openings[0].contents[0]))
      .toEqual({ x: 400, y: 200, width: 600.5, height: 1800 });
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it("rejects out-of-bounds or invalid edits and opening resizes atomically", () => {
    const { plan, opening, item, editor, notify } = setup();
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 100, y: 0, width: 1900, height: 2000 }).ok).toBe(true);
    const before = plan.toJson();
    notify.mockClear();
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 101, y: 0, width: 1900, height: 2000 }).ok).toBe(false);
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 100.5, y: 0, width: 100, height: 2000 }).ok).toBe(false);
    expect(editor.updateOpeningItemGeometry(opening, item, { x: 100, y: 0, width: 0, height: 2000 }).ok).toBe(false);
    expect(editor.updateOpening(opening, { width: 1999 }).ok).toBe(false);
    expect(plan.toJson()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  });

  it("warns and ignores invalid rectangles in loaded plans", () => {
    const { plan } = setup();
    const json = plan.toJson();
    json.buildings![0].levels[0].walls![0].openings![0].contents = [
      { type: "Post", x: 100, width: 1901 },
      { type: "Window", windowType: "awning", x: 0, width: 1000 },
    ];
    const loaded = Plan.fromJson(json);
    expect(loaded.loadWarnings).toHaveLength(1);
    expect(loaded.loadWarnings[0]).toContain("extends outside");
    expect(loaded.buildings[0].levels[0].walls[0].openings[0].contents).toHaveLength(1);
  });

  it("detects gaps and overlaps but not touching edges", () => {
    const left = { x: 0, y: 0, width: 500, height: 1000 };
    expect(arrangementWarnings(1000, 1000, [left, { x: 500, y: 0, width: 500, height: 1000 }]))
      .toEqual({ gap: false, overlap: false });
    expect(arrangementWarnings(1000, 1000, [left, { x: 499, y: 0, width: 500, height: 1000 }]))
      .toEqual({ gap: true, overlap: true });
    expect(arrangementWarnings(1000, 1000, [])).toEqual({ gap: true, overlap: false });
  });
});
