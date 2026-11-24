import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import schema from "../../../schema.json";
import { Plan } from "../Plan";

const expectValidPlan = (document: unknown) => {
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const valid = validate(document);
  expect(valid, `Saved plan does not match the schema:\n${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
};

describe("plan loading validation", () => {
  it("accepts integer label sizes and round-trippable positions beyond the safe-integer limit", () => {
    const value = 2 ** 53;
    const plan = Plan.fromJson({
      fences: [{ id: "f", start: [0, 0], end: [value, 0] }],
      buildings: [{ name: "House", levels: [{
        number: 0, name: "Ground", rooms: [{ name: "Room", walls: [], label: { fontSize: value } }],
      }] }],
    });
    expect(plan.loadWarnings).toEqual([]);
    const saved = plan.toJson();
    expect(saved.fences![0].end).toEqual([value, 0]);
    expect(saved.buildings![0].levels[0].rooms![0].label?.fontSize).toBe(value);
    expectValidPlan(saved);
  });

  it("round-trips label overrides and warns about unknown label properties", () => {
    const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{
      number: 0, name: "Ground", rooms: [{
        name: "Room", walls: [], label: { text: "First\nSecond", position: [100, -200], rotation: 45, fontSize: 251, extra: true },
      }],
    }] }] });
    expect(plan.loadWarnings).toHaveLength(1);
    expect(plan.loadWarnings[0]).toContain("unexpected property 'extra'");
    const saved = plan.toJson();
    expect(saved.buildings![0].levels[0].rooms![0].label).toEqual({
      text: "First\nSecond", position: [100, -200], rotation: 45, fontSize: 251,
    });
    expect(JSON.stringify(saved)).toContain("First\\nSecond");
    expectValidPlan(saved);
    expect(Plan.fromJson(saved).toJson()).toEqual(saved);
    saved.buildings![0].levels[0].rooms![0].label!.position![0] = 999;
    expect(plan.getRoomsOnLevel(0)[0].label!.position).toEqual([100, -200]);
  });

  it("rejects invalid label positions and font sizes with warnings", () => {
    const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{
      number: 0, name: "Ground", rooms: [
        { name: "Bad position", walls: [], label: { position: [1.5, 0] } },
        { name: "Bad size", walls: [], label: { fontSize: 0 } },
        { name: "Fractional size", walls: [], label: { fontSize: 250.5 } },
      ],
    }] }] });
    expect(plan.getRoomsOnLevel(0)).toEqual([]);
    expect(plan.loadWarnings).toHaveLength(3);
    expect(plan.loadWarnings[0]).toContain("/label/position/0");
    expect(plan.loadWarnings[1]).toContain("/label/fontSize");
    expect(plan.loadWarnings[2]).toContain("/label/fontSize must be integer");
  });

  it("ignores fractional fence and opening positions but retains fractional dimensions", () => {
    const document = {
      fences: [
        { id: "invalid", start: [1.49, -1.5], end: [100, 0] },
        { id: "valid", start: [1, -2], end: [101, -2], width: 50.25 },
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
                  start: [10, 21],
                  end: [2000, 21],
                  width: 100.25,
                  openings: [
                    { id: "along", width: 800, distanceAlongWall: 500.5, contents: [{ type: "Unexamined" }] },
                    { id: "floor", width: 800, distanceAlongWall: 500, distanceFromFloor: -1.5 },
                    { id: "valid", width: 800.5, distanceAlongWall: 501, distanceFromFloor: -2 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const original = structuredClone(document);
    const plan = Plan.fromJson(document);
    const saved = plan.toJson();
    const wall = plan.buildings[0].levels[0].walls[0];
    expect(document).toEqual(original);
    expect(saved.fences![0]).toMatchObject({ start: [1, -2], end: [101, -2], width: 50.25 });
    expect(wall.from.x.metres).toBe(0.01);
    expect(wall.to.y.metres).toBe(0.021);
    expect(saved.buildings![0].levels[0].walls![0]).toMatchObject({
      start: [10, 21],
      end: [2000, 21],
      width: 100.25,
      openings: [{ width: 800.5, distanceAlongWall: 501, distanceFromFloor: -2 }],
    });
    expect(plan.loadWarnings).toHaveLength(3);
    expect(plan.loadWarnings[0]).toContain("fences[0]: /start/0 must be integer");
    expect(plan.loadWarnings[1]).toContain("openings[0]: /distanceAlongWall must be integer");
    expect(plan.loadWarnings[2]).toContain("openings[1]: /distanceFromFloor must be integer");
    expect(plan.loadWarnings.every((warning) => !warning.includes("Unexamined"))).toBe(true);
    expectValidPlan(saved);
    const reloaded = Plan.fromJson(saved);
    expect(reloaded.loadWarnings).toEqual([]);
    expect(reloaded.toJson()).toEqual(saved);
  });

  it("ignores fractional wall and fence endpoints before dependent rooms", () => {
    const plan = Plan.fromJson({
      fences: [{ id: "fence", start: [0, 0], end: [0.49, 0] }],
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 0,
              name: "Ground",
              walls: [
                { id: "end", start: [0, 0], end: [0.49, 0], openings: [{ id: "unexamined" }] },
                { id: "start", start: [-0.5, 0], end: [1000, 0] },
              ],
              rooms: [
                { name: "End", walls: [{ ref: "end" }] },
                { name: "Start", walls: [{ ref: "start" }] },
              ],
            },
          ],
        },
      ],
    });
    expect(plan.fences).toEqual([]);
    expect(plan.getWallsOnLevel(0)).toEqual([]);
    expect(plan.getRoomsOnLevel(0)).toEqual([]);
    expect(plan.loadWarnings).toHaveLength(5);
    expect(plan.loadWarnings[0]).toContain("fences[0]: /end/0 must be integer");
    expect(plan.loadWarnings[1]).toContain("walls[0]: /end/0 must be integer");
    expect(plan.loadWarnings[2]).toContain("walls[1]: /start/0 must be integer");
    expect(plan.loadWarnings[3]).toContain("references unknown wall 'end'");
    expect(plan.loadWarnings[4]).toContain("references unknown wall 'start'");
    expect(plan.loadWarnings.every((warning) => !warning.includes("unexamined"))).toBe(true);
  });

  it("ignores positions that cannot round-trip accurately through metres", () => {
    const plan = Plan.fromJson({
      fences: [{ id: "f", start: [Number.MAX_SAFE_INTEGER, 0], end: [0, 0] }],
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
                  end: [3000, 0],
                  openings: [{ id: "opening", width: 800, distanceAlongWall: Number.MAX_SAFE_INTEGER }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(plan.fences).toEqual([]);
    expect(plan.getWallsOnLevel(0)[0].openings).toEqual([]);
    expect(plan.loadWarnings).toHaveLength(2);
    expect(plan.loadWarnings.every((warning) => warning.includes("cannot be accurately represented"))).toBe(true);
  });

  it("ignores a room whose wall reference is missing, while retaining valid rooms", () => {
    const plan = Plan.fromJson({
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 0,
              name: "Ground",
              walls: [{ id: "wall", start: [0, 0], end: [1000, 0] }],
              rooms: [
                { name: "Invalid", walls: [{}] },
                { name: "Valid", walls: [{ ref: "wall" }] },
                { name: "Empty", walls: [] },
              ],
            },
          ],
        },
      ],
    });
    const level = plan.buildings[0].levels[0];
    expect(level.rooms.map((room) => room.name)).toEqual(["Valid", "Empty"]);
    expect(level.rooms[0].walls).toEqual([level.walls[0]]);
    expect(plan.loadWarnings).toHaveLength(1);
    expect(plan.loadWarnings[0]).toContain("rooms[0]: missing required property 'ref'");
  });

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

  it("rejects malformed types and invalid dimensions without aborting siblings", () => {
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
    expect(plan.fences.map((fence) => fence.id)).toEqual(["extra", "good"]);
    const openings = plan.buildings[0].levels[0].walls[0].openings;
    expect(openings.map((opening) => opening.id)).toEqual(["good"]);
    expect(openings[0].contents.map((item) => item.type)).toEqual(["SlidingDoor"]);
    expect(plan.loadWarnings).toHaveLength(8);
    expect(plan.loadWarnings.some((warning) => warning.includes("too small to save"))).toBe(true);
    expect(plan.loadWarnings.some((warning) => warning.includes("unexpected property 'color'"))).toBe(true);
  });

  it("warns about unexpected properties at every level without dropping valid objects", () => {
    const document = {
      extraRoot: true,
      anotherRoot: "unused",
      fences: [{ id: "f", start: [0, 0], end: [1000, 0], color: "red" }],
      buildings: [{
        name: "House",
        extraBuilding: true,
        levels: [{
          number: 0,
          name: "Ground",
          extraLevel: true,
          walls: [{
            id: "wall",
            start: [0, 0],
            end: [3000, 0],
            extraWall: true,
            openings: [{
              id: "opening",
              width: 900,
              distanceAlongWall: 1000,
              extraOpening: true,
              contents: [
                { type: "StandardDoor", hingeSide: "left", swingDirection: "in", extraDoor: true },
                { type: "SlidingDoor", extraSlidingDoor: true },
                { type: "StandardWindow", extraWindow: true },
              ],
            }],
          }],
          rooms: [{ name: "Room", extraRoom: true, walls: [{ ref: "wall", extraRef: true }] }],
        }],
      }],
    };
    const original = structuredClone(document);
    const plan = Plan.fromJson(document);
    const level = plan.buildings[0].levels[0];
    expect(document).toEqual(original);
    expect(plan.fences).toHaveLength(1);
    expect(level.rooms[0].walls).toEqual([level.walls[0]]);
    expect(level.walls[0].openings[0].contents.map((item) => item.type))
      .toEqual(["StandardDoor", "SlidingDoor", "StandardWindow"]);
    for (const property of [
      "extraRoot", "anotherRoot", "color", "extraBuilding", "extraLevel", "extraWall", "extraOpening",
      "extraDoor", "extraSlidingDoor", "extraWindow", "extraRoom", "extraRef",
    ]) {
      expect(plan.loadWarnings.filter((warning) => warning.includes(`unexpected property '${property}'`))).toHaveLength(1);
    }
    expect(plan.loadWarnings).toHaveLength(12);
    expect(plan.loadWarnings.find((warning) => warning.includes("extraRef"))).toContain("rooms[0]/walls/0");
    expect(plan.loadWarnings.every((warning) => warning.endsWith("property ignored."))).toBe(true);
    const saved = plan.toJson();
    expectValidPlan(saved);
    expect(Plan.fromJson(saved).loadWarnings).toEqual([]);
  });

  it("still ignores invalid objects with unexpected properties without inspecting their children", () => {
    const plan = Plan.fromJson({
      buildings: [
        { name: "Invalid", extra: true },
        { name: "House", levels: [{
          number: 0, name: "Ground",
          walls: [{ id: "invalid", extra: true, openings: [{ unexpectedChild: true }] }],
        }] },
      ],
    });
    expect(plan.buildings).toHaveLength(1);
    expect(plan.buildings[0].levels[0].walls).toEqual([]);
    expect(plan.loadWarnings).toHaveLength(2);
    expect(plan.loadWarnings[0]).toContain("missing required property 'levels'");
    expect(plan.loadWarnings[1]).toContain("missing required property 'start'");
    expect(plan.loadWarnings.every((warning) => !warning.includes("unexpectedChild"))).toBe(true);
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
