import { Distance, isValidPositiveDistance, isValidPositionInMillimetres } from "./geom/Distance";
import { Point2D } from "./geom/Point2D";
import { roomPolygon } from "./geom/roomPolygon";
import { Fence } from "./Fence";
import type { JsonPosition } from "./json/Document";
import type { Level } from "./Level";
import { Opening, SlidingDoor, StandardDoor, StandardWindow, type OpeningItem } from "./Opening";
import type { Plan } from "./Plan";
import { Room } from "./Room";
import { Wall } from "./Wall";

type WallUpdate = { width?: number; start?: JsonPosition; end?: JsonPosition };
type RoomUpdate = { name?: string; walls?: readonly Wall[] };
type OpeningUpdate = {
  width?: number;
  distanceAlongWall?: number;
  height?: number | null;
  distanceFromFloor?: number | null;
};
type DoorUpdate = {
  hingeSide?: StandardDoor["hingeSide"];
  swingDirection?: StandardDoor["swingDirection"];
  thickness?: number;
};
type SlidingDoorUpdate = { thickness?: number };
type EditResult<Field extends string = never> = { ok: true } | { ok: false; error: string; field?: Field };
type AddResult<T> = { ok: true; item: T } | { ok: false; error: string };

const positiveDistanceError = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) return `${label} must be a positive, finite number of millimetres.`;
  if (!isValidPositiveDistance(value)) return `${label} is too small to save.`;
};

const lineError = (start: JsonPosition, end: JsonPosition) => {
  if (![...start, ...end].every(isValidPositionInMillimetres)) {
    return "Positions must be accurately representable integer millimetres.";
  }
  const length = Math.hypot((end[0] - start[0]) / 1000, (end[1] - start[1]) / 1000);
  if (!Number.isFinite(length) || length === 0) return "Start and end must define a finite, non-zero line.";
};

const nextId = (prefix: string, ids: readonly string[]) => {
  let number = 1;
  while (ids.includes(`${prefix}${number}`)) number++;
  return `${prefix}${number}`;
};

export class PlanEditor {
  constructor(
    private plan: Plan,
    private onChange: () => void,
  ) {}

  private get levels() {
    return this.plan.buildings.flatMap((building) => building.levels);
  }

  private ownsOpening(opening: Opening) {
    return this.levels.some((level) => level.walls.some((wall) => wall.openings.includes(opening)));
  }

  private ownsOpeningItem(item: OpeningItem) {
    return this.levels.some((level) =>
      level.walls.some((wall) => wall.openings.some((opening) => opening.contents.includes(item))),
    );
  }

  contains(item: Room | Wall | Opening | OpeningItem | Fence) {
    if (this.plan.fences.some((fence) => fence === item)) return true;
    return this.levels.some(
      (level) =>
        level.rooms.some((room) => room === item) ||
        level.walls.some(
          (wall) =>
            wall === item ||
            wall.openings.some((opening) => opening === item || opening.contents.some((content) => content === item)),
        ),
    );
  }

  addWall(level: Level, start: JsonPosition, end: JsonPosition): AddResult<Wall> {
    if (!this.levels.includes(level)) return { ok: false, error: "This level is no longer in the plan." };
    const error = lineError(start, end);
    if (error) return { ok: false, error };
    const wall = new Wall(
      nextId(
        "wall",
        level.walls.map((item) => item.id),
      ),
      Point2D.fromJson(start),
      Point2D.fromJson(end),
    );
    wall.level = level;
    level.walls.push(wall);
    this.onChange();
    return { ok: true, item: wall };
  }

  addFence(start: JsonPosition, end: JsonPosition): AddResult<Fence> {
    const error = lineError(start, end);
    if (error) return { ok: false, error };
    const fence = new Fence(
      nextId(
        "fence",
        this.plan.fences.map((item) => item.id),
      ),
      Point2D.fromJson(start),
      Point2D.fromJson(end),
    );
    this.plan.fences.push(fence);
    this.onChange();
    return { ok: true, item: fence };
  }

  addRoom(level: Level, name: string, walls: readonly Wall[]): AddResult<Room> {
    if (!this.levels.includes(level)) return { ok: false, error: "This level is no longer in the plan." };
    if (!name.trim()) return { ok: false, error: "Enter a room name." };
    if (walls.length < 3) return { ok: false, error: "Select at least three walls in order." };
    if (walls.some((wall) => !level.walls.includes(wall))) {
      return { ok: false, error: "Room walls must belong to the same level as the room." };
    }
    if (new Set(walls).size !== walls.length) return { ok: false, error: "Select each wall only once." };
    const room = new Room(name, [...walls]);
    const corners = roomPolygon(room);
    const area = corners.reduce((sum, point, index) => {
      const next = corners[(index + 1) % corners.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    if (corners.length !== walls.length || !Number.isFinite(area) || area === 0) {
      return { ok: false, error: "Select walls in boundary order so they form a room." };
    }
    room.level = level;
    level.rooms.push(room);
    this.onChange();
    return { ok: true, item: room };
  }

  addOpening(
    wall: Wall,
    width: number,
    distanceAlongWall: number,
    height?: number,
    distanceFromFloor?: number,
  ): AddResult<Opening> {
    if (!this.levels.some((level) => level.walls.includes(wall))) {
      return { ok: false, error: "This wall is no longer in the plan." };
    }
    const error =
      positiveDistanceError(width, "Opening width") ??
      (height === undefined ? undefined : positiveDistanceError(height, "Opening height"));
    if (error) return { ok: false, error };
    if (
      !isValidPositionInMillimetres(distanceAlongWall) ||
      (distanceFromFloor !== undefined && !isValidPositionInMillimetres(distanceFromFloor))
    ) {
      return { ok: false, error: "Positions must be accurately representable integer millimetres." };
    }
    const opening = new Opening(
      nextId(
        "opening",
        wall.openings.map((item) => item.id),
      ),
      Distance.fromJson(width),
      Distance.fromJson(distanceAlongWall),
      height === undefined ? undefined : Distance.fromJson(height),
      distanceFromFloor === undefined ? undefined : Distance.fromJson(distanceFromFloor),
    );
    opening.wall = wall;
    wall.openings.push(opening);
    this.onChange();
    return { ok: true, item: opening };
  }

  addOpeningItem(opening: Opening, type: OpeningItem["type"]): AddResult<OpeningItem> {
    if (!this.ownsOpening(opening)) return { ok: false, error: "This opening is no longer in the plan." };
    let item: OpeningItem;
    switch (type) {
      case "StandardDoor":
        item = new StandardDoor("left", "in");
        break;
      case "SlidingDoor":
        item = new SlidingDoor();
        break;
      case "StandardWindow":
        item = new StandardWindow();
        break;
      default:
        return { ok: false, error: "Select a valid opening item type." };
    }
    opening.contents.push(item);
    this.onChange();
    return { ok: true, item };
  }

  deleteFence(fence: Fence): EditResult {
    if (!this.plan.fences.includes(fence)) return { ok: false, error: "This fence is no longer in the plan." };
    this.plan.fences = this.plan.fences.filter((candidate) => candidate !== fence);
    this.onChange();
    return { ok: true };
  }

  updateFence(
    fence: Fence,
    update: { width?: number; height?: number | null; start?: JsonPosition; end?: JsonPosition },
  ): EditResult {
    if (!this.plan.fences.includes(fence)) return { ok: false, error: "This fence is no longer in the plan." };
    for (const [label, value] of [
      ["Fence width", update.width],
      ["Fence height", update.height],
    ] as const) {
      if (value !== undefined && value !== null) {
        const error = positiveDistanceError(value, label);
        if (error) return { ok: false, error };
      }
    }
    if (update.start !== undefined || update.end !== undefined) {
      const error = lineError(update.start ?? fence.from.toJson(), update.end ?? fence.to.toJson());
      if (error) return { ok: false, error };
    }
    let changed = false;
    if (update.width !== undefined && fence.explicitWidth?.metres !== update.width / 1000) {
      fence.explicitWidth = Distance.fromJson(update.width);
      changed = true;
    }
    if (
      update.height !== undefined &&
      fence.height?.metres !== (update.height === null ? undefined : update.height / 1000)
    ) {
      fence.height = update.height === null ? undefined : Distance.fromJson(update.height);
      changed = true;
    }
    if (update.start !== undefined && !fence.from.equals(Point2D.fromJson(update.start))) {
      fence.from = Point2D.fromJson(update.start);
      changed = true;
    }
    if (update.end !== undefined && !fence.to.equals(Point2D.fromJson(update.end))) {
      fence.to = Point2D.fromJson(update.end);
      changed = true;
    }
    if (changed) this.onChange();
    return { ok: true };
  }

  deleteWall(wall: Wall): EditResult {
    const level = this.levels.find((candidate) => candidate.walls.includes(wall));
    if (!level) return { ok: false, error: "This wall is no longer in the plan." };

    level.walls = level.walls.filter((candidate) => candidate !== wall);
    wall.level = undefined;
    level.rooms = level.rooms.filter((room) => {
      if (!room.walls.includes(wall)) return true;
      room.level = undefined;
      return false;
    });
    this.onChange();
    return { ok: true };
  }

  deleteRoom(room: Room): EditResult {
    const level = this.levels.find((candidate) => candidate.rooms.includes(room));
    if (!level) return { ok: false, error: "This room is no longer in the plan." };

    level.rooms = level.rooms.filter((candidate) => candidate !== room);
    room.level = undefined;
    this.onChange();
    return { ok: true };
  }

  deleteOpening(opening: Opening): EditResult {
    const wall = this.levels.flatMap((level) => level.walls).find((candidate) => candidate.openings.includes(opening));
    if (!wall) return { ok: false, error: "This opening is no longer in the plan." };

    wall.openings = wall.openings.filter((candidate) => candidate !== opening);
    opening.wall = undefined;
    this.onChange();
    return { ok: true };
  }

  deleteOpeningItem(item: OpeningItem): EditResult {
    const opening = this.levels
      .flatMap((level) => level.walls)
      .flatMap((wall) => wall.openings)
      .find((candidate) => candidate.contents.includes(item));
    if (!opening) return { ok: false, error: "This opening item is no longer in the plan." };

    opening.contents = opening.contents.filter((candidate) => candidate !== item);
    this.onChange();
    return { ok: true };
  }

  updateWall(wall: Wall, update: WallUpdate): EditResult {
    const belongsToPlan = this.levels.some((level) => level.walls.includes(wall));
    if (!belongsToPlan) return { ok: false, error: "This wall is no longer in the plan." };

    if (update.width !== undefined) {
      const error = positiveDistanceError(update.width, "Wall width");
      if (error) return { ok: false, error };
    }
    if (update.start !== undefined || update.end !== undefined) {
      const error = lineError(update.start ?? wall.from.toJson(), update.end ?? wall.to.toJson());
      if (error) return { ok: false, error };
    }
    let changed = false;
    if (update.width !== undefined && wall.explicitWidth?.metres !== update.width / 1000) {
      wall.explicitWidth = Distance.fromJson(update.width);
      changed = true;
    }
    if (update.start !== undefined && !wall.from.equals(Point2D.fromJson(update.start))) {
      wall.from = Point2D.fromJson(update.start);
      changed = true;
    }
    if (update.end !== undefined && !wall.to.equals(Point2D.fromJson(update.end))) {
      wall.to = Point2D.fromJson(update.end);
      changed = true;
    }

    if (changed) this.onChange();
    return { ok: true };
  }

  updateRoom(room: Room, update: RoomUpdate): EditResult {
    const level = this.levels.find((candidate) => candidate.rooms.includes(room));
    if (!level) {
      return { ok: false, error: "This room is no longer in the plan." };
    }
    if (update.walls?.some((wall) => !level.walls.includes(wall))) {
      return { ok: false, error: "Room walls must belong to the same level as the room." };
    }

    let changed = false;
    if (update.name !== undefined && update.name !== room.name) {
      room.name = update.name;
      changed = true;
    }
    if (
      update.walls !== undefined &&
      (update.walls.length !== room.walls.length || update.walls.some((wall, index) => wall !== room.walls[index]))
    ) {
      room.walls = [...update.walls];
      changed = true;
    }
    if (changed) this.onChange();
    return { ok: true };
  }

  updateOpening(
    opening: Opening,
    update: OpeningUpdate,
  ): EditResult<"width" | "height" | "distanceAlongWall" | "distanceFromFloor"> {
    if (!this.ownsOpening(opening)) return { ok: false, error: "This opening is no longer in the plan." };

    if (update.width !== undefined) {
      const error = positiveDistanceError(update.width, "Opening width");
      if (error) return { ok: false, field: "width", error };
    }
    if (update.height !== undefined && update.height !== null) {
      const error = positiveDistanceError(update.height, "Opening height");
      if (error) return { ok: false, field: "height", error };
    }
    if (update.distanceAlongWall !== undefined && !Number.isFinite(update.distanceAlongWall)) {
      return { ok: false, field: "distanceAlongWall", error: "Enter a finite number of millimetres." };
    }
    if (update.distanceAlongWall !== undefined && !isValidPositionInMillimetres(update.distanceAlongWall)) {
      return {
        ok: false,
        field: "distanceAlongWall",
        error: "Position must be an accurately representable integer number of millimetres.",
      };
    }
    if (
      update.distanceFromFloor !== undefined &&
      update.distanceFromFloor !== null &&
      !isValidPositionInMillimetres(update.distanceFromFloor)
    ) {
      return {
        ok: false,
        field: "distanceFromFloor",
        error: "Position must be an accurately representable integer number of millimetres.",
      };
    }

    let changed = false;
    if (update.width !== undefined && opening.width.metres !== update.width / 1000) {
      opening.width = Distance.fromJson(update.width);
      changed = true;
    }
    if (
      update.distanceAlongWall !== undefined &&
      opening.distanceAlongWall.metres !== update.distanceAlongWall / 1000
    ) {
      opening.distanceAlongWall = Distance.fromJson(update.distanceAlongWall);
      changed = true;
    }
    if (
      update.height !== undefined &&
      opening.height?.metres !== (update.height === null ? undefined : update.height / 1000)
    ) {
      opening.height = update.height === null ? undefined : Distance.fromJson(update.height);
      changed = true;
    }
    if (
      update.distanceFromFloor !== undefined &&
      opening.distanceFromFloor?.metres !==
        (update.distanceFromFloor === null ? undefined : update.distanceFromFloor / 1000)
    ) {
      opening.distanceFromFloor =
        update.distanceFromFloor === null ? undefined : Distance.fromJson(update.distanceFromFloor);
      changed = true;
    }
    if (changed) this.onChange();
    return { ok: true };
  }

  updateDoor(door: StandardDoor, update: DoorUpdate): EditResult<"hingeSide" | "swingDirection" | "thickness"> {
    if (!this.ownsOpeningItem(door)) return { ok: false, error: "This door is no longer in the plan." };

    if (update.hingeSide !== undefined && update.hingeSide !== "left" && update.hingeSide !== "right") {
      return { ok: false, field: "hingeSide", error: "Select a valid hinge side." };
    }
    if (update.swingDirection !== undefined && update.swingDirection !== "in" && update.swingDirection !== "out") {
      return { ok: false, field: "swingDirection", error: "Select a valid swing direction." };
    }
    if (update.thickness !== undefined) {
      const error = positiveDistanceError(update.thickness, "Door leaf thickness");
      if (error) return { ok: false, field: "thickness", error };
    }

    let changed = false;
    if (update.hingeSide !== undefined && update.hingeSide !== door.hingeSide) {
      door.hingeSide = update.hingeSide;
      changed = true;
    }
    if (update.swingDirection !== undefined && update.swingDirection !== door.swingDirection) {
      door.swingDirection = update.swingDirection;
      changed = true;
    }
    if (update.thickness !== undefined && door.thickness?.metres !== update.thickness / 1000) {
      door.thickness = Distance.fromJson(update.thickness);
      changed = true;
    }
    if (changed) this.onChange();
    return { ok: true };
  }

  updateSlidingDoor(door: SlidingDoor, update: SlidingDoorUpdate): EditResult<"thickness"> {
    if (!this.ownsOpeningItem(door)) return { ok: false, error: "This sliding door is no longer in the plan." };

    if (update.thickness !== undefined) {
      const error = positiveDistanceError(update.thickness, "Door leaf thickness");
      if (error) return { ok: false, field: "thickness", error };
    }
    if (update.thickness !== undefined && door.thickness?.metres !== update.thickness / 1000) {
      door.thickness = Distance.fromJson(update.thickness);
      this.onChange();
    }
    return { ok: true };
  }
}
