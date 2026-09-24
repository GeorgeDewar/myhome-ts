import type { JsonBuilding } from "./json/Document";
import { Level } from "./Level";
import type { Plan } from "./Plan";

export class Building {
  public levels: Level[];

  constructor(
    public name: string,
    public plan?: Plan,
  ) {
    this.levels = [];
  }

  static fromJson(json: JsonBuilding): Building {
    const building = new Building(json.name);
    building.levels = json.levels.map(Level.fromJson);
    building.levels.forEach((level) => (level.building = building));
    return building;
  }

  toJson(): JsonBuilding {
    return { name: this.name, levels: this.levels.map((level) => level.toJson()) };
  }
}
