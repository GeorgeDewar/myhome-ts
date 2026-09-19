import type { JsonRoom } from "./json/Document";

export class Room {
    constructor(public name: string) { }

    static fromJson(json: JsonRoom): Room {
        return new Room(json.name);
    }
}