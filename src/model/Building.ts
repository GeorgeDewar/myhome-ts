import type { JsonBuilding } from "./json/Document";
import { Level } from "./Level";
import type { Plan } from "./Plan";

export class Building {
    public levels: Level[];

    constructor(public name: string, public plan: Plan) {
        this.levels = [];
    }

    static fromJson(json: JsonBuilding): Building {
        const building = new Building(json.name, this as unknown as Plan);
        console.log(`Creating building ${json.name}`, building);
        building.levels = json.levels.map(Level.fromJson);
        console.log(`Building levels for ${json.name}`, building.levels);
        return building;
    }
}