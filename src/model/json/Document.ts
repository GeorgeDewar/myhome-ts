export type JsonGeoreference = { latitude: number; longitude: number; bearing: number };
export type JsonPlan = { $schema?: string; georeference?: JsonGeoreference; fences?: JsonFence[]; buildings?: JsonBuilding[] };

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

export type JsonItemGeometry = { x?: number; y?: number; width?: number; height?: number };
export type JsonOpeningItem = JsonStandardDoor | JsonSlidingDoor | JsonWindow | JsonPost;

export type JsonStandardDoor = JsonItemGeometry & {
  type: "StandardDoor";
  openAngle?: number;
  hingeSide: "left" | "right";
  swingDirection: "in" | "out";
  thickness?: number;
};

export type JsonSash = { widthTop?: number; widthRight?: number; widthBottom?: number; widthLeft?: number; depth?: number };
export type JsonWindow = JsonItemGeometry & {
  type: "Window";
  windowType: "awning" | "fixed";
  sash?: JsonSash;
};
export type JsonPost = JsonItemGeometry & { type: "Post" };

export type JsonSlidingDoor = JsonItemGeometry & { type: "SlidingDoor"; thickness?: number };

export type JsonWallRef = { ref: JsonWall["id"] };

export type JsonRoomLabel = { text?: string; position?: JsonPosition; rotation?: number; fontSize?: number };

export type JsonRoom = { name: string; walls: JsonWallRef[]; label?: JsonRoomLabel };

export type JsonPosition = [number, number];
