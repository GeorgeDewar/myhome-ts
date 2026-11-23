export type JsonPlan = { $schema?: string; fences?: JsonFence[]; buildings?: JsonBuilding[] };

export type JsonFence = {
  id: string;
  start: JsonPosition;
  end: JsonPosition;
  width?: number;
  height?: number;
};

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
  virtual?: boolean;
  attic?: boolean;
};

export type JsonOpening = {
  id: string;
  shape?: "rectangle" | "halfCircleArch";
  width: number;
  height?: number;
  distanceAlongWall: number;
  distanceFromFloor?: number;
  contents?: JsonOpeningItem[];
};

export type JsonOpeningItem = JsonStandardDoor | JsonSlidingDoor | JsonStandardWindow;

export type JsonStandardDoor = {
  type: "StandardDoor";
  openAngle?: number;
  hingeSide: "left" | "right";
  swingDirection: "in" | "out";
  thickness?: number;
};

export type JsonStandardWindow = { type: "StandardWindow" };

export type JsonSlidingDoor = { type: "SlidingDoor"; thickness?: number };

export type JsonWallRef = { ref: JsonWall["id"] };

export type JsonRoom = { name: string; walls: JsonWallRef[] };

export type JsonPosition = [number, number];
