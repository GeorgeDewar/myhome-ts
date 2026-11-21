import { Distance, isValidPositiveDistance, isValidPositionInMillimetres } from "./geom/Distance";
import type { Opening, OpeningItem, SlidingDoor, StandardDoor } from "./Opening";
import type { Plan } from "./Plan";
import type { Room } from "./Room";
import type { Wall } from "./Wall";

type WallUpdate = { width?: number };
type RoomUpdate = { name?: string; walls?: readonly Wall[] };
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

  contains(item: Room | Wall | Opening | OpeningItem) {
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

  updateOpening(opening: Opening, update: OpeningUpdate): EditResult<"width" | "distanceAlongWall"> {
    if (!this.ownsOpening(opening)) return { ok: false, error: "This opening is no longer in the plan." };

    if (update.width !== undefined) {
      const error = positiveDistanceError(update.width, "Opening width");
      if (error) return { ok: false, field: "width", error };
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
