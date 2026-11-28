import { Building } from "./Building";
import { Fence } from "./Fence";
import type { JsonColour, JsonGeoreference, JsonPlan } from "./json/Document";
import { validatePlanJson } from "./json/validatePlan";

export class Plan {
  public buildings: Building[];
  public fences: Fence[];
  public colours: JsonColour[];
  public georeference?: JsonGeoreference;

  constructor(
    public schema?: string,
    public readonly loadWarnings: readonly string[] = [],
  ) {
    this.buildings = [];
    this.fences = [];
    this.colours = [];
  }

  static fromJson(input: unknown): Plan {
    const { document, warnings } = validatePlanJson(input);
    const plan = new Plan(document.$schema, warnings);
    if (document.georeference) {
      const { latitude, longitude, bearing } = document.georeference;
      plan.georeference = { latitude, longitude, bearing };
    }
    plan.buildings = (document.buildings ?? []).map(Building.fromJson);
    plan.fences = (document.fences ?? []).map(Fence.fromJson);
    plan.colours = (document.colours ?? []).map((colour) => ({ ...colour }));
    plan.buildings.forEach((building) => (building.plan = plan));
    return plan;
  }

  toJson(): JsonPlan {
    return {
      ...(this.schema === undefined ? {} : { $schema: this.schema }),
      ...(this.georeference === undefined ? {} : { georeference: { ...this.georeference } }),
      ...(this.colours.length > 0 ? { colours: this.colours.map((colour) => ({ ...colour })) } : {}),
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
