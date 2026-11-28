export type JsonGeoreference = { latitude: number; longitude: number; bearing: number };
export type JsonColour = { id: string; name: string; description?: string; value: string };
export type JsonPlan = {
  $schema?: string;
  georeference?: JsonGeoreference;
  colours?: JsonColour[];
  defaults?: JsonDefaults;
  fences?: JsonFence[];
  buildings?: JsonBuilding[];
};

export type JsonColourRef = string;
export type JsonColourProperties = { colour?: JsonColourRef };
export type JsonCeilingProperties = { colour?: JsonColourRef; height?: number };
export type JsonTrimProperties = { colour?: JsonColourRef; sillColour?: JsonColourRef };
export type JsonDoorProperties = { colour?: JsonColourRef; thickness?: number };
export type JsonWallProperties = { width?: number };
export type JsonWindowProperties = { sash?: JsonSash };

export type JsonDefaults = {
  interiorWall?: JsonColourProperties;
  exteriorWall?: JsonColourProperties;
  wall?: JsonWallProperties;
  ceiling?: JsonCeilingProperties;
  roof?: JsonColourProperties;
  interiorDoor?: JsonDoorProperties;
  exteriorDoor?: JsonDoorProperties;
  interiorTrim?: JsonTrimProperties;
  exteriorTrim?: JsonTrimProperties;
  window?: JsonWindowProperties;
};

export type JsonRoomDefaults = {
  interiorWall?: JsonColourProperties;
  ceiling?: JsonColourProperties;
  interiorTrim?: JsonTrimProperties;
};

export type JsonWallFace = { exterior?: boolean; colour?: JsonColourRef };
export type JsonOpeningFace = { trim?: JsonTrimProperties };

export type JsonFence = {
  id: string;
  start: JsonPosition;
  end: JsonPosition;
  width?: number;
  height?: number;
};

export type JsonBuilding = { name: string; defaults?: JsonDefaults; levels: JsonLevel[] };

export type JsonLevel = {
  number: number;
  name: string;
  defaults?: JsonDefaults;
  totalHeight?: number;
  walls?: JsonWall[];
  rooms?: JsonRoom[];
};

export type JsonWall = {
  id: string;
  start: JsonPosition;
  end: JsonPosition;
  width?: number;
  faceA?: JsonWallFace;
  faceB?: JsonWallFace;
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
  faceA?: JsonOpeningFace;
  faceB?: JsonOpeningFace;
  contents?: JsonOpeningItem[];
};

export type JsonItemGeometry = { x?: number; y?: number; width?: number; height?: number };
export type JsonOpeningItem = JsonStandardDoor | JsonSlidingDoor | JsonWindow | JsonPost;

export type JsonStandardDoor = JsonItemGeometry & {
  type: "StandardDoor";
  openAngle?: number;
  hingeSide: "left" | "right";
  swingDirection: "in" | "out";
} & JsonDoorProperties;

export type JsonSash = { colour?: JsonColourRef; widthTop?: number; widthRight?: number; widthBottom?: number; widthLeft?: number; depth?: number };
export type JsonWindow = JsonItemGeometry & {
  type: "Window";
  windowType: WindowType;
} & JsonWindowProperties;
export type JsonPost = JsonItemGeometry & { type: "Post" };

export type JsonSlidingDoor = JsonItemGeometry & { type: "SlidingDoor" } & JsonDoorProperties;

export type JsonWallRef = { ref: JsonWall["id"] };

export type JsonRoomLabel = { text?: string; position?: JsonPosition; rotation?: number; fontSize?: number };

export type JsonRoom = { name: string; defaults?: JsonRoomDefaults; walls: JsonWallRef[]; label?: JsonRoomLabel };

export type JsonPosition = [number, number];
import type { WindowType } from "../windowTypes";

