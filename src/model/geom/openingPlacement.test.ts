import { describe, expect, it } from "vitest";
import { Plan } from "../Plan";
import { PlanEditor } from "../PlanEditor";
import { placeOpening } from "./openingPlacement";

describe("placing an opening by clicking on a wall", () => {
  it("uses the default width centred on the click when there is room", () => {
    expect(placeOpening(4000, [], 2000)).toEqual({ distanceAlongWall: 2000, width: 900 });
  });

  it("slides along the free space near a wall end instead of shrinking", () => {
    expect(placeOpening(4000, [], 100)).toEqual({ distanceAlongWall: 450, width: 900 });
    expect(placeOpening(4000, [], 3990)).toEqual({ distanceAlongWall: 3550, width: 900 });
  });

  it("uses all the available space when it is smaller than the default", () => {
    expect(placeOpening(800, [], 400)).toEqual({ distanceAlongWall: 400, width: 800 });
    expect(placeOpening(1000, [{ distanceAlongWall: 700, width: 600 }], 100)).toEqual({
      distanceAlongWall: 200,
      width: 400,
    });
  });

  it("stays between neighbouring openings and rejects clicks inside one", () => {
    const existing = [
      { distanceAlongWall: 500, width: 600 },
      { distanceAlongWall: 2000, width: 400 },
    ];
    expect(placeOpening(4000, existing, 1000)).toEqual({ distanceAlongWall: 1250, width: 900 });
    expect(placeOpening(4000, existing, 1400)).toEqual({ distanceAlongWall: 1350, width: 900 });
    expect(placeOpening(4000, existing, 500)).toBeUndefined();
    expect(placeOpening(4000, existing, 4001)).toBeUndefined();
  });

  it("keeps the centre an integer and refuses a gap that is too small", () => {
    expect(placeOpening(601, [], 300)).toEqual({ distanceAlongWall: 300, width: 600 });
    expect(placeOpening(1000, [{ distanceAlongWall: 500, width: 999 }], 999.9)).toBeUndefined();
  });

  it("adds an opening that leaves height and floor distance to their defaults", () => {
    const plan = Plan.fromJson({
      buildings: [
        {
          name: "House",
          levels: [{ number: 0, name: "Ground", walls: [{ id: "wall", start: [0, 0], end: [800, 0] }] }],
        },
      ],
    });
    const wall = plan.buildings[0].levels[0].walls[0];
    const editor = new PlanEditor(plan, () => {});
    const added = editor.addOpeningAt(wall, 700);
    if (!added.ok) throw new Error(added.error);
    expect(added.item.toJson()).toEqual({ id: "opening1", distanceAlongWall: 400, width: 800 });
    expect(editor.addOpeningAt(wall, 100).ok).toBe(false);
  });
});
