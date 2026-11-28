import type { Building } from "./Building";
import { Distance } from "./geom/Distance";
import type { DefaultsScopes } from "./defaults";
import { resolveDefault } from "./defaults";
import type { JsonDefaults, JsonLevel } from "./json/Document";
import { Room } from "./Room";
import { Wall } from "./Wall";

export class Level {
  public walls: Wall[];
  public rooms: Room[];
  public building?: Building;
  public defaults?: JsonDefaults;

  constructor(
    public number: number,
    public name: string,
    public totalHeight?: Distance,
  ) {
    this.walls = [];
    this.rooms = [];
  }

  static fromJson(json: JsonLevel): Level {
    const level = new Level(
      json.number,
      json.name,
      json.totalHeight === undefined ? undefined : Distance.fromJson(json.totalHeight),
    );
    if (json.defaults) level.defaults = structuredClone(json.defaults);
    level.walls = (json.walls ?? []).map(Wall.fromJson);
    level.walls.forEach((wall) => (wall.level = level));
    const wallsById = new Map(level.walls.map((wall) => [wall.id, wall]));
    level.rooms = (json.rooms ?? []).map((room) => Room.fromJson(room, wallsById));
    level.rooms.forEach((room) => {
      room.level = level;
    });
    return level;
  }

  toJson(): JsonLevel {
    return {
      number: this.number,
      name: this.name,
      ...(this.defaults === undefined ? {} : { defaults: structuredClone(this.defaults) }),
      ...(this.totalHeight ? { totalHeight: this.totalHeight.toJson() } : {}),
      ...(this.walls.length > 0 ? { walls: this.walls.map((wall) => wall.toJson()) } : {}),
      ...(this.rooms.length > 0 ? { rooms: this.rooms.map((room) => room.toJson()) } : {}),
    };
  }

  defaultsScopes(): DefaultsScopes {
    return [this.defaults, ...(this.building?.defaultsScopes() ?? [])];
  }

  get ceilingHeight() {
    const height = resolveDefault(this.defaultsScopes(), "ceiling", "height");
    return height === undefined ? undefined : Distance.fromJson(height);
  }
}
