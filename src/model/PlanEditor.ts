import { Distance, isValidPositiveDistance, isValidPositionInMillimetres } from "./geom/Distance";
import { Point2D } from "./geom/Point2D";
import { mergeRoomWalls } from "./geom/mergeRoomWalls";
import { Fence } from "./Fence";
import type { JsonColour, JsonGeoreference, JsonPosition, JsonRoomLabel } from "./json/Document";
import type { Level } from "./Level";
import { DEFAULT_OPENING_HEIGHT_METRES, Opening, Post, SlidingDoor, StandardDoor, Window, sashFields, type OpeningItem, type SashField } from "./Opening";
import { placeOpeningOnWall } from "./geom/openingPlacement";
import { defaultItemRectangle, itemGeometry, itemRectangle, openingSize, type ItemGeometry, type ItemRectangle } from "./geom/openingArrangement";
import type { Plan } from "./Plan";
import type { Room } from "./Room";
import { Wall } from "./Wall";
import { isWindowType, windowTypes } from "./windowTypes";

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
type WindowUpdate = { windowType?: Window["windowType"]; sash?: Partial<Record<SashField, number | null>> };
type EditResult<Field extends string = never> = { ok: true } | { ok: false; error: string; field?: Field };
type AddResult<T> = { ok: true; item: T } | { ok: false; error: string };

const positiveDistanceError = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) return `${label} must be a positive, finite number of millimetres.`;
  if (!isValidPositiveDistance(value)) return `${label} is too small to save.`;
};

const openingItemGeometryError = (opening: Opening, geometry: ItemGeometry): EditResult<keyof ItemRectangle> => {
  const effective = { ...defaultItemRectangle(opening) };
  for (const field of ["x", "y"] as const) {
    const value = geometry[field];
    if (value === undefined) continue;
    if (!isValidPositionInMillimetres(value) || value < 0) {
      return { ok: false, field, error: "Enter a non-negative integer number of millimetres." };
    }
    effective[field] = value;
  }
  for (const field of ["width", "height"] as const) {
    const value = geometry[field];
    if (value === undefined) continue;
    const error = positiveDistanceError(value, `Item ${field}`);
    if (error) return { ok: false, field, error };
    effective[field] = value;
  }
  const size = openingSize(opening);
  if (effective.x + effective.width > size.width || effective.y + effective.height > size.height) {
    return { ok: false, error: "The item must fit within the opening." };
  }
  return { ok: true };
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

  saveColour(colour: JsonColour, existing?: JsonColour): EditResult<"name" | "id" | "value"> {
    if (existing && !this.plan.colours.includes(existing)) return { ok: false, error: "This colour is no longer in the plan." };
    if (!colour.name.trim()) return { ok: false, field: "name", error: "Enter a colour name." };
    if (!colour.id.trim()) return { ok: false, field: "id", error: "Enter a colour ID." };
    if (!/^[0-9a-fA-F]{6}$/.test(colour.value)) {
      return { ok: false, field: "value", error: "Enter 6 hex digits (e.g. 2E5E4E)." };
    }
    if (this.plan.colours.some((item) => item !== existing && item.id === colour.id)) {
      return { ok: false, field: "id", error: "A colour with this ID already exists." };
    }
    if (existing) {
      if (existing.id === colour.id && existing.name === colour.name && existing.value === colour.value &&
        existing.description === colour.description) return { ok: true };
      Object.assign(existing, { id: colour.id, name: colour.name, value: colour.value });
      if (colour.description === undefined) delete existing.description;
      else existing.description = colour.description;
    } else {
      this.plan.colours.push({ ...colour });
    }
    this.onChange();
    return { ok: true };
  }

  deleteColour(colour: JsonColour): EditResult {
    if (!this.plan.colours.includes(colour)) return { ok: false, error: "This colour is no longer in the plan." };
    this.plan.colours = this.plan.colours.filter((item) => item !== colour);
    this.onChange();
    return { ok: true };
  }

  updateGeoreference(reference: JsonGeoreference): EditResult {
    if (!Number.isFinite(reference.latitude) || Math.abs(reference.latitude) > 85.05112878 ||
      !Number.isFinite(reference.longitude) || Math.abs(reference.longitude) > 180 ||
      !Number.isFinite(reference.bearing) || reference.bearing < 0 || reference.bearing >= 360) {
      return { ok: false, error: "Enter a valid latitude, longitude and bearing." };
    }
    if (JSON.stringify(this.plan.georeference) !== JSON.stringify(reference)) {
      this.plan.georeference = { ...reference };
      this.onChange();
    }
    return { ok: true };
  }

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

  // Height and distance from floor are left unset so that their defaults apply.
  addOpeningAt(wall: Wall, distanceAlongWall: number): AddResult<Opening> {
    const placement = placeOpeningOnWall(wall, distanceAlongWall);
    if (!placement) return { ok: false, error: "There is no room for an opening there." };
    return this.addOpening(wall, placement.width, placement.distanceAlongWall);
  }

  addOpeningItem(opening: Opening, type: OpeningItem["type"], geometry?: ItemRectangle): AddResult<OpeningItem> {
    if (!this.ownsOpening(opening)) return { ok: false, error: "This opening is no longer in the plan." };
    if (geometry) {
      const result = openingItemGeometryError(opening, geometry);
      if (!result.ok) return result;
    }
    let item: OpeningItem;
    switch (type) {
      case "StandardDoor":
        item = new StandardDoor("left", "in");
        break;
      case "SlidingDoor":
        item = new SlidingDoor();
        break;
      case "Window":
        item = new Window("awning");
        break;
      case "Post":
        item = new Post();
        break;
      default:
        return { ok: false, error: "Select a valid opening item type." };
    }
    if (geometry) {
      const defaults = itemRectangle(opening, item);
      for (const field of ["x", "y", "width", "height"] as const) {
        if (geometry[field] !== defaults[field]) item[field] = Distance.fromJson(geometry[field]);
      }
    } else {
      const rightEdge = opening.contents.reduce((right, existing) => {
        const rectangle = itemRectangle(opening, existing);
        return Math.max(right, rectangle.x + rectangle.width);
      }, 0);
      const x = Math.ceil(rightEdge);
      const openingWidth = openingSize(opening).width;
      const width = openingWidth - x;
      if (x > 0 && isValidPositionInMillimetres(x) && isValidPositiveDistance(width) &&
        x + Distance.fromJson(width).toJson() <= openingWidth) {
        item.x = Distance.fromJson(x);
        item.width = Distance.fromJson(width);
      }
    }
    opening.contents.push(item);
    this.onChange();
    return { ok: true, item };
  }

  // Undefined fields are cleared so that the item fills the opening in that dimension.
  updateOpeningItemGeometry(opening: Opening, item: OpeningItem, geometry: ItemGeometry): EditResult<keyof ItemRectangle> {
    if (!this.ownsOpening(opening) || !opening.contents.includes(item)) {
      return { ok: false, error: "This opening item is no longer in the plan." };
    }
    const result = openingItemGeometryError(opening, geometry);
    if (!result.ok) return result;
    const current = itemGeometry(item);
    let changed = false;
    for (const field of ["x", "y", "width", "height"] as const) {
      const value = geometry[field];
      if (value === current[field]) continue;
      item[field] = value === undefined ? undefined : Distance.fromJson(value);
      changed = true;
    }
    if (changed) this.onChange();
    return { ok: true };
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

  private mergedOpeningBounds(openings: readonly Opening[]) {
    if (openings.length < 2 || new Set(openings).size !== openings.length) return;
    const wall = this.levels.flatMap((level) => level.walls)
      .find((candidate) => openings.every((opening) => candidate.openings.includes(opening) && opening.wall === candidate));
    if (!wall) return;
    const bounds = (opening: Opening) => {
      const centre = opening.distanceAlongWall.toJson();
      const bottom = opening.distanceFromFloor?.toJson() ?? 0;
      return {
        left: centre - opening.width.toJson() / 2,
        right: centre + opening.width.toJson() / 2,
        bottom,
        top: bottom + (opening.height?.toJson() ?? DEFAULT_OPENING_HEIGHT_METRES * 1000),
      };
    };
    const selected = openings.map(bounds);
    const left = Math.min(...selected.map((item) => item.left));
    const right = Math.max(...selected.map((item) => item.right));
    const bottom = Math.min(...selected.map((item) => item.bottom));
    const top = Math.max(...selected.map((item) => item.top));
    const centre = Math.round((left + right) / 2);
    const width = 2 * Math.max(centre - left, right - centre);
    const height = top - bottom;
    if (!isValidPositionInMillimetres(centre) || !isValidPositionInMillimetres(bottom) ||
      !isValidPositiveDistance(width) || !isValidPositiveDistance(height)) return;
    if (wall.openings.some((opening) => {
      if (openings.includes(opening)) return false;
      const other = bounds(opening);
      return other.left < centre + width / 2 && other.right > centre - width / 2 &&
        other.bottom < top && other.top > bottom;
    })) return;
    return { wall, centre, width, bottom, height };
  }

  canMergeOpenings(openings: readonly Opening[]) {
    return this.mergedOpeningBounds(openings) !== undefined;
  }

  mergeOpenings(openings: readonly Opening[], retainedOpening: Opening): EditResult {
    if (!openings.includes(retainedOpening)) return { ok: false, error: "Select the opening to keep." };
    const merged = this.mergedOpeningBounds(openings);
    if (!merged) return { ok: false, error: "These openings cannot be merged." };
    const ordered = [...openings].sort((a, b) => a.distanceAlongWall.metres - b.distanceAlongWall.metres);
    const contents = ordered.flatMap((opening) => opening.contents);
    retainedOpening.distanceAlongWall = Distance.fromJson(merged.centre);
    retainedOpening.width = Distance.fromJson(merged.width);
    retainedOpening.distanceFromFloor = Distance.fromJson(merged.bottom);
    retainedOpening.height = Distance.fromJson(merged.height);
    retainedOpening.shape = undefined;
    retainedOpening.contents = contents;
    merged.wall.openings = merged.wall.openings.filter((opening) => {
      if (opening === retainedOpening || !openings.includes(opening)) return true;
      opening.wall = undefined;
      opening.contents = [];
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
    // Turning a flag off removes it, as false is the default.
    for (const flag of ["virtual", "attic"] as const) {
      const value = update[flag];
      if (value === undefined || (value || undefined) === wall[flag]) continue;
      wall[flag] = value || undefined;
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
      if (!Number.isInteger(label.fontSize)) {
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

    const width = update.width ?? opening.width.toJson();
    const height = update.height === undefined
      ? opening.height?.toJson() ?? DEFAULT_OPENING_HEIGHT_METRES * 1000
      : update.height ?? DEFAULT_OPENING_HEIGHT_METRES * 1000;
    for (const item of opening.contents) {
      if ((item.x?.toJson() ?? 0) + (item.width?.toJson() ?? width) > width ||
          (item.y?.toJson() ?? 0) + (item.height?.toJson() ?? height) > height) {
        return { ok: false, error: "Opening items must fit within the opening." };
      }
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

  updateWindow(window: Window, update: WindowUpdate): EditResult<"windowType" | SashField> {
    if (!this.ownsOpeningItem(window)) return { ok: false, error: "This window is no longer in the plan." };
    if (update.windowType !== undefined && !isWindowType(update.windowType)) {
      return { ok: false, field: "windowType", error: "Select a valid window type." };
    }
    const windowType = update.windowType ?? window.windowType;
    if (!windowTypes[windowType].sashRequired &&
      sashFields.some((field) => update.sash?.[field] != null)) {
      return { ok: false, error: "Direct glazing cannot have a sash." };
    }
    for (const field of sashFields) {
      const value = update.sash?.[field];
      if (value !== undefined && value !== null) {
        const error = positiveDistanceError(value, "Sash dimension");
        if (error) return { ok: false, field, error };
      }
    }
    let changed = false;
    if (update.windowType !== undefined && update.windowType !== window.windowType) {
      window.windowType = update.windowType;
      changed = true;
    }
    if (!windowTypes[windowType].sashRequired && window.sash !== undefined) {
      window.sash = undefined;
      changed = true;
    }
    for (const field of sashFields) {
      const value = update.sash?.[field];
      if (value === undefined) continue;
      if (value === null) {
        if (window.sash?.[field] !== undefined) {
          delete window.sash[field];
          if (Object.keys(window.sash).length === 0) window.sash = undefined;
          changed = true;
        }
      } else if (window.sash?.[field]?.metres !== value / 1000) {
        window.sash ??= {};
        window.sash[field] = Distance.fromJson(value);
        changed = true;
      }
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
