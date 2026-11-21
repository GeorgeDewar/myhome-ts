import type { JsonRoom } from "./json/Document";
import type { Level } from "./Level";
import type { Wall } from "./Wall";

export class Room {
  public level?: Level;
  constructor(
    public name: string,
    public walls: readonly Wall[],
  ) {}

  static fromJson(json: JsonRoom, wallsById: ReadonlyMap<string, Wall>): Room {
    if (json.walls === undefined) throw new Error(`Room '${json.name}' requires a walls array`);
    const walls = json.walls.map(({ ref }) => {
      if (typeof ref !== "string") throw new Error(`Room '${json.name}' requires a ref for each wall`);
      const wall = wallsById.get(ref);
      if (!wall) throw new Error(`Room '${json.name}' references unknown wall '${ref}'`);
      return wall;
    });
    return new Room(json.name, walls);
  }

  toJson(): JsonRoom {
    return { name: this.name, walls: this.walls.map((wall) => ({ ref: wall.id })) };
  }
}
