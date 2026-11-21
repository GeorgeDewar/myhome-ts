import { describe, expect, it } from "vitest";
import { Plan } from "../Plan";

describe("plan loading validation", () => {
  it("ignores invalid items without inspecting their children and reports walls before dependent rooms", () => {
    const plan = Plan.fromJson({
      buildings: [
        { name: "Missing levels" },
        {
          name: "House",
          levels: [
            { number: 9, walls: [{ id: "unexamined" }] },
            {
              number: 0,
              name: "Ground",
              walls: [
                { id: "missing-start", end: [1000, 0], openings: [{ id: "unexamined" }] },
                { id: "zero", start: [0, 0], end: [0, 0], openings: [{ id: "unexamined" }] },
                {
                  id: "valid",
                  start: [0, 0],
                  end: [3000, 0],
                  openings: [
                    { id: "missing-distance", width: 600, contents: [{ type: "Unexamined" }] },
                    {
                      id: "door",
                      width: 900,
                      distanceAlongWall: 1000,
                      contents: [
                        { type: "Unknown" },
                        { type: "SlidingDoor", thickness: 0 },
                        { type: "StandardDoor", hingeSide: "left", swingDirection: "in" },
                      ],
                    },
                  ],
                },
              ],
              rooms: [
                { name: "Broken", walls: [{ ref: "missing-start" }] },
                { walls: [] },
                { name: "Valid", walls: [{ ref: "valid" }] },
              ],
            },
          ],
        },
      ],
    });

    expect(plan.buildings).toHaveLength(1);
    const level = plan.buildings[0].levels[0];
    expect(level.walls.map((wall) => wall.id)).toEqual(["valid"]);
    expect(level.walls[0].openings.map((opening) => opening.id)).toEqual(["door"]);
    expect(level.walls[0].openings[0].contents.map((item) => item.type)).toEqual(["StandardDoor"]);
    expect(level.rooms.map((room) => room.name)).toEqual(["Valid"]);
    expect(level.rooms[0].walls).toEqual([level.walls[0]]);
    expect(plan.loadWarnings).toHaveLength(9);
    expect(plan.loadWarnings[0]).toContain("buildings[0]: missing required property 'levels'");
    expect(plan.loadWarnings[1]).toContain("levels[0]: missing required property 'name'");
    expect(plan.loadWarnings[2]).toContain("walls[0]: missing required property 'start'");
    expect(plan.loadWarnings[3]).toContain("walls[1]: start and end");
    expect(plan.loadWarnings[4]).toContain("openings[0]: missing required property 'distanceAlongWall'");
    expect(plan.loadWarnings[5]).toContain("unknown opening item type 'Unknown'");
    expect(plan.loadWarnings[6]).toContain("contents[1]");
    expect(plan.loadWarnings[7]).toContain("rooms[0]: references unknown wall 'missing-start'");
    expect(plan.loadWarnings[8]).toContain("rooms[1]: missing required property 'name'");
    expect(plan.loadWarnings.every((warning) => !warning.includes("Unexamined"))).toBe(true);
    expect(plan.toJson().buildings![0].levels[0].rooms).toEqual([{ name: "Valid", walls: [{ ref: "valid" }] }]);
  });

  it("keeps the first valid identifier in each scope and ignores duplicates", () => {
    const plan = Plan.fromJson({
      fences: [
        { id: "f", start: [0, 0], end: [0, 0] },
        { id: "f", start: [0, 0], end: [1000, 0] },
        { id: "f", start: [0, 0], end: [2000, 0] },
      ],
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 0,
              name: "Ground",
              walls: [
                { id: "w", start: [0, 0], end: [0, 0] },
                {
                  id: "w",
                  start: [0, 0],
                  end: [3000, 0],
                  openings: [
                    { id: "o", width: 1000, distanceAlongWall: 1000 },
                    { id: "o", width: 1000, distanceAlongWall: 1000, contents: [{ type: "Unexamined" }] },
                  ],
                },
                { id: "w", start: [0, 0], end: [4000, 0], openings: [{ id: "Unexamined" }] },
              ],
              rooms: [{ name: "Room", walls: [{ ref: "w" }] }],
            },
            { number: 0, name: "Duplicate", walls: [{ id: "Unexamined" }] },
          ],
        },
      ],
    });
    expect(plan.fences).toHaveLength(1);
    expect(plan.fences[0].to.toJson()).toEqual([1000, 0]);
    expect(plan.buildings[0].levels).toHaveLength(1);
    const level = plan.buildings[0].levels[0];
    expect(level.walls).toHaveLength(1);
    expect(level.walls[0].openings).toHaveLength(1);
    expect(level.rooms[0].walls[0]).toBe(level.walls[0]);
    expect(plan.loadWarnings.filter((warning) => warning.includes("duplicate"))).toHaveLength(4);
    expect(plan.loadWarnings.every((warning) => !warning.includes("Unexamined"))).toBe(true);
  });

  it("rejects malformed types, unknown properties and invalid dimensions without aborting siblings", () => {
    const plan = Plan.fromJson({
      fences: [
        { id: "bad-coordinate", start: [0, Infinity], end: [1000, 0] },
        { id: "too-short", start: [0, 0], end: [1e-10, 0] },
        { id: "bad-width", start: [0, 0], end: [1000, 0], width: -1 },
        { id: "extra", start: [0, 0], end: [1000, 0], color: "red" },
        { id: "good", start: [0, 0], end: [1000, 0] },
      ],
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
                  end: [2000, 0],
                  openings: [
                    { id: "zero", width: 0, distanceAlongWall: 1000 },
                    { id: "tiny", width: 1e-10, distanceAlongWall: 1000 },
                    {
                      id: "good",
                      width: 1000,
                      distanceAlongWall: 1000,
                      contents: [
                        { type: "StandardDoor", hingeSide: "bad", swingDirection: "in" },
                        { type: "SlidingDoor", thickness: -1 },
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
    expect(plan.fences.map((fence) => fence.id)).toEqual(["good"]);
    const openings = plan.buildings[0].levels[0].walls[0].openings;
    expect(openings.map((opening) => opening.id)).toEqual(["good"]);
    expect(openings[0].contents.map((item) => item.type)).toEqual(["SlidingDoor"]);
    expect(plan.loadWarnings).toHaveLength(8);
    expect(plan.loadWarnings.some((warning) => warning.includes("too small to save"))).toBe(true);
    expect(plan.loadWarnings.some((warning) => warning.includes("unexpected property 'color'"))).toBe(true);
  });

  it("reports an invalid root rather than silently accepting it", () => {
    const plan = Plan.fromJson({ buildings: "not an array" });
    expect(plan.buildings).toEqual([]);
    expect(plan.loadWarnings).toHaveLength(1);
    expect(plan.loadWarnings[0]).toContain("plan:");
  });

  it("omits items with non-positive dimensions at each applicable level", () => {
    const plan = Plan.fromJson({
      fences: [{ id: "f", start: [0, 0], end: [1000, 0], height: 0 }],
      buildings: [
        {
          name: "House",
          levels: [
            { number: 0, name: "Invalid height", ceilingHeight: 0 },
            {
              number: 1,
              name: "Valid",
              walls: [
                { id: "bad-wall", start: [0, 0], end: [1000, 0], width: 0 },
                {
                  id: "wall",
                  start: [0, 0],
                  end: [3000, 0],
                  openings: [
                    { id: "bad-height", width: 800, height: 0, distanceAlongWall: 1000 },
                    {
                      id: "door",
                      width: 800,
                      distanceAlongWall: 1000,
                      contents: [
                        { type: "StandardDoor", hingeSide: "left", swingDirection: "in", thickness: 0 },
                        { type: "StandardDoor", hingeSide: "left", swingDirection: "in" },
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
    expect(plan.fences).toHaveLength(0);
    expect(plan.buildings[0].levels).toHaveLength(1);
    const walls = plan.buildings[0].levels[0].walls;
    expect(walls.map((wall) => wall.id)).toEqual(["wall"]);
    expect(walls[0].openings.map((opening) => opening.id)).toEqual(["door"]);
    expect(walls[0].openings[0].contents).toHaveLength(1);
    expect(plan.loadWarnings).toHaveLength(5);
  });
});
