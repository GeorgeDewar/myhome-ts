import { Distance } from "./geom/Distance";
import { Line2D } from "./geom/Line2D";
import { Point2D } from "./geom/Point2D";
import type { JsonFence } from "./json/Document";

export class Fence {
  constructor(
    public id: string,
    public from: Point2D,
    public to: Point2D,
    public explicitWidth?: Distance,
    public height?: Distance,
  ) {
    if (from.equals(to)) throw new Error(`Fence '${id}' must have a non-zero centerline`);
  }

  get width() {
    return this.explicitWidth ?? new Distance(0.05);
  }

  static fromJson(json: JsonFence) {
    if (json.start === undefined || json.end === undefined) {
      throw new Error(`Fence '${json.id}' requires start and end positions`);
    }
    return new Fence(
      json.id,
      Point2D.fromJson(json.start),
      Point2D.fromJson(json.end),
      json.width === undefined ? undefined : Distance.fromJson(json.width),
      json.height === undefined ? undefined : Distance.fromJson(json.height),
    );
  }

  toJson(): JsonFence {
    return {
      id: this.id,
      start: this.from.toJson(),
      end: this.to.toJson(),
      ...(this.explicitWidth ? { width: this.explicitWidth.toJson() } : {}),
      ...(this.height ? { height: this.height.toJson() } : {}),
    };
  }

  basicPolygon2D() {
    return new Line2D(this.from, this.to).basicPolygon2D(this.width.metres);
  }
}
