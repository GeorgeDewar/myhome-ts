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
