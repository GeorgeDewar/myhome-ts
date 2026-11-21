import { Distance } from "./geom/Distance";
import type { JsonOpening, JsonOpeningItem } from "./json/Document";
import type { Wall } from "./Wall";

export type OpeningItem = StandardDoor | SlidingDoor | StandardWindow;

const DEFAULT_DOOR_THICKNESS_METRES = 0.035;

export class StandardDoor {
  readonly type = "StandardDoor" as const;

  constructor(
    public hingeSide: "left" | "right",
    public swingDirection: "in" | "out",
    public thickness?: Distance,
  ) {}

  get leafThickness() {
    return this.thickness ?? new Distance(DEFAULT_DOOR_THICKNESS_METRES);
  }

  static fromJson(json: Extract<JsonOpeningItem, { type: "StandardDoor" }>) {
    return new StandardDoor(
      json.hingeSide,
      json.swingDirection,
      json.thickness === undefined ? undefined : Distance.fromJson(json.thickness),
    );
  }

  toJson(): Extract<JsonOpeningItem, { type: "StandardDoor" }> {
    return {
      type: this.type,
      hingeSide: this.hingeSide,
      swingDirection: this.swingDirection,
      ...(this.thickness ? { thickness: this.thickness.toJson() } : {}),
    };
  }
}

export class StandardWindow {
  readonly type = "StandardWindow" as const;

  static fromJson() {
    return new StandardWindow();
  }

  toJson(): Extract<JsonOpeningItem, { type: "StandardWindow" }> {
    return { type: this.type };
  }
}

export class SlidingDoor {
  readonly type = "SlidingDoor" as const;

  constructor(public thickness?: Distance) {}

  get leafThickness() {
    return this.thickness ?? new Distance(DEFAULT_DOOR_THICKNESS_METRES);
  }

  static fromJson(json: Extract<JsonOpeningItem, { type: "SlidingDoor" }>) {
    return new SlidingDoor(json.thickness === undefined ? undefined : Distance.fromJson(json.thickness));
  }

  toJson(): Extract<JsonOpeningItem, { type: "SlidingDoor" }> {
    return { type: this.type, ...(this.thickness ? { thickness: this.thickness.toJson() } : {}) };
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
    );
    opening.contents = (json.contents ?? []).map((content) => {
      switch (content.type) {
        case "StandardDoor":
          return StandardDoor.fromJson(content);
        case "SlidingDoor":
          return SlidingDoor.fromJson(content);
        case "StandardWindow":
          return StandardWindow.fromJson();
        default:
          throw new Error(`Unknown opening item type: ${JSON.stringify(content)}`);
      }
    });
    return opening;
  }

  toJson(): JsonOpening {
    return {
      id: this.id,
      distanceAlongWall: this.distanceAlongWall.toPositionJson(),
      width: this.width.toJson(),
      ...(this.height ? { height: this.height.toJson() } : {}),
      ...(this.distanceFromFloor ? { distanceFromFloor: this.distanceFromFloor.toPositionJson() } : {}),
      ...(this.contents.length > 0 ? { contents: this.contents.map((content) => content.toJson()) } : {}),
    };
  }
}
