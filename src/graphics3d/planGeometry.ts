import * as THREE from "three";
import { roomPolygon } from "../model/geom/roomPolygon";
import type { Level } from "../model/Level";
import type { Opening } from "../model/Opening";
import type { Plan } from "../model/Plan";
import type { Wall } from "../model/Wall";

const DEFAULT_LEVEL_HEIGHT = 2.4;
const DEFAULT_FENCE_HEIGHT = 1.8;
const DEFAULT_OPENING_HEIGHT = 2.1;

const box = (
  parent: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  item: object,
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color }));
  mesh.position.set(...position);
  mesh.userData.item = item;
  parent.add(mesh);
};

const lineGroup = (
  from: { x: { metres: number }; y: { metres: number } },
  to: { x: { metres: number }; y: { metres: number } },
  elevation: number,
) => {
  const group = new THREE.Group();
  group.position.set(from.x.metres, elevation, from.y.metres);
  group.rotation.y = -Math.atan2(to.y.metres - from.y.metres, to.x.metres - from.x.metres);
  return group;
};

type Cutout = { opening: Opening; left: number; right: number; bottom: number; top: number };

const wallGroup = (wall: Wall, height: number, elevation: number) => {
  const group = lineGroup(wall.from, wall.to, elevation);
  const length = Math.hypot(wall.to.x.metres - wall.from.x.metres, wall.to.y.metres - wall.from.y.metres);
  const openings: Cutout[] = [];
  for (const opening of wall.openings) {
    const bottom = Math.max(0, opening.distanceFromFloor?.metres ?? 0);
    const top = Math.min(
      height,
      (opening.distanceFromFloor?.metres ?? 0) + (opening.height?.metres ?? DEFAULT_OPENING_HEIGHT),
    );
    const left = Math.max(0, opening.distanceAlongWall.metres - opening.width.metres / 2);
    const right = Math.min(length, opening.distanceAlongWall.metres + opening.width.metres / 2);
    if (left < right && bottom < top) openings.push({ opening, left, right, bottom, top });
  }

  const cuts = [...new Set([0, length, ...openings.flatMap(({ left, right }) => [left, right])])].sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const left = cuts[i];
    const right = cuts[i + 1];
    const intervals = openings
      .filter((opening) => opening.left < right && opening.right > left)
      .map(({ bottom, top }) => ({ bottom, top }))
      .sort((a, b) => a.bottom - b.bottom);
    let bottom = 0;
    for (const interval of intervals) {
      if (interval.bottom > bottom) {
        box(
          group,
          [right - left, interval.bottom - bottom, wall.width.metres],
          [(left + right) / 2, (bottom + interval.bottom) / 2, 0],
          0xe6d994,
          wall,
        );
      }
      bottom = Math.max(bottom, interval.top);
    }
    if (bottom < height) {
      box(
        group,
        [right - left, height - bottom, wall.width.metres],
        [(left + right) / 2, (bottom + height) / 2, 0],
        0xe6d994,
        wall,
      );
    }
  }

  for (const { opening, left, right, bottom, top } of openings) {
    for (const item of opening.contents) {
      const width = right - left;
      const itemHeight = top - bottom;
      if (item.type === "SlidingDoor") {
        const leafWidth = width * 0.55;
        box(
          group,
          [leafWidth, itemHeight, item.leafThickness.metres],
          [left + leafWidth / 2, (bottom + top) / 2, -item.leafThickness.metres / 2],
          0xa57952,
          item,
        );
        box(
          group,
          [leafWidth, itemHeight, item.leafThickness.metres],
          [right - leafWidth / 2, (bottom + top) / 2, item.leafThickness.metres / 2],
          0xa57952,
          item,
        );
      } else {
        const thickness = item.type === "StandardDoor" ? item.leafThickness.metres : 0.02;
        box(
          group,
          [width, itemHeight, thickness],
          [(left + right) / 2, (bottom + top) / 2, 0],
          item.type === "StandardDoor" ? 0xa57952 : 0x9ac4d5,
          item,
        );
      }
    }
  }
  return group;
};

export const levelElevations = (levels: readonly Level[]) => {
  const sorted = [...levels].sort((a, b) => a.number - b.number);
  const positions = new Map<Level, number>();
  let elevation = 0;
  for (const level of sorted) {
    positions.set(level, elevation);
    elevation += level.totalHeight?.metres ?? level.ceilingHeight?.metres ?? DEFAULT_LEVEL_HEIGHT;
  }
  const ground = sorted.find((level) => level.number === 0) ?? sorted[0];
  const groundElevation = ground ? positions.get(ground)! : 0;
  for (const level of sorted) positions.set(level, positions.get(level)! - groundElevation);
  return positions;
};

export const createPlanGeometry = (plan: Plan) => {
  const group = new THREE.Group();
  for (const building of plan.buildings) {
    const elevations = levelElevations(building.levels);
    for (const level of building.levels) {
      const elevation = elevations.get(level)!;
      const height = level.ceilingHeight?.metres ?? level.totalHeight?.metres ?? DEFAULT_LEVEL_HEIGHT;
      for (const wall of level.walls) {
        if (!wall.virtual) group.add(wallGroup(wall, height, elevation));
      }
      for (const room of level.rooms) {
        const corners = roomPolygon(room);
        if (corners.length < 3 || corners.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) continue;
        const shape = new THREE.Shape();
        shape.moveTo(corners[0].x, corners[0].y);
        corners.slice(1).forEach(({ x, y }) => shape.lineTo(x, y));
        shape.closePath();
        const floor = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({ color: 0xdfe7ed, side: THREE.DoubleSide }),
        );
        floor.rotation.x = Math.PI / 2;
        floor.position.y = elevation + 0.001;
        floor.userData.item = room;
        group.add(floor);
      }
    }
  }
  for (const fence of plan.fences) {
    const fenceGroup = lineGroup(fence.from, fence.to, 0);
    const length = Math.hypot(fence.to.x.metres - fence.from.x.metres, fence.to.y.metres - fence.from.y.metres);
    const height = fence.height?.metres ?? DEFAULT_FENCE_HEIGHT;
    box(fenceGroup, [length, height, fence.width.metres], [length / 2, height / 2, 0], 0x8b5a2b, fence);
    group.add(fenceGroup);
  }
  return group;
};

export const disposePlanGeometry = (group: THREE.Group) => {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material.dispose();
  });
};
