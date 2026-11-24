import { Distance, isValidPositiveDistance, isValidPositionInMillimetres } from "./geom/Distance";
import { Point2D } from "./geom/Point2D";
import { mergeRoomWalls } from "./geom/mergeRoomWalls";
import { Fence } from "./Fence";
import type { JsonPosition, JsonRoomLabel } from "./json/Document";
import type { Level } from "./Level";
import { Opening, SlidingDoor, StandardDoor, StandardWindow, type OpeningItem } from "./Opening";
import type { Plan } from "./Plan";
import type { Room } from "./Room";
import { Wall } from "./Wall";

type WallUpdate = { width?: number; start?: JsonPosition; end?: JsonPosition; virtual?: boolean; attic?: boolean };
type RoomUpdate = { name?: string; label?: { [K in keyof JsonRoomLabel]?: JsonRoomLabel[K] | null } };
type OpeningUpdate = {
  shape?: NonNullable<Opening["shape"]>;
  width?: number;
  distanceAlongWall?: number;
  height?: number | null;
  distanceFromFloor?: number | null;
};
type DoorUpdate = {
  hingeSide?: StandardDoor["hingeSide"];
  swingDirection?: StandardDoor["swingDirection"];
  thickness?: number;
  openAngle?: number;
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
  ): EditResult<"width" | "height"> {
    if (!this.plan.fences.includes(fence)) return { ok: false, error: "This fence is no longer in the plan." };
    for (const [field, label, value] of [
      ["width", "Fence width", update.width],
      ["height", "Fence height", update.height],
    ] as const) {
      if (value !== undefined && value !== null) {
        const error = positiveDistanceError(value, label);
        if (error) return { ok: false, field, error };
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

  private mergedRoomWalls(rooms: readonly Room[]) {
    if (rooms.length < 2 || new Set(rooms).size !== rooms.length) return;
    const level = this.levels.find((candidate) => rooms.every((room) => candidate.rooms.includes(room)));
    if (!level || rooms.some((room) => room.walls.some((wall) => !level.walls.includes(wall)))) return;
    return mergeRoomWalls(rooms);
  }

  canMergeRooms(rooms: readonly Room[]) {
    return this.mergedRoomWalls(rooms) !== undefined;
  }

  mergeRooms(rooms: readonly Room[], retainedRoom: Room): EditResult {
    if (!rooms.includes(retainedRoom)) return { ok: false, error: "Select the room to keep." };
    const walls = this.mergedRoomWalls(rooms);
    if (!walls) return { ok: false, error: "These rooms cannot be merged." };
    const level = this.levels.find((candidate) => candidate.rooms.includes(retainedRoom))!;
    retainedRoom.walls = walls;
    level.rooms = level.rooms.filter((room) => {
      if (room === retainedRoom || !rooms.includes(room)) return true;
      room.level = undefined;
      return false;
    });
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

  updateWall(wall: Wall, update: WallUpdate): EditResult<"width"> {
    const belongsToPlan = this.levels.some((level) => level.walls.includes(wall));
    if (!belongsToPlan) return { ok: false, error: "This wall is no longer in the plan." };

    if (update.width !== undefined) {
      const error = positiveDistanceError(update.width, "Wall width");
      if (error) return { ok: false, field: "width", error };
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
    if (update.virtual !== undefined && update.virtual !== wall.virtual) {
      wall.virtual = update.virtual;
      changed = true;
    }
    if (update.attic !== undefined && update.attic !== wall.attic) {
      wall.attic = update.attic;
      changed = true;
    }

    if (changed) this.onChange();
    return { ok: true };
  }

  updateRoom(room: Room, update: RoomUpdate): EditResult {
    if (!this.levels.some((level) => level.rooms.includes(room))) {
      return { ok: false, error: "This room is no longer in the plan." };
    }
    const label = update.label;
    if (label?.position && !label.position.every(isValidPositionInMillimetres)) {
      return { ok: false, error: "Label position must be accurately representable integer millimetres." };
    }
    if (label?.fontSize !== undefined && label.fontSize !== null) {
      if (!Number.isSafeInteger(label.fontSize)) {
        return { ok: false, error: "Label font size must be an integer number of millimetres." };
      }
      const error = positiveDistanceError(label.fontSize, "Label font size");
      if (error) return { ok: false, error };
    }
    if (label?.rotation !== undefined && label.rotation !== null && !Number.isFinite(label.rotation)) {
      return { ok: false, error: "Label rotation must be finite." };
    }
    let changed = false;
    if (update.name !== undefined && update.name !== room.name) {
      room.name = update.name;
      changed = true;
    }
    if (label) {
      const next = { ...room.label };
      for (const key of ["text", "position", "rotation", "fontSize"] as const) {
        const value = label[key];
        if (value === undefined) continue;
        if (key === "position") {
          if (value === null) delete next.position;
          else if (Array.isArray(value)) next.position = [...value];
        } else if (key === "text") {
          if (value === null) delete next.text;
          else if (typeof value === "string") next.text = value;
        } else if (key === "rotation" || key === "fontSize") {
          if (value === null) delete next[key];
          else if (typeof value === "number") next[key] = value;
        }
      }
      const newLabel = Object.keys(next).length ? next : undefined;
      if (JSON.stringify(newLabel) !== JSON.stringify(room.label)) {
        room.label = newLabel;
        changed = true;
      }
    }
    if (changed) this.onChange();
    return { ok: true };
  }

  updateOpening(
    opening: Opening,
    update: OpeningUpdate,
  ): EditResult<"shape" | "width" | "height" | "distanceAlongWall" | "distanceFromFloor"> {
    if (!this.ownsOpening(opening)) return { ok: false, error: "This opening is no longer in the plan." };

    if (update.shape !== undefined && update.shape !== "rectangle" && update.shape !== "halfCircleArch") {
      return { ok: false, field: "shape", error: "Select a valid opening shape." };
    }
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
    if (update.shape !== undefined) {
      const shape = update.shape === "rectangle" ? undefined : update.shape;
      if (shape !== opening.shape) {
        opening.shape = shape;
        changed = true;
      }
    }
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

  updateDoor(door: StandardDoor, update: DoorUpdate): EditResult<"hingeSide" | "swingDirection" | "thickness" | "openAngle"> {
    if (!this.ownsOpeningItem(door)) return { ok: false, error: "This door is no longer in the plan." };

    if (update.openAngle !== undefined && (!Number.isFinite(update.openAngle) || update.openAngle < 0 || update.openAngle > 180)) {
      return { ok: false, field: "openAngle", error: "Enter an angle between 0 and 180 degrees." };
    }
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
    if (update.openAngle !== undefined && update.openAngle !== door.openAngle) {
      door.openAngle = update.openAngle;
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
