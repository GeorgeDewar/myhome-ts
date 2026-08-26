import { Position } from "./Position";
import type { Wall as JsonWall } from "./json/Document";

const DEFAULT_THICKNESS = 100

export class Wall {
  constructor(
    public from: Position,
    public to: Position,
    public thickness: number
  ) {}

  static fromJson(json: JsonWall) {
    return new Wall(
      Position.fromJson(json.start),
      Position.fromJson(json.end),
      json.thickness ?? DEFAULT_THICKNESS
    );
  }
}