import type { Building } from "./Building";
import { Distance } from "./geom/Distance";
import type { JsonLevel } from "./json/Document";
import { Room } from "./Room";
import { Wall } from "./Wall";

export class Level {
  public walls: Wall[];
  public rooms: Room[];
  public building?: Building;

  constructor(
    public number: number,
    public name: string,
    public ceilingHeight?: Distance,
    public totalHeight?: Distance,
  ) {
    this.walls = [];
    this.rooms = [];
  }

  static fromJson(json: JsonLevel): Level {
    const level = new Level(
      json.number,
      json.name,
      json.ceilingHeight === undefined ? undefined : Distance.fromJson(json.ceilingHeight),
      json.totalHeight === undefined ? undefined : Distance.fromJson(json.totalHeight),
    );
    level.walls = (json.walls ?? []).map(Wall.fromJson);
    level.rooms = (json.rooms ?? []).map(Room.fromJson);
    level.walls.forEach((wall) => (wall.level = level));
    const wallsById = new Map(level.walls.map((wall) => [wall.id, wall]));
    level.rooms.forEach((room) => {
      room.level = level;
      room.walls = room.wallRefs.flatMap(({ ref }) => {
        if (!ref) return [];
        const id = ref;
        const wall = wallsById.get(id);
        if (!wall) throw new Error(`Room '${room.name}' references unknown wall '${id}'`);
        return [wall];
      });
    });
    return level;
  }

  toJson(): JsonLevel {
    return {
      number: this.number,
      name: this.name,
      ...(this.ceilingHeight ? { ceilingHeight: this.ceilingHeight.toJson() } : {}),
      ...(this.totalHeight ? { totalHeight: this.totalHeight.toJson() } : {}),
      ...(this.walls.length > 0 ? { walls: this.walls.map((wall) => wall.toJson()) } : {}),
      ...(this.rooms.length > 0 ? { rooms: this.rooms.map((room) => room.toJson()) } : {}),
    };
  }
}
