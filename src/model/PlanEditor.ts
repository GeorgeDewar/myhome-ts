import { Distance, isValidPositiveDistance } from "./geom/Distance";
import type { Opening, OpeningItem, SlidingDoor, StandardDoor } from "./Opening";
import type { Plan } from "./Plan";
import type { Room } from "./Room";
import type { Wall } from "./Wall";

type WallUpdate = { width?: number };
type RoomUpdate = { name?: string };
type OpeningUpdate = { width?: number; distanceAlongWall?: number };
type DoorUpdate = {
  hingeSide?: StandardDoor["hingeSide"];
  swingDirection?: StandardDoor["swingDirection"];
  thickness?: number;
};
type SlidingDoorUpdate = { thickness?: number };
type EditResult<Field extends string = never> = { ok: true } | { ok: false; error: string; field?: Field };

const positiveDistanceError = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) return `${label} must be a positive, finite number of millimetres.`;
  if (!isValidPositiveDistance(value)) return `${label} is too small to save.`;
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

  updateWall(wall: Wall, update: WallUpdate): EditResult {
    const belongsToPlan = this.levels.some((level) => level.walls.includes(wall));
    if (!belongsToPlan) return { ok: false, error: "This wall is no longer in the plan." };

    let changed = false;
    if (update.width !== undefined) {
      const width = update.width / 1000;
      const error = positiveDistanceError(update.width, "Wall width");
      if (error) return { ok: false, error };
      const distance = new Distance(width);

      if (wall.explicitWidth?.metres !== width) {
        wall.explicitWidth = distance;
        changed = true;
      }
    }

    if (changed) this.onChange();
    return { ok: true };
  }

  updateRoom(room: Room, update: RoomUpdate): EditResult {
    if (!this.levels.some((level) => level.rooms.includes(room))) {
      return { ok: false, error: "This room is no longer in the plan." };
    }

    if (update.name !== undefined && update.name !== room.name) {
      room.name = update.name;
      this.onChange();
    }
    return { ok: true };
  }

  updateOpening(opening: Opening, update: OpeningUpdate): EditResult<"width" | "distanceAlongWall"> {
    if (!this.ownsOpening(opening)) return { ok: false, error: "This opening is no longer in the plan." };

    if (update.width !== undefined) {
      const error = positiveDistanceError(update.width, "Opening width");
      if (error) return { ok: false, field: "width", error };
    }
    if (update.distanceAlongWall !== undefined && !Number.isFinite(update.distanceAlongWall)) {
      return { ok: false, field: "distanceAlongWall", error: "Enter a finite number of millimetres." };
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
