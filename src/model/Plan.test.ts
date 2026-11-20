import { describe, expect, it } from "vitest";
import testPlan from "../testData/McKeefry.json";
import { Fence } from "./Fence";
import { SlidingDoor, StandardDoor } from "./Opening";
import { Plan } from "./Plan";
import { Room } from "./Room";
import { Wall } from "./Wall";
import type { JsonFence, JsonPlan, JsonRoom, JsonWall } from "./json/Document";
import { formatPlanJson } from "./json/formatPlanJson";

describe("Plan", () => {
  it("round-trips the existing plan fixture, omitting empty optional arrays", () => {
    const document = testPlan as JsonPlan;

    const expected = structuredClone(document);
    const emptyLevel = expected.buildings![0].levels.find((level) => level.number === 3)!;
    delete emptyLevel.walls;
    delete emptyLevel.rooms;
    expect(Plan.fromJson(document).toJson()).toEqual(expected);
  });

  it("resolves ownership and room-wall relationships", () => {
    const document = testPlan as JsonPlan;
    const plan = Plan.fromJson(document);
    const building = plan.buildings[0];
    const level = building.levels[1];
    const wall = level.walls.find((candidate) => candidate.openings.length > 0)!;
    const opening = wall.openings[0];

    expect(building.plan).toBe(plan);
    expect(level.building).toBe(building);
    expect(wall.level).toBe(level);
    expect(opening.wall).toBe(wall);
    expect(level.rooms[0].walls[0].level).toBe(level);
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
    expect(new SlidingDoor().leafThickness.metres).toBe(0.035);
  });

  it("round-trips optional sliding-door thickness", () => {
    const document = {
      buildings: [{
        name: "House",
        levels: [{
          number: 0,
          name: "Ground",
          walls: [{
            id: "wall",
            start: [0, 0],
            end: [4000, 0],
            openings: [{
              id: "opening",
              width: 2000,
              distanceAlongWall: 2000,
              contents: [{ type: "SlidingDoor" }, { type: "SlidingDoor", thickness: 60 }],
            }],
          }],
        }],
      }],
    } satisfies JsonPlan;

    const plan = Plan.fromJson(document);
    const [defaultDoor, customDoor] = plan.buildings[0].levels[0].walls[0].openings[0].contents;
    expect(defaultDoor).toBeInstanceOf(SlidingDoor);
    expect(customDoor).toBeInstanceOf(SlidingDoor);
    if (defaultDoor.type !== "SlidingDoor" || customDoor.type !== "SlidingDoor") throw new Error("Expected sliding doors");
    expect(defaultDoor.leafThickness.metres).toBe(0.035);
    expect(customDoor.leafThickness.metres).toBe(0.06);
    expect(plan.toJson()).toEqual(document);
  });

  it("formats a save payload with the project Prettier options", async () => {
    const plan = Plan.fromJson(testPlan as unknown as JsonPlan);
    const formatted = await formatPlanJson(plan);

    expect(formatted).toContain(`  "$schema": "${testPlan.$schema}"`);
    expect(JSON.parse(formatted)).toEqual(plan.toJson());
  });

  it("omits empty optional arrays but retains required arrays and other fields", () => {
    const document = {
      fences: [{ id: "fence", start: [0, 0], end: [1000, 0], height: 1800 }],
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 0,
              name: "Ground",
              walls: [
                { id: "virtual", start: [0, 0], end: [1000, 0], virtual: false, openings: [] },
                {
                  id: "with-opening",
                  start: [0, 1000],
                  end: [1000, 1000],
                  openings: [{ id: "opening", width: 800, distanceAlongWall: 500, contents: [] }],
                },
              ],
              rooms: [{ name: "Empty", walls: [] }],
            },
            { number: 1, name: "Empty", walls: [], rooms: [] },
          ],
        },
      ],
    } satisfies JsonPlan;

    expect(Plan.fromJson(document).toJson()).toEqual({
      fences: [{ id: "fence", start: [0, 0], end: [1000, 0], height: 1800 }],
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 0,
              name: "Ground",
              walls: [
                { id: "virtual", start: [0, 0], end: [1000, 0], virtual: false },
                {
                  id: "with-opening",
                  start: [0, 1000],
                  end: [1000, 1000],
                  openings: [{ id: "opening", width: 800, distanceAlongWall: 500 }],
                },
              ],
              rooms: [{ name: "Empty", walls: [] }],
            },
            { number: 1, name: "Empty" },
          ],
        },
      ],
    });
    expect(Plan.fromJson({}).toJson()).toEqual({});
    expect(Plan.fromJson({ fences: [], buildings: [] }).toJson()).toEqual({});
    expect(Plan.fromJson({ buildings: [{ name: "Empty", levels: [] }] }).toJson()).toEqual({
      buildings: [{ name: "Empty", levels: [] }],
    });
    expect(Plan.fromJson({ $schema: "" }).toJson()).toEqual({ $schema: "" });
  });

  it("rejects walls without both endpoints and rooms without a walls array", () => {
    expect(() => Wall.fromJson({ id: "missing-start", end: [1000, 0] } as JsonWall)).toThrow(
      "Wall 'missing-start' requires start and end positions",
    );
    expect(() => Wall.fromJson({ id: "missing-end", start: [0, 0] } as JsonWall)).toThrow(
      "Wall 'missing-end' requires start and end positions",
    );
    expect(() => Room.fromJson({ name: "missing-walls" } as JsonRoom)).toThrow(
      "Room 'missing-walls' requires a walls array",
    );
    expect(Room.fromJson({ name: "empty", walls: [] }).toJson()).toEqual({ name: "empty", walls: [] });
  });

  it("rejects fences without both endpoints", () => {
    expect(() => Fence.fromJson({ id: "missing-start", end: [1000, 0] } as JsonFence)).toThrow(
      "Fence 'missing-start' requires start and end positions",
    );
    expect(() => Fence.fromJson({ id: "missing-end", start: [0, 0] } as JsonFence)).toThrow(
      "Fence 'missing-end' requires start and end positions",
    );
  });

  it("rejects zero-length walls and fences when loading a plan", () => {
    const zeroWall = {
      buildings: [{
        name: "House",
        levels: [{ number: 0, name: "Ground", walls: [{ id: "wall", start: [100, 200], end: [100, 200] }] }],
      }],
    } satisfies JsonPlan;
    const zeroFence = { fences: [{ id: "fence", start: [-100, 200], end: [-100, 200] }] } satisfies JsonPlan;

    expect(() => Plan.fromJson(zeroWall)).toThrow("Wall 'wall' must have a non-zero centerline");
    expect(() => Plan.fromJson(zeroFence)).toThrow("Fence 'fence' must have a non-zero centerline");
  });

  it("uses 50mm for fence width unless specified and retains the original JSON", () => {
    const defaultFence = Fence.fromJson({ id: "default", start: [0, 0], end: [1000, 0] });
    const customFence = Fence.fromJson({ id: "custom", start: [0, 0], end: [0, 1000], width: 100, height: 1800 });

    expect(defaultFence.width.metres).toBe(0.05);
    expect(defaultFence.basicPolygon2D().map((point) => point.toJson())).toEqual([
      [-25, 25],
      [1025, 25],
      [1025, -25],
      [-25, -25],
    ]);
    expect(customFence.width.metres).toBe(0.1);
    expect(customFence.basicPolygon2D().map((point) => point.toJson())).toEqual([
      [-50, -50],
      [-50, 1050],
      [50, 1050],
      [50, -50],
    ]);
    expect(defaultFence.toJson()).toEqual({ id: "default", start: [0, 0], end: [1000, 0] });
    expect(customFence.toJson()).toEqual({ id: "custom", start: [0, 0], end: [0, 1000], width: 100, height: 1800 });
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
