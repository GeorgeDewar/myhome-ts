import type { Opening, OpeningItem, SlidingDoor, StandardDoor, StandardWindow } from "../model/Opening";
import type { Room } from "../model/Room";
import type { Wall } from "../model/Wall";

export type SelectionTarget =
  | { kind: "room"; item: Room }
  | { kind: "wall"; item: Wall }
  | { kind: "opening"; item: Opening }
  | { kind: "door"; item: StandardDoor; opening: Opening }
  | { kind: "slidingDoor"; item: SlidingDoor; opening: Opening }
  | { kind: "window"; item: StandardWindow; opening: Opening };

export type SelectionState = { targets: SelectionTarget[]; activeIndex: number };

export const selectionTargetNames: Record<SelectionTarget["kind"], string> = {
  room: "Room",
  wall: "Wall",
  opening: "Opening",
  door: "Standard Door",
  slidingDoor: "Sliding Door",
  window: "Standard Window",
};

export const selectionTargetForOpeningItem = (item: OpeningItem, opening: Opening): SelectionTarget => {
  switch (item.type) {
    case "StandardDoor":
      return { kind: "door", item, opening };
    case "SlidingDoor":
      return { kind: "slidingDoor", item, opening };
    case "StandardWindow":
      return { kind: "window", item, opening };
  }
};

export const isSelectionTarget = (target: SelectionTarget, candidate: SelectionTarget) =>
  target.kind === candidate.kind && target.item === candidate.item;
