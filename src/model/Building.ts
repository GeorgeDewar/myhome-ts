import type { DefaultsScopes } from "./defaults";
import type { JsonBuilding, JsonDefaults } from "./json/Document";
import { Level } from "./Level";
import type { Plan } from "./Plan";

export class Building {
  public levels: Level[];
  public defaults?: JsonDefaults;

  constructor(
    public name: string,
    public plan?: Plan,
  ) {
    this.levels = [];
  }

  static fromJson(json: JsonBuilding): Building {
    const building = new Building(json.name);
    if (json.defaults) building.defaults = structuredClone(json.defaults);
    building.levels = json.levels.map(Level.fromJson);
    building.levels.forEach((level) => (level.building = building));
    return building;
  }

  toJson(): JsonBuilding {
    return {
      name: this.name,
      ...(this.defaults === undefined ? {} : { defaults: structuredClone(this.defaults) }),
      levels: this.levels.map((level) => level.toJson()),
    };
  }

  defaultsScopes(): DefaultsScopes {
    return [this.defaults, ...(this.plan?.defaultsScopes() ?? [])];
  }
}
