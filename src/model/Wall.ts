import { Distance } from "./geom/Distance";
import { Line2D } from "./geom/Line2D";
import { Point2D } from "./geom/Point2D";
import type { JsonWall } from "./json/Document";
import type { Level } from "./Level";
import { Opening } from "./Opening";

const DEFAULT_WIDTH_METRES = 0.1;

export class Wall {
  public openings: Opening[];
  public level?: Level;

  constructor(
    public id: string,
    public from: Point2D,
    public to: Point2D,
    public explicitWidth?: Distance,
    public virtual?: boolean,
  ) {
    if (from.equals(to)) throw new Error(`Wall '${id}' must have a non-zero centerline`);
    this.openings = [];
  }

  get width() {
    return this.explicitWidth ?? new Distance(DEFAULT_WIDTH_METRES);
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
    );
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
      ...(this.openings.length > 0 ? { openings: this.openings.map((opening) => opening.toJson()) } : {}),
      ...(this.virtual === undefined ? {} : { virtual: this.virtual }),
    };
  }

  centerLine() {
    return new Line2D(this.from, this.to);
  }

  vector() {
    return this.centerLine().vector();
  }

  basicPolygon2D() {
    return this.centerLine().basicPolygon2D(this.width.metres);
  }
}
