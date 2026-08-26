export type Document = {
    "$schema": string;
    buildings: Building[];
}

export type Building = {
    name: string;
    floors: Floor[];
}

export type Floor = {
    number: number;
    name: string;
    ceilingHeight?: number;
    totalHeight?: number;
    walls: Wall[];
    rooms: Room[];
}

export type Wall = {
    id: string;
    start: Position;
    end: Position;
    thickness?: number;
}

export type WallRef = {
    ref: Wall["id"];
}

export type Room = {
    name: string;
    walls: WallRef[];
}

export type Position = [number, number];
