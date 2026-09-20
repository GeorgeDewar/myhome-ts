import { Distance } from "./geom/Distance";
import { Line2D } from "./geom/Line2D";
import { Point2D } from "./geom/Point2D";
import { Vector2D } from "./geom/Vector2D";
import type { JsonWall } from "./json/Document";

const DEFAULT_THICKNESS = 100

export class Wall {
  constructor(
    public from: Point2D,
    public to: Point2D,
    public thickness: Distance
  ) {}

  static fromJson(json: JsonWall) {
    return new Wall(
      Point2D.fromJson(json.start),
      Point2D.fromJson(json.end),
      json.thickness ? Distance.fromJson(json.thickness) : Distance.fromJson(DEFAULT_THICKNESS)
    );
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
    const halfThicknessNormal = unitNormal.times(this.thickness.metres);

    const extendedStart = this.from.minus(unitVector.times(this.thickness.metres / 2));
    const extendedEnd = this.to.plus(unitVector.times(this.thickness.metres / 2));

    return [
      extendedStart.plus(halfThicknessNormal),
      extendedEnd.plus(halfThicknessNormal),
      extendedEnd.minus(halfThicknessNormal),
      extendedStart.minus(halfThicknessNormal)
    ];
  }
}