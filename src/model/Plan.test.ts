import { describe, expect, it } from "vitest";
import testPlan from "../testData/McKeefry.json";
import { StandardDoor } from "./Opening";
import { Plan } from "./Plan";
import type { JsonPlan } from "./json/Document";
import { formatPlanJson } from "./json/formatPlanJson";

describe("Plan", () => {
  it("round-trips the existing plan fixture without changing its JSON structure", () => {
    const document = testPlan as JsonPlan;

    expect(Plan.fromJson(document).toJson()).toEqual(document);
  });

  it("resolves ownership and room-wall relationships", () => {
    const document = testPlan as JsonPlan;
    const plan = Plan.fromJson(document);
    const building = plan.buildings[0];
    const level = building.levels[0];
    const wall = level.walls[0];
    const opening = wall.openings[0];

    expect(building.plan).toBe(plan);
    expect(level.building).toBe(building);
    expect(wall.level).toBe(level);
    expect(opening.wall).toBe(wall);
  });

  it("uses the default wall width when the optional width is omitted", () => {
    const document = {
      buildings: [
        {
          name: "House",
          levels: [{ number: 0, name: "Ground", walls: [{ id: "wall-1", start: [0, 0], end: [1000, 0] }] }],
        },
      ],
    } satisfies JsonPlan;

    const wall = Plan.fromJson(document).getWallsOnLevel(0)[0];

    expect(wall.width.metres).toBe(0.1);
    expect(wall.toJson()).toEqual({ id: "wall-1", start: [0, 0], end: [1000, 0] });
  });

  it("uses a 35mm leaf thickness for doors without an explicit thickness", () => {
    expect(new StandardDoor("left", "in").leafThickness.metres).toBe(0.035);
  });

  it("formats a save payload with the project Prettier options", async () => {
    const formatted = await formatPlanJson(Plan.fromJson(testPlan as JsonPlan));

    expect(formatted).toContain('  "$schema": "./schema.json"');
    expect(JSON.parse(formatted)).toEqual(testPlan);
  });

  it("rejects a room that references a missing wall", () => {
    const document = {
      buildings: [
        {
          name: "House",
          levels: [{ number: 0, name: "Ground", rooms: [{ name: "Room", walls: [{ ref: "missing" }] }] }],
        },
      ],
    } satisfies JsonPlan;

    expect(() => Plan.fromJson(document)).toThrow("references unknown wall 'missing'");
  });
});
