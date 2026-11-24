import type { JsonRoom, JsonRoomLabel } from "./json/Document";
import type { Level } from "./Level";
import type { Wall } from "./Wall";

export class Room {
  public level?: Level;
  constructor(
    public name: string,
    public walls: readonly Wall[],
    public label?: JsonRoomLabel,
  ) {}

  static fromJson(json: JsonRoom, wallsById: ReadonlyMap<string, Wall>): Room {
    if (json.walls === undefined) throw new Error(`Room '${json.name}' requires a walls array`);
    const walls = json.walls.map(({ ref }) => {
      if (typeof ref !== "string") throw new Error(`Room '${json.name}' requires a ref for each wall`);
      const wall = wallsById.get(ref);
      if (!wall) throw new Error(`Room '${json.name}' references unknown wall '${ref}'`);
      return wall;
    });
    const label = json.label;
    return new Room(json.name, walls, label === undefined ? undefined : {
      ...(label.text !== undefined ? { text: label.text } : {}),
      ...(label.position !== undefined ? { position: [...label.position] } : {}),
      ...(label.rotation !== undefined ? { rotation: label.rotation } : {}),
      ...(label.fontSize !== undefined ? { fontSize: label.fontSize } : {}),
    });
  }

  toJson(): JsonRoom {
    return {
      name: this.name,
      walls: this.walls.map((wall) => ({ ref: wall.id })),
      ...(this.label !== undefined ? { label: {
        ...this.label,
        ...(this.label.position !== undefined ? { position: [...this.label.position] as [number, number] } : {}),
      } } : {}),
    };
  }
}
