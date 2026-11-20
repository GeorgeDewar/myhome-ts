import type { Point2D } from "./Point2D";
import { Vector2D } from "./Vector2D";

export class Line2D {
  constructor(
    public from: Point2D,
    public to: Point2D,
  ) {}

  vector() {
    return new Vector2D(this.to.x.minus(this.from.x), this.to.y.minus(this.from.y));
  }

  basicPolygon2D(width: number) {
    const unitVector = this.vector().unit();
    const halfWidthNormal = unitVector.normal().times(width / 2);
    const extendedStart = this.from.minus(unitVector.times(width / 2));
    const extendedEnd = this.to.plus(unitVector.times(width / 2));
    return [
      extendedStart.plus(halfWidthNormal),
      extendedEnd.plus(halfWidthNormal),
      extendedEnd.minus(halfWidthNormal),
      extendedStart.minus(halfWidthNormal),
    ];
  }
}
