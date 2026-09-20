import { Building } from "./Building";
import type { JsonPlan } from "./json/Document";

export class Plan {
  public buildings: Building[];

  constructor() {
    this.buildings = [];
  }

  static fromJson(json: JsonPlan): Plan {
    const plan = new Plan();
    plan.buildings = json.buildings.map(Building.fromJson, plan);
    return plan;
  }

  getWallsOnLevel(level: number) {
    return this.buildings.flatMap(
      (building) =>
        building.levels.find((l) => l.number === level)?.walls ?? [],
    );
  }
}
