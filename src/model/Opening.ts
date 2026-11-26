import { Distance } from "./geom/Distance";
import type { JsonItemGeometry, JsonOpening, JsonOpeningItem, JsonSash } from "./json/Document";
import type { Wall } from "./Wall";
import type { WindowType } from "./windowTypes";

export type OpeningItem = StandardDoor | SlidingDoor | Window | Post;

const DEFAULT_DOOR_THICKNESS_METRES = 0.035;
export const DEFAULT_OPENING_HEIGHT_METRES = 2.1;
export const sashFields = ["widthTop", "widthRight", "widthBottom", "widthLeft", "depth"] as const;
export type SashField = keyof JsonSash;

class ItemGeometry {
  x?: Distance;
  y?: Distance;
  width?: Distance;
  height?: Distance;

  loadGeometry(json: JsonItemGeometry) {
    this.x = json.x === undefined ? undefined : Distance.fromJson(json.x);
    this.y = json.y === undefined ? undefined : Distance.fromJson(json.y);
    this.width = json.width === undefined ? undefined : Distance.fromJson(json.width);
    this.height = json.height === undefined ? undefined : Distance.fromJson(json.height);
  }

  geometryJson(): JsonItemGeometry {
    return {
      ...(this.x === undefined ? {} : { x: this.x.toPositionJson() }),
      ...(this.y === undefined ? {} : { y: this.y.toPositionJson() }),
      ...(this.width === undefined ? {} : { width: this.width.toJson() }),
      ...(this.height === undefined ? {} : { height: this.height.toJson() }),
    };
  }
}

export class StandardDoor extends ItemGeometry {
  readonly type = "StandardDoor" as const;

  constructor(
    public hingeSide: "left" | "right",
    public swingDirection: "in" | "out",
    public thickness?: Distance,
    public openAngle?: number,
  ) { super(); }

  get leafThickness() {
    return this.thickness ?? new Distance(DEFAULT_DOOR_THICKNESS_METRES);
  }

  get effectiveOpenAngle() {
    return this.openAngle ?? 90;
  }

  static fromJson(json: Extract<JsonOpeningItem, { type: "StandardDoor" }>) {
    const item = new StandardDoor(
      json.hingeSide,
      json.swingDirection,
      json.thickness === undefined ? undefined : Distance.fromJson(json.thickness),
      json.openAngle,
    );
    item.loadGeometry(json);
    return item;
  }

  toJson(): Extract<JsonOpeningItem, { type: "StandardDoor" }> {
    return {
      type: this.type,
      ...this.geometryJson(),
      ...(this.openAngle === undefined ? {} : { openAngle: this.openAngle }),
      hingeSide: this.hingeSide,
      swingDirection: this.swingDirection,
      ...(this.thickness ? { thickness: this.thickness.toJson() } : {}),
    };
  }
}

export class Window extends ItemGeometry {
  readonly type = "Window" as const;
  sash?: Partial<Record<SashField, Distance>>;

  constructor(public windowType: WindowType) { super(); }

  static fromJson(json: Extract<JsonOpeningItem, { type: "Window" }>) {
    const item = new Window(json.windowType);
    item.loadGeometry(json);
    if (json.sash !== undefined) {
      item.sash = {};
      for (const field of sashFields) {
        const value = json.sash[field];
        if (value !== undefined) item.sash[field] = Distance.fromJson(value);
      }
    }
    return item;
  }

  toJson(): Extract<JsonOpeningItem, { type: "Window" }> {
    const sash: JsonSash = {};
    for (const field of sashFields) {
      const value = this.sash?.[field];
      if (value !== undefined) sash[field] = value.toJson();
    }
    return { type: this.type, windowType: this.windowType, ...this.geometryJson(),
      ...(this.sash === undefined ? {} : { sash }) };
  }
}

export class Post extends ItemGeometry {
  readonly type = "Post" as const;

  static fromJson(json: Extract<JsonOpeningItem, { type: "Post" }>) {
    const item = new Post();
    item.loadGeometry(json);
    return item;
  }

  toJson(): Extract<JsonOpeningItem, { type: "Post" }> {
    return { type: this.type, ...this.geometryJson() };
  }
}

export class SlidingDoor extends ItemGeometry {
  readonly type = "SlidingDoor" as const;

  constructor(public thickness?: Distance) { super(); }

  get leafThickness() {
    return this.thickness ?? new Distance(DEFAULT_DOOR_THICKNESS_METRES);
  }

  static fromJson(json: Extract<JsonOpeningItem, { type: "SlidingDoor" }>) {
    const item = new SlidingDoor(json.thickness === undefined ? undefined : Distance.fromJson(json.thickness));
    item.loadGeometry(json);
    return item;
  }

  toJson(): Extract<JsonOpeningItem, { type: "SlidingDoor" }> {
    return { type: this.type, ...this.geometryJson(), ...(this.thickness ? { thickness: this.thickness.toJson() } : {}) };
  }
}

export class Opening {
  public wall?: Wall;
  public contents: OpeningItem[];

  constructor(
    public id: string,
    public width: Distance,
    public distanceAlongWall: Distance,
    public height?: Distance,
    public distanceFromFloor?: Distance,
    public shape?: JsonOpening["shape"],
  ) {
    this.contents = [];
  }

  static fromJson(json: JsonOpening) {
    const opening = new Opening(
      json.id,
      Distance.fromJson(json.width),
      Distance.fromJson(json.distanceAlongWall),
      json.height === undefined ? undefined : Distance.fromJson(json.height),
      json.distanceFromFloor === undefined ? undefined : Distance.fromJson(json.distanceFromFloor),
      json.shape === "rectangle" ? undefined : json.shape,
    );
    opening.contents = (json.contents ?? []).map((content) => {
      switch (content.type) {
        case "StandardDoor":
          return StandardDoor.fromJson(content);
        case "SlidingDoor":
          return SlidingDoor.fromJson(content);
        case "Window":
          return Window.fromJson(content);
        case "Post":
          return Post.fromJson(content);
        default:
          throw new Error(`Unknown opening item type: ${JSON.stringify(content)}`);
      }
    });
    return opening;
  }

  toJson(): JsonOpening {
    return {
      id: this.id,
      ...(this.shape === undefined || this.shape === "rectangle" ? {} : { shape: this.shape }),
      distanceAlongWall: this.distanceAlongWall.toPositionJson(),
      width: this.width.toJson(),
      ...(this.height ? { height: this.height.toJson() } : {}),
      ...(this.distanceFromFloor ? { distanceFromFloor: this.distanceFromFloor.toPositionJson() } : {}),
      ...(this.contents.length > 0 ? {
        contents: this.contents.map((content) => content.toJson()).sort((a, b) =>
          (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0)),
      } : {}),
    };
  }
}
