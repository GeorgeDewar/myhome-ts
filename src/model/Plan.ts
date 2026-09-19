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
}