export type JsonPlan = {
    "$schema": string;
    buildings: JsonBuilding[];
}

export type JsonBuilding = {
    name: string;
    levels: JsonLevel[];
}

export type JsonLevel = {
    number: number;
    name: string;
    ceilingHeight?: number;
    totalHeight?: number;
    walls?: JsonWall[];
    rooms?: JsonRoom[];
}

export type JsonWall = {
    id: string;
    start: JsonPosition;
    end: JsonPosition;
    thickness?: number;
}

export type JsonWallRef = {
    ref: JsonWall["id"];
}

export type JsonRoom = {
    name: string;
    walls: JsonWallRef[];
}

export type JsonPosition = [number, number];
