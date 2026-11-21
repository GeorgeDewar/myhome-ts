import { describe, expect, it, vi } from "vitest";
import { Plan } from "./Plan";
import { PlanEditor } from "./PlanEditor";

const setup = () => {
  const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{ number: 0, name: "Ground" }] }] });
  const notify = vi.fn();
  return { plan, level: plan.buildings[0].levels[0], notify, editor: new PlanEditor(plan, notify) };
};

describe("creating plan objects", () => {
  it("adds walls, an ordered room, an opening, its contents and a fence that round-trip", () => {
    const { plan, level, editor, notify } = setup();
    const lines: [[number, number], [number, number]][] = [
      [
        [0, 0],
        [4000, 0],
      ],
      [
        [4000, 0],
        [4000, 3000],
      ],
      [
        [4000, 3000],
        [0, 3000],
      ],
      [
        [0, 3000],
        [0, 0],
      ],
    ];
    for (const [start, end] of lines) expect(editor.addWall(level, start, end).ok).toBe(true);
    expect(editor.addRoom(level, "Kitchen", level.walls).ok).toBe(true);
    const opening = editor.addOpening(level.walls[0], 900, 1000, 2100, 0);
    if (!opening.ok) throw new Error(opening.error);
    expect(editor.addOpeningItem(opening.item, "StandardDoor").ok).toBe(true);
    expect(editor.addOpeningItem(opening.item, "SlidingDoor").ok).toBe(true);
    expect(editor.addOpeningItem(opening.item, "StandardWindow").ok).toBe(true);
    const fence = editor.addFence([0, 5000], [4000, 5000]);
    if (!fence.ok) throw new Error(fence.error);
    expect(editor.updateFence(fence.item, { width: 75, height: 1800 }).ok).toBe(true);
    expect(notify).toHaveBeenCalledTimes(11);
    const json = plan.toJson();
    expect(json.buildings![0].levels[0].rooms![0].walls).toEqual(level.walls.map((wall) => ({ ref: wall.id })));
    expect(json.fences![0]).toMatchObject({ width: 75, height: 1800 });
    const reloaded = Plan.fromJson(json);
    expect(reloaded.loadWarnings).toEqual([]);
    expect(reloaded.toJson()).toEqual(json);
  });

  it("rejects invalid geometry and foreign parents without changing or notifying", () => {
    const { plan, level, editor, notify } = setup();
    const foreign = setup();
    expect(editor.addWall(level, [0.5, 0], [1000, 0]).ok).toBe(false);
    expect(editor.addWall(level, [0, 0], [0, 0]).ok).toBe(false);
    expect(editor.addWall(foreign.level, [0, 0], [1000, 0]).ok).toBe(false);
    expect(editor.addFence([0, 0], [0, 0]).ok).toBe(false);
    expect(editor.addRoom(level, "Room", []).ok).toBe(false);
    expect(editor.addRoom(foreign.level, "Room", []).ok).toBe(false);
    expect(plan.toJson().buildings![0].levels[0].walls).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it("rejects bad openings and rooms atomically and deletes fences", () => {
    const { plan, level, editor, notify } = setup();
    const first = editor.addWall(level, [0, 0], [1000, 0]);
    const second = editor.addWall(level, [0, 1000], [1000, 1000]);
    const third = editor.addWall(level, [0, 2000], [1000, 2000]);
    if (!first.ok || !second.ok || !third.ok) throw new Error("Could not create walls");
    const before = plan.toJson();
    expect(editor.addRoom(level, "Room", [first.item, second.item, third.item]).ok).toBe(false);
    expect(editor.addOpening(first.item, 0, 100).ok).toBe(false);
    expect(editor.addOpening(first.item, 500, 100.5).ok).toBe(false);
    expect(editor.addOpening(first.item, 500, 100, -1).ok).toBe(false);
    expect(plan.toJson()).toEqual(before);
    expect(notify).toHaveBeenCalledTimes(3);
    const fence = editor.addFence([0, 0], [1000, 0]);
    if (!fence.ok) throw new Error(fence.error);
    expect(editor.updateFence(fence.item, { width: 70, height: -1 }).ok).toBe(false);
    expect(fence.item.explicitWidth).toBeUndefined();
    expect(editor.deleteFence(fence.item).ok).toBe(true);
    expect(editor.deleteFence(fence.item).ok).toBe(false);
    expect(notify).toHaveBeenCalledTimes(5);
  });
});
