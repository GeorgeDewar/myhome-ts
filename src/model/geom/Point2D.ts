import type { JsonPosition } from "../json/Document";
import { Distance } from "./Distance";
import type { Vector2D } from "./Vector2D";

export class Point2D {
  constructor(
    public x: Distance,
    public y: Distance,
  ) {}

  static fromJson(json: JsonPosition) {
    return new Point2D(Distance.fromJson(json[0]), Distance.fromJson(json[1]));
  }

  toJson(): JsonPosition {
    return [this.x.toJson(), this.y.toJson()];
  }

  plus(vector: Vector2D) {
    return new Point2D(this.x.plus(vector.dX), this.y.plus(vector.dY));
  }

  minus(vector: Vector2D) {
    return new Point2D(this.x.minus(vector.dX), this.y.minus(vector.dY));
  }
}
