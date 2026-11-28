import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Plan } from "../model/Plan";
import { createPlanGeometry, disposePlanGeometry, highlightSelection, levelElevations } from "./planGeometry";

const meshesFor = (group: THREE.Group, item: object) => {
  const meshes: THREE.Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.item === item) meshes.push(object);
  });
  return meshes;
};

describe("3D plan geometry", () => {
  it("positions opening items from the top left and gives posts wall depth", () => {
    const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{ number: 0, name: "Ground", walls: [{
      id: "wall", start: [0, 0], end: [4000, 0], width: 100, openings: [{
        id: "opening", width: 2000, height: 2000, distanceAlongWall: 2000,
        contents: [{ type: "Post", x: 500, y: 250, width: 200, height: 1000 }],
      }],
    }] }] }] });
    const post = plan.buildings[0].levels[0].walls[0].openings[0].contents[0];
    const group = createPlanGeometry(plan);
    group.updateMatrixWorld(true);
    const mesh = meshesFor(group, post)[0];
    const bounds = new THREE.Box3().setFromObject(mesh);
    expect(bounds.min.x).toBeCloseTo(1.5);
    expect(bounds.max.x).toBeCloseTo(1.7);
    expect(bounds.min.y).toBeCloseTo(0.75);
    expect(bounds.max.y).toBeCloseTo(1.75);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.1);
    disposePlanGeometry(group);
  });

  it("stacks every level using total heights and anchors level zero at ground", () => {
    const plan = Plan.fromJson({
      buildings: [
        {
          name: "House",
          levels: [
            { number: 1, name: "Upper", walls: [{ id: "upper", start: [0, 0], end: [1000, 0] }] },
            {
              number: -1,
              name: "Basement",
              totalHeight: 3000,
              walls: [{ id: "basement", start: [0, 0], end: [1000, 0] }],
            },
            {
              number: 0,
              name: "Ground",
              totalHeight: 3200,
              defaults: { ceiling: { height: 2500 } },
              walls: [{ id: "ground", start: [0, 0], end: [1000, 0] }],
            },
          ],
        },
      ],
    });
    const [upper, basement, ground] = plan.buildings[0].levels;
    const elevations = levelElevations(plan.buildings[0].levels);
    expect([elevations.get(basement), elevations.get(ground), elevations.get(upper)]).toEqual([-3, 0, 3.2]);
    const group = createPlanGeometry(plan);
    group.updateMatrixWorld(true);
    for (const [level, min, max] of [
      [basement, -3, 0],
      [ground, 0, 2.5],
      [upper, 3.2, 5.6],
    ] as const) {
      const bounds = new THREE.Box3().setFromObject(meshesFor(group, level.walls[0])[0]);
      expect(bounds.min.y).toBeCloseTo(min);
      expect(bounds.max.y).toBeCloseTo(max);
    }
    disposePlanGeometry(group);
  });

  it("cuts overlapping openings out of walls and draws their contents", () => {
    const plan = Plan.fromJson({
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 0,
              name: "Ground",
              defaults: { ceiling: { height: 3000 } },
              walls: [
                {
                  id: "wall",
                  start: [0, 0],
                  end: [4000, 0],
                  width: 100,
                  openings: [
                    {
                      id: "opening",
                      width: 1000,
                      distanceAlongWall: 2000,
                      height: 1000,
                      distanceFromFloor: 1000,
                      contents: [
                        { type: "StandardDoor", hingeSide: "left", swingDirection: "in" },
                        { type: "SlidingDoor" },
                        { type: "Window", windowType: "awning" },
                      ],
                    },
                    { id: "overlap", width: 1000, distanceAlongWall: 2000, height: 1000, distanceFromFloor: 1000 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const wall = plan.buildings[0].levels[0].walls[0];
    const [door, slidingDoor, window] = wall.openings[0].contents;
    const group = createPlanGeometry(plan);
    const volume = meshesFor(group, wall).reduce((sum, mesh) => {
      const { width, height, depth } = (mesh.geometry as THREE.BoxGeometry).parameters;
      return sum + width * height * depth;
    }, 0);
    expect(volume).toBeCloseTo(1.1);
    expect(meshesFor(group, door)).toHaveLength(1);
    expect(meshesFor(group, slidingDoor)).toHaveLength(2);
    expect(meshesFor(group, window)).toHaveLength(5);
    disposePlanGeometry(group);
  });

  it("draws sash widths and depth in 3D, clipping to the wall and omitting a direct window's sash", () => {
    const plan = Plan.fromJson({ buildings: [{ name: "House", levels: [{ number: 0, name: "Ground", walls: [{
      id: "wall", start: [0, 0], end: [2000, 0], width: 100, openings: [{
        id: "opening", width: 1000, height: 1000, distanceAlongWall: 250,
        contents: [
          { type: "Window", windowType: "fixed", width: 1000, height: 1000,
            sash: { widthTop: 50, widthRight: 60, widthBottom: 70, widthLeft: 80, depth: 90 } },
          { type: "Window", windowType: "direct", width: 1000, height: 1000 },
          { type: "Window", windowType: "awning", width: 1000, height: 1000, sash: { depth: 5 } },
        ],
      }],
    }] }] }] });
    const [window, direct, shallowSash] = plan.buildings[0].levels[0].walls[0].openings[0].contents;
    const group = createPlanGeometry(plan);
    group.updateMatrixWorld(true);
    const frames = meshesFor(group, window).slice(1);
    expect(frames).toHaveLength(3);
    const bounds = frames.map((mesh) => new THREE.Box3().setFromObject(mesh));
    expect(bounds[0].min.x).toBeCloseTo(0);
    expect(bounds[0].max.x).toBeCloseTo(0.75);
    expect(bounds[0].min.y).toBeCloseTo(0.95);
    expect(bounds[1].max.y).toBeCloseTo(0.07);
    expect(bounds[2].min.x).toBeCloseTo(0.69);
    expect(bounds[2].max.z - bounds[2].min.z).toBeCloseTo(0.09);
    expect(meshesFor(group, direct)).toHaveLength(1);
    const shallowMeshes = meshesFor(group, shallowSash);
    const glass = new THREE.Box3().setFromObject(shallowMeshes[0]);
    const frame = new THREE.Box3().setFromObject(shallowMeshes[1]);
    expect(glass.max.z).toBeLessThan(frame.max.z);
    disposePlanGeometry(group);
  });

  it.each([
    ["left", "in", 0], ["left", "in", 45], ["left", "in", 90], ["left", "in", 180],
    ["left", "out", 45], ["right", "in", 45], ["right", "out", 45],
  ] as const)("positions a %s-hinged %s door at %s degrees", (hingeSide, swingDirection, openAngle) => {
    const plan = Plan.fromJson({
      buildings: [{
        name: "House", levels: [{
          number: 0, name: "Ground", walls: [{
            id: "wall", start: [0, 0], end: [4000, 0],
            openings: [{
              id: "opening", width: 1000, distanceAlongWall: 2000,
              contents: [{ type: "StandardDoor", hingeSide, swingDirection, ...(openAngle === 90 ? {} : { openAngle }) }],
            }],
          }],
        }],
      }],
    });
    const group = createPlanGeometry(plan);
    group.updateMatrixWorld(true);
    const door = plan.buildings[0].levels[0].walls[0].openings[0].contents[0];
    const mesh = meshesFor(group, door)[0];
    const start = mesh.localToWorld(new THREE.Vector3(-0.5, 0, 0.0175));
    const end = mesh.localToWorld(new THREE.Vector3(0.5, 0, 0.0175));
    const hingeX = hingeSide === "left" ? 1.5 : 2.5;
    const hingeZ = swingDirection === "out" ? -0.05 : 0.05;
    const sweep = (hingeSide === "left") === (swingDirection === "out") ? -openAngle : openAngle;
    const direction = hingeSide === "left" ? 1 : -1;
    expect(start.x).toBeCloseTo(hingeX);
    expect(start.z).toBeCloseTo(hingeZ);
    expect(end.x).toBeCloseTo(hingeX + direction * Math.cos(sweep * Math.PI / 180));
    expect(end.z).toBeCloseTo(hingeZ + direction * Math.sin(sweep * Math.PI / 180));
    disposePlanGeometry(group);
  });

  it("orients the open door with a rotated wall", () => {
    const plan = Plan.fromJson({
      buildings: [{
        name: "House", levels: [{
          number: 0, name: "Ground", walls: [{
            id: "wall", start: [1000, 2000], end: [1000, 6000],
            openings: [{
              id: "opening", width: 1000, distanceAlongWall: 2000,
              contents: [{ type: "StandardDoor", hingeSide: "left", swingDirection: "in" }],
            }],
          }],
        }],
      }],
    });
    const group = createPlanGeometry(plan);
    group.updateMatrixWorld(true);
    const door = plan.buildings[0].levels[0].walls[0].openings[0].contents[0];
    const mesh = meshesFor(group, door)[0];
    const hinge = mesh.localToWorld(new THREE.Vector3(-0.5, 0, 0.0175));
    const end = mesh.localToWorld(new THREE.Vector3(0.5, 0, 0.0175));
    expect(hinge.x).toBeCloseTo(0.95);
    expect(hinge.z).toBeCloseTo(3.5);
    expect(end.x).toBeCloseTo(-0.05);
    expect(end.z).toBeCloseTo(3.5);
    disposePlanGeometry(group);
  });

  it("renders fences and room floors while omitting virtual and attic walls", () => {
    const plan = Plan.fromJson({
      fences: [{ id: "f", start: [0, 0], end: [2000, 0], height: 1500 }],
      buildings: [
        {
          name: "House",
          levels: [
            {
              number: 1,
              name: "Ground",
              walls: [
                { id: "a", start: [0, 0], end: [2000, 0] },
                { id: "b", start: [2000, 0], end: [2000, 2000] },
                { id: "c", start: [2000, 2000], end: [0, 2000] },
                { id: "d", start: [0, 2000], end: [0, 0], virtual: true },
                { id: "attic", start: [0, 3000], end: [2000, 3000], attic: true, openings: [
                  { id: "opening", width: 1000, distanceAlongWall: 1000, contents: [{ type: "Window", windowType: "awning" }] },
                ] },
              ],
              rooms: [{ name: "Room", walls: [{ ref: "a" }, { ref: "b" }, { ref: "c" }, { ref: "d" }] }],
            },
          ],
        },
      ],
    });
    const level = plan.buildings[0].levels[0];
    const group = createPlanGeometry(plan);
    group.updateMatrixWorld(true);
    expect(meshesFor(group, level.rooms[0])).toHaveLength(1);
    expect(meshesFor(group, level.walls[3])).toHaveLength(0);
    expect(meshesFor(group, level.walls[4])).toHaveLength(0);
    expect(meshesFor(group, level.walls[4].openings[0])).toHaveLength(0);
    expect(meshesFor(group, level.walls[4].openings[0].contents[0])).toHaveLength(0);
    const fence = meshesFor(group, plan.fences[0])[0];
    expect(new THREE.Box3().setFromObject(fence).max.y).toBeCloseTo(1.5);
    expect(levelElevations([level]).get(level)).toBe(0);
    disposePlanGeometry(group);
  });

  it("supports picking and highlighting an empty opening without rebuilding geometry", () => {
    const plan = Plan.fromJson({
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
                  end: [4000, 0],
                  openings: [
                    { id: "opening", width: 1000, distanceAlongWall: 2000, height: 1000, distanceFromFloor: 1000 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const opening = plan.buildings[0].levels[0].walls[0].openings[0];
    const group = createPlanGeometry(plan);
    group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(2, 1.5, 5), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(group, true)[0];
    expect(hit.object.userData.target).toEqual({ kind: "opening", item: opening });
    const mesh = hit.object;
    if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshBasicMaterial))
      throw new Error("Unexpected mesh");
    const geometry = mesh.geometry;
    expect(mesh.material.opacity).toBe(0);
    highlightSelection(group, { targets: [{ kind: "opening", item: opening }], activeIndex: 0 });
    expect(mesh.material.opacity).toBe(0.3);
    expect(mesh.geometry).toBe(geometry);
    highlightSelection(group, { targets: [], activeIndex: -1 });
    expect(mesh.material.opacity).toBe(0);
    disposePlanGeometry(group);
  });

  it("highlights every selected room in 3D", () => {
    const plan = Plan.fromJson({
      buildings: [{
        name: "House",
        levels: [{
          number: 0,
          name: "Ground",
          walls: [
            { id: "a", start: [0, 0], end: [1000, 0] },
            { id: "b", start: [1000, 0], end: [1000, 1000] },
            { id: "c", start: [1000, 1000], end: [0, 1000] },
            { id: "d", start: [0, 1000], end: [0, 0] },
          ],
          rooms: [
            { name: "First", walls: [{ ref: "a" }, { ref: "b" }, { ref: "c" }, { ref: "d" }] },
            { name: "Second", walls: [{ ref: "a" }, { ref: "b" }, { ref: "c" }, { ref: "d" }] },
          ],
        }],
      }],
    });
    const [first, second] = plan.buildings[0].levels[0].rooms;
    const group = createPlanGeometry(plan);
    highlightSelection(group, {
      targets: [{ kind: "room", item: second }],
      activeIndex: 0,
      rooms: [first, second],
    });
    const firstMaterial = meshesFor(group, first)[0].material;
    const secondMaterial = meshesFor(group, second)[0].material;
    if (!(firstMaterial instanceof THREE.MeshStandardMaterial) || !(secondMaterial instanceof THREE.MeshStandardMaterial))
      throw new Error("Unexpected room material");
    expect(firstMaterial.emissive.getHex()).toBe(0x155177);
    expect(secondMaterial.emissive.getHex()).toBe(0x8b1111);
    disposePlanGeometry(group);
  });
});
