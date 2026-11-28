import { describe, expect, it } from "vitest";
import { resolveDefault, resolveTrimColour } from "./defaults";
import type { JsonPlan } from "./json/Document";
import { Plan } from "./Plan";

const colours = [
  { id: "white", name: "White", value: "FFFFFF" },
  { id: "green", name: "Green", value: "00AA00" },
  { id: "brown", name: "Brown", value: "8B5A2B" },
  { id: "blue", name: "Blue", value: "0000AA" },
];

// A clockwise 4m square room: face A of every wall is inside the room, and face B is outside.
const squareWalls = [
  { id: "north", start: [0, 0], end: [4000, 0] },
  { id: "east", start: [4000, 0], end: [4000, 4000] },
  { id: "south", start: [4000, 4000], end: [0, 4000] },
  { id: "west", start: [0, 4000], end: [0, 0] },
];

const buildPlan = (overrides: Partial<JsonPlan> = {}) =>
  ({
    colours,
    defaults: {
      interiorWall: { colour: "white" },
      exteriorWall: { colour: "brown" },
      ceiling: { colour: "white", height: 2400 },
      wall: { width: 90 },
      interiorTrim: { colour: "white" },
      exteriorTrim: { colour: "green", sillColour: "brown" },
      exteriorDoor: { colour: "green", thickness: 45 },
      interiorDoor: { colour: "white", thickness: 35 },
      window: { sash: { depth: 40, colour: "white" } },
    },
    buildings: [
      {
        name: "House",
        defaults: { roof: { colour: "brown" }, interiorWall: { colour: "green" } },
        levels: [
          {
            number: 0,
            name: "Ground",
            walls: structuredClone(squareWalls),
            rooms: [{ name: "Room", walls: squareWalls.map(({ id }) => ({ ref: id })) }],
          },
        ],
      },
    ],
    ...overrides,
  }) as JsonPlan;

describe("defaults resolution", () => {
  it("takes each property from the nearest scope that sets it", () => {
    const scopes = [
      { ceiling: { colour: "green" } },
      { ceiling: { colour: "white", height: 2700 } },
      { ceiling: { height: 2400 } },
    ];
    expect(resolveDefault(scopes, "ceiling", "colour")).toBe("green");
    expect(resolveDefault(scopes, "ceiling", "height")).toBe(2700);
    expect(resolveDefault(scopes, "roof", "colour")).toBeUndefined();
  });

  it("lets a sill follow the trim colour of the nearest scope that sets either", () => {
    const outer = { exteriorTrim: { colour: "white", sillColour: "brown" } };
    expect(resolveTrimColour([{ exteriorTrim: { colour: "green" } }, outer], "exteriorTrim", "sillColour")).toBe(
      "green",
    );
    expect(resolveTrimColour([{ exteriorTrim: { sillColour: "blue" } }, outer], "exteriorTrim", "sillColour")).toBe(
      "blue",
    );
    expect(resolveTrimColour([{}, outer], "exteriorTrim", "sillColour")).toBe("brown");
    expect(resolveTrimColour([{}, outer], "exteriorTrim", "colour")).toBe("white");
  });

  it("applies plan, building and level defaults to a level, and room defaults only inside the room", () => {
    const document = buildPlan();
    document.buildings![0].levels[0].defaults = { ceiling: { height: 2700 } };
    document.buildings![0].levels[0].rooms![0].defaults = { interiorWall: { colour: "blue" }, ceiling: { colour: "green" } };
    const plan = Plan.fromJson(document);
    const level = plan.buildings[0].levels[0];
    const room = level.rooms[0];

    expect(level.ceilingHeight?.metres).toBe(2.7);
    expect(resolveDefault(level.defaultsScopes(), "roof", "colour")).toBe("brown");
    expect(resolveDefault(level.defaultsScopes(), "interiorWall", "colour")).toBe("green");
    expect(resolveDefault(room.defaultsScopes(), "interiorWall", "colour")).toBe("blue");
    expect(resolveDefault(room.defaultsScopes(), "ceiling", "colour")).toBe("green");
    expect(resolveDefault(plan.defaultsScopes(), "interiorWall", "colour")).toBe("white");
  });

  it("uses the wall width default unless the wall has its own width", () => {
    const document = buildPlan();
    document.buildings![0].levels[0].walls![1].width = 200;
    const walls = Plan.fromJson(document).buildings[0].levels[0].walls;
    expect(walls[0].width.metres).toBe(0.09);
    expect(walls[1].width.metres).toBe(0.2);
  });
});

describe("wall faces", () => {
  it("treats a face as exterior when no room lies against it", () => {
    const wall = Plan.fromJson(buildPlan()).buildings[0].levels[0].walls[0];
    expect(wall.roomAgainst("A")?.name).toBe("Room");
    expect(wall.isFaceExterior("A")).toBe(false);
    expect(wall.isFaceExterior("B")).toBe(true);
    expect(wall.isExterior()).toBe(true);
  });

  it("resolves face colours from the room, then the level, building and plan", () => {
    const document = buildPlan();
    document.buildings![0].levels[0].rooms![0].defaults = { interiorWall: { colour: "blue" } };
    document.buildings![0].levels[0].walls![0] = { ...squareWalls[0], faceB: { colour: "white" } } as never;
    const walls = Plan.fromJson(document).buildings[0].levels[0].walls;

    expect(walls[0].faceColour("A")).toBe("blue");
    expect(walls[0].faceColour("B")).toBe("white");
    expect(walls[1].faceColour("B")).toBe("brown");
  });

  it("lets a face override whether it is exterior", () => {
    const document = buildPlan();
    document.buildings![0].levels[0].walls![0] = { ...squareWalls[0], faceA: { exterior: true } } as never;
    const wall = Plan.fromJson(document).buildings[0].levels[0].walls[0];
    expect(wall.isFaceExterior("A")).toBe(true);
    expect(wall.faceColour("A")).toBe("brown");
  });

  it("does not apply room defaults to the outside of the room's walls", () => {
    const document = buildPlan();
    document.buildings![0].levels[0].rooms![0].defaults = { interiorWall: { colour: "blue" } };
    const wall = Plan.fromJson(document).buildings[0].levels[0].walls[2];
    expect(wall.faceColour("B")).toBe("brown");
  });
});

describe("openings", () => {
  const withOpening = (wallIndex: number, opening: object) => {
    const document = buildPlan();
    document.buildings![0].levels[0].walls![wallIndex] = {
      ...squareWalls[wallIndex],
      openings: [{ id: "opening", width: 900, distanceAlongWall: 2000, ...opening }],
    } as never;
    return Plan.fromJson(document).buildings[0].levels[0].walls[wallIndex].openings[0];
  };

  it("resolves trim for each face, with a sill that follows the trim colour", () => {
    const opening = withOpening(0, { faceA: { trim: { colour: "blue" } } });
    expect(opening.trimColour("A", "colour")).toBe("blue");
    expect(opening.trimColour("A", "sillColour")).toBe("blue");
    expect(opening.trimColour("B", "colour")).toBe("green");
    expect(opening.trimColour("B", "sillColour")).toBe("brown");
  });

  it("uses exterior door defaults for a door in an exterior wall, and interior ones otherwise", () => {
    const door = { type: "StandardDoor", hingeSide: "left", swingDirection: "in" };
    const opening = withOpening(0, { contents: [door, { ...door, colour: "blue", thickness: 50 }] });
    const [defaultDoor, customDoor] = opening.contents;
    if (defaultDoor.type !== "StandardDoor" || customDoor.type !== "StandardDoor") throw new Error("Expected doors");

    expect(opening.doorColour(defaultDoor)).toBe("green");
    expect(opening.doorThickness(defaultDoor).metres).toBe(0.045);
    expect(opening.doorColour(customDoor)).toBe("blue");
    expect(opening.doorThickness(customDoor).metres).toBe(0.05);
  });

  it("uses interior door defaults when neither side of the wall is exterior", () => {
    const door = { type: "SlidingDoor" };
    const opening = withOpening(0, { contents: [door] });
    const wall = opening.wall!;
    wall.faceB = { exterior: false };
    const sliding = opening.contents[0];
    if (sliding.type !== "SlidingDoor") throw new Error("Expected a sliding door");

    expect(wall.isExterior()).toBe(false);
    expect(opening.doorColour(sliding)).toBe("white");
    expect(opening.doorThickness(sliding).metres).toBe(0.035);
  });

  it("resolves the sash colour from the window, then defaults, independently of dimensions", () => {
    const opening = withOpening(0, { contents: [
      { type: "Window", windowType: "awning", sash: { widthTop: 60 } },
      { type: "Window", windowType: "awning", sash: { colour: "blue" } },
    ] });
    const [plain, blue] = opening.contents;
    if (plain.type !== "Window" || blue.type !== "Window") throw new Error("Expected windows");
    const level = opening.wall!.level!;
    expect(opening.sashColour(plain)).toBe("white");
    level.defaults = { window: { sash: { colour: "green", depth: 50 } } };
    expect(opening.sashColour(plain)).toBe("green");
    expect(opening.sashColour(blue)).toBe("blue");
    expect(opening.sashDimension(blue, "depth")).toBe(50);
    expect(opening.colourValue("green")).toBe("00AA00");
    expect(opening.colourValue("unknown")).toBeUndefined();
  });

  it("resolves sash dimensions from the window item, then defaults, then 35mm", () => {
    const opening = withOpening(0, { contents: [{ type: "Window", windowType: "awning", sash: { widthTop: 60 } }] });
    const window = opening.contents[0];
    if (window.type !== "Window") throw new Error("Expected a window");
    expect(opening.sashDimension(window, "widthTop")).toBe(60);
    expect(opening.sashDimension(window, "depth")).toBe(40);
    expect(opening.sashDimension(window, "widthLeft")).toBe(35);
  });
});

describe("round-tripping and validation", () => {
  it("round-trips defaults at every level, wall and opening faces, and door colours", () => {
    const document = buildPlan();
    const level = document.buildings![0].levels[0];
    level.defaults = { ceiling: { height: 2700, colour: "white" }, roof: { colour: "green" } };
    level.rooms![0].defaults = { interiorWall: { colour: "blue" }, ceiling: { colour: "green" }, interiorTrim: { sillColour: "brown" } };
    level.walls![0] = {
      ...squareWalls[0],
      faceA: { exterior: false, colour: "blue" },
      openings: [
        {
          id: "opening",
          width: 900,
          distanceAlongWall: 2000,
          faceA: { trim: { colour: "white", sillColour: "green" } },
          contents: [
            { type: "SlidingDoor", colour: "blue", thickness: 40 },
            { type: "Window", windowType: "fixed", sash: { colour: "green", depth: 40 } },
          ],
        },
      ],
    } as never;

    const plan = Plan.fromJson(document);
    expect(plan.loadWarnings).toEqual([]);
    expect(plan.toJson()).toEqual(document);
  });

  it("ignores references to colours that are not defined, keeping the rest", () => {
    const document = buildPlan();
    document.defaults = { interiorWall: { colour: "missing" }, ceiling: { colour: "white" } };
    document.buildings![0].levels[0].walls![0] = { ...squareWalls[0], faceA: { colour: "nope" } } as never;
    const plan = Plan.fromJson(document);

    expect(plan.defaults).toEqual({ ceiling: { colour: "white" } });
    expect(plan.buildings[0].levels[0].walls[0].faceA).toEqual({});
    expect(plan.loadWarnings).toHaveLength(2);
    expect(plan.loadWarnings).toEqual(
      expect.arrayContaining([
        "defaults.interiorWall.colour: unknown colour 'missing'; ignored.",
        "buildings[0].levels[0].walls[0].faceA.colour: unknown colour 'nope'; ignored.",
      ]),
    );
  });

  it("drops invalid defaults without discarding the parent", () => {
    const document = buildPlan();
    document.buildings![0].levels[0].defaults = { wall: { width: 0 } };
    document.buildings![0].levels[0].rooms![0].defaults = { roof: { colour: "white" } } as never;
    const plan = Plan.fromJson(document);
    const level = plan.buildings[0].levels[0];

    expect(level.defaults).toBeUndefined();
    expect(level.rooms[0].defaults).toBeUndefined();
    expect(level.rooms).toHaveLength(1);
    expect(plan.loadWarnings).toHaveLength(2);
  });
});
