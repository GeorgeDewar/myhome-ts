import type { StandardDoor } from "../Opening";

export const doorSweep = (door: StandardDoor) =>
  ((door.hingeSide === "left") === (door.swingDirection === "out") ? -1 : 1) *
  door.effectiveOpenAngle * Math.PI / 180;
