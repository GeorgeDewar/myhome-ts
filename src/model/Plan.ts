import { Building } from "./Building";
import { Fence } from "./Fence";
import type { JsonPlan } from "./json/Document";

export class Plan {
  public buildings: Building[];
  public fences: Fence[];

  constructor(public schema?: string) {
    this.buildings = [];
    this.fences = [];
  }

  static fromJson(json: JsonPlan): Plan {
    const plan = new Plan(json.$schema);
    plan.buildings = (json.buildings ?? []).map(Building.fromJson);
    plan.fences = (json.fences ?? []).map(Fence.fromJson);
    plan.buildings.forEach((building) => (building.plan = plan));
    return plan;
  }

  toJson(): JsonPlan {
    return {
      ...(this.schema === undefined ? {} : { $schema: this.schema }),
      ...(this.fences.length > 0 ? { fences: this.fences.map((fence) => fence.toJson()) } : {}),
      ...(this.buildings.length > 0 ? { buildings: this.buildings.map((building) => building.toJson()) } : {}),
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
