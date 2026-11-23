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
              ceilingHeight: 2500,
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
              ceilingHeight: 3000,
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
                        { type: "StandardWindow" },
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
    expect(meshesFor(group, window)).toHaveLength(1);
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
                  { id: "opening", width: 1000, distanceAlongWall: 1000, contents: [{ type: "StandardWindow" }] },
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
