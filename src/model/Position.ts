import { type JsonPosition } from "./json/Document";

export class Position{
    constructor(public x: number, public y: number) {}

    static fromJson(json: JsonPosition) {
        return new Position(json[0], json[1]);
    }
}