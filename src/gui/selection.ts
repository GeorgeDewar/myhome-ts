import type { Opening, OpeningItem, StandardDoor, StandardWindow } from "../model/Opening";
import type { Room } from "../model/Room";
import type { Wall } from "../model/Wall";

export type SelectionTarget =
  | { kind: "room"; item: Room }
  | { kind: "wall"; item: Wall }
  | { kind: "opening"; item: Opening }
  | { kind: "door"; item: StandardDoor; opening: Opening }
  | { kind: "window"; item: StandardWindow; opening: Opening };

export type SelectionState = { targets: SelectionTarget[]; activeIndex: number };

export const selectionTargetForOpeningItem = (item: OpeningItem, opening: Opening): SelectionTarget =>
  item.type === "StandardDoor" ? { kind: "door", item, opening } : { kind: "window", item, opening };

export const isSelectionTarget = (target: SelectionTarget, candidate: SelectionTarget) =>
  target.kind === candidate.kind && target.item === candidate.item;
