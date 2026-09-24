import { Building } from "./Building";
import type { JsonPlan } from "./json/Document";

export class Plan {
  public buildings: Building[];

  constructor(public schema?: string) {
    this.buildings = [];
  }

  static fromJson(json: JsonPlan): Plan {
    const plan = new Plan(json.$schema);
    plan.buildings = json.buildings.map(Building.fromJson);
    plan.buildings.forEach((building) => (building.plan = plan));
    return plan;
  }

  toJson(): JsonPlan {
    return {
      ...(this.schema ? { $schema: this.schema } : {}),
      buildings: this.buildings.map((building) => building.toJson()),
    };
  }

  getWallsOnLevel(level: number) {
    return this.buildings.flatMap((building) => building.levels.find((l) => l.number === level)?.walls ?? []);
  }

  getRoomsOnLevel(level: number) {
    return this.buildings.flatMap(
      (building) => building.levels.find((candidate) => candidate.number === level)?.rooms ?? [],
    );
  }
}
