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
    return new Room(json.name, json.walls ?? []);
  }

  toJson(): JsonRoom {
    return { name: this.name, ...(this.wallRefs.length > 0 ? { walls: this.wallRefs } : {}) };
  }
}
