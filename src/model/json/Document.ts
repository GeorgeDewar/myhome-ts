export type JsonPlan = { $schema?: string; buildings: JsonBuilding[] };

export type JsonBuilding = { name: string; levels: JsonLevel[] };

export type JsonLevel = {
  number: number;
  name: string;
  ceilingHeight?: number;
  totalHeight?: number;
  walls?: JsonWall[];
  rooms?: JsonRoom[];
};

export type JsonWall = {
  id: string;
  start: JsonPosition;
  end: JsonPosition;
  width?: number;
  openings?: JsonOpening[];
};

export type JsonOpening = {
  id: string;
  width: number;
  height?: number;
  distanceAlongWall: number;
  distanceFromFloor?: number;
  contents?: JsonOpeningItem[];
};

export type JsonOpeningItem = JsonStandardDoor | JsonStandardWindow;

export type JsonStandardDoor = {
  type: "StandardDoor";
  hingeSide: "left" | "right";
  swingDirection: "in" | "out";
  thickness?: number;
};

export type JsonStandardWindow = { type: "StandardWindow" };

export type JsonWallRef = { ref?: JsonWall["id"] };

export type JsonRoom = { name: string; walls?: JsonWallRef[] };

export type JsonPosition = [number, number];
