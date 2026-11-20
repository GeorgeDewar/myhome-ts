import type { JsonRoom, JsonWallRef } from "./json/Document";
import type { Level } from "./Level";
import type { Wall } from "./Wall";

export class Room {
  public level?: Level;
  public walls: Wall[];

  constructor(
    public name: string,
    public wallRefs: JsonWallRef[],
  ) {
    this.walls = [];
  }

  static fromJson(json: JsonRoom): Room {
    if (json.walls === undefined) throw new Error(`Room '${json.name}' requires a walls array`);
    return new Room(json.name, json.walls);
  }

  toJson(): JsonRoom {
    return { name: this.name, walls: this.wallRefs };
  }
}
