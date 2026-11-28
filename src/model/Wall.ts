import type { DefaultsScopes } from "./defaults";
import { resolveDefault } from "./defaults";
import { Distance } from "./geom/Distance";
import { Line2D } from "./geom/Line2D";
import { Point2D } from "./geom/Point2D";
import { pointInPolygon, roomPolygon } from "./geom/roomPolygon";
import type { JsonWall, JsonWallFace } from "./json/Document";
import type { Level } from "./Level";
import { Opening } from "./Opening";
import type { Room } from "./Room";

const DEFAULT_WIDTH_METRES = 0.1;
// How far from the centerline to probe when finding the room against a face
const FACE_PROBE_METRES = 0.001;

export type WallFace = "A" | "B";

// Copies only known properties, so that unexpected ones aren't saved
const copyFace = (face: JsonWallFace): JsonWallFace => ({
  ...(face.exterior === undefined ? {} : { exterior: face.exterior }),
  ...(face.colour === undefined ? {} : { colour: face.colour }),
});

export class Wall {
  public openings: Opening[];
  public level?: Level;
  public faceA?: JsonWallFace;
  public faceB?: JsonWallFace;

  constructor(
    public id: string,
    public from: Point2D,
    public to: Point2D,
    public explicitWidth?: Distance,
    public virtual?: boolean,
    public attic?: boolean,
  ) {
    if (from.equals(to)) throw new Error(`Wall '${id}' must have a non-zero centerline`);
    this.openings = [];
  }

  get width() {
    if (this.explicitWidth) return this.explicitWidth;
    const width = resolveDefault(this.level?.defaultsScopes() ?? [], "wall", "width");
    return width === undefined ? new Distance(DEFAULT_WIDTH_METRES) : Distance.fromJson(width);
  }

  // Face A is on the side of the wall's normal: the left of the direction of travel on a y-down screen.
  roomAgainst(face: WallFace): Room | undefined {
    const dx = this.to.x.metres - this.from.x.metres;
    const dy = this.to.y.metres - this.from.y.metres;
    const length = Math.hypot(dx, dy);
    const sign = face === "A" ? 1 : -1;
    const probe = {
      x: (this.from.x.metres + this.to.x.metres) / 2 - (sign * dy * FACE_PROBE_METRES) / length,
      y: (this.from.y.metres + this.to.y.metres) / 2 + (sign * dx * FACE_PROBE_METRES) / length,
    };
    return this.level?.rooms.find((room) => room.walls.includes(this) && pointInPolygon(probe, roomPolygon(room)));
  }

  isFaceExterior(face: WallFace) {
    return (face === "A" ? this.faceA : this.faceB)?.exterior ?? this.roomAgainst(face) === undefined;
  }

  isExterior() {
    return this.isFaceExterior("A") || this.isFaceExterior("B");
  }

  // The room against the face is the most specific scope for things on that face
  faceDefaultsScopes(face: WallFace): DefaultsScopes {
    return this.roomAgainst(face)?.defaultsScopes() ?? this.level?.defaultsScopes() ?? [];
  }

  faceColour(face: WallFace) {
    return (
      (face === "A" ? this.faceA : this.faceB)?.colour ??
      resolveDefault(
        this.faceDefaultsScopes(face),
        this.isFaceExterior(face) ? "exteriorWall" : "interiorWall",
        "colour",
      )
    );
  }

  static fromJson(json: JsonWall) {
    if (json.start === undefined || json.end === undefined) {
      throw new Error(`Wall '${json.id}' requires start and end positions`);
    }
    const wall = new Wall(
      json.id,
      Point2D.fromJson(json.start),
      Point2D.fromJson(json.end),
      json.width === undefined ? undefined : Distance.fromJson(json.width),
      json.virtual,
      json.attic,
    );
    if (json.faceA) wall.faceA = copyFace(json.faceA);
    if (json.faceB) wall.faceB = copyFace(json.faceB);
    wall.openings = (json.openings ?? []).map(Opening.fromJson);
    wall.openings.forEach((opening) => (opening.wall = wall));
    return wall;
  }

  toJson(): JsonWall {
    return {
      id: this.id,
      start: this.from.toJson(),
      end: this.to.toJson(),
      ...(this.explicitWidth ? { width: this.explicitWidth.toJson() } : {}),
      ...(this.faceA ? { faceA: copyFace(this.faceA) } : {}),
      ...(this.faceB ? { faceB: copyFace(this.faceB) } : {}),
      ...(this.openings.length > 0 ? { openings: this.openings.map((opening) => opening.toJson()) } : {}),
      ...(this.virtual === undefined ? {} : { virtual: this.virtual }),
      ...(this.attic === undefined ? {} : { attic: this.attic }),
    };
  }

  centerLine() {
    return new Line2D(this.from, this.to);
  }

  basicPolygon2D() {
    return this.centerLine().basicPolygon2D(this.width.metres);
  }
}
