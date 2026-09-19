import type { JsonLevel } from "./json/Document";
import { Room } from "./Room";
import { Wall } from "./Wall";

export class Level {
    public walls: Wall[];
    public rooms: Room[];

    constructor(public number: number, public name: string) {
        this.walls = [];
        this.rooms = [];
    }
    
    static fromJson(json: JsonLevel): Level {
        const level = new Level(json.number, json.name);
        console.log(`Creating level ${json.name}`, level);
        level.walls = json.walls?.map(Wall.fromJson) ?? [];
        level.rooms = json.rooms?.map(Room.fromJson) ?? [];
        console.log(`Level walls for ${json.name}`, level.walls);
        console.log(`Level rooms for ${json.name}`, level.rooms);
        return level;
    }
}