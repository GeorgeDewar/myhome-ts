import { Distance } from "./geom/Distance";
import { Line2D } from "./geom/Line2D";
import { Point2D } from "./geom/Point2D";
import { Vector2D } from "./geom/Vector2D";
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
  ) {
    this.openings = [];
  }

  get width() {
    return this.explicitWidth ?? new Distance(DEFAULT_WIDTH_METRES);
  }

  static fromJson(json: JsonWall) {
    const wall = new Wall(
      json.id,
      Point2D.fromJson(json.start),
      Point2D.fromJson(json.end),
      json.width === undefined ? undefined : Distance.fromJson(json.width),
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
    };
  }

  centerLine() {
    return new Line2D(this.from, this.to);
  }

  vector() {
    return new Vector2D(this.to.x.minus(this.from.x), this.to.y.minus(this.from.y));
  }

  basicPolygon2D() {
    const unitVector = this.vector().unit();
    const unitNormal = unitVector.normal();
    const halfWidthNormal = unitNormal.times(this.width.metres / 2);

    const extendedStart = this.from.minus(unitVector.times(this.width.metres / 2));
    const extendedEnd = this.to.plus(unitVector.times(this.width.metres / 2));

    return [
      extendedStart.plus(halfWidthNormal),
      extendedEnd.plus(halfWidthNormal),
      extendedEnd.minus(halfWidthNormal),
      extendedStart.minus(halfWidthNormal),
    ];
  }
}
