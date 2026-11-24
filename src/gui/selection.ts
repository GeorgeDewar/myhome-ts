import type { Opening, OpeningItem, SlidingDoor, StandardDoor, StandardWindow } from "../model/Opening";
import type { Fence } from "../model/Fence";
import type { Room } from "../model/Room";
import type { Wall } from "../model/Wall";

export type SelectionTarget =
  | { kind: "room"; item: Room }
  | { kind: "roomLabel"; item: Room }
  | { kind: "wall"; item: Wall }
  | { kind: "fence"; item: Fence }
  | { kind: "opening"; item: Opening }
  | { kind: "door"; item: StandardDoor; opening: Opening }
  | { kind: "slidingDoor"; item: SlidingDoor; opening: Opening }
  | { kind: "window"; item: StandardWindow; opening: Opening };

export type SelectionState = { targets: SelectionTarget[]; activeIndex: number; rooms?: Room[] };

export const selectionTargetNames: Record<SelectionTarget["kind"], string> = {
  room: "Room",
  roomLabel: "Room Label",
  wall: "Wall",
  fence: "Fence",
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

export const selectedTargets = (selection: SelectionState): SelectionTarget[] =>
  selection.rooms ? selection.rooms.map((item) => ({ kind: "room", item })) : selection.targets;

export const toggleRoomSelection = (selection: SelectionState, room: Room): SelectionState => {
  const active = selection.targets[selection.activeIndex];
  const rooms = selection.rooms ?? (active?.kind === "room" ? [active.item] : []);
  const next = rooms.includes(room) ? rooms.filter((item) => item !== room) : [...rooms, room];
  const selected = next.at(-1);
  if (!selected) return { targets: [], activeIndex: -1 };
  return {
    targets: [{ kind: "room", item: selected }],
    activeIndex: 0,
    ...(next.length > 1 ? { rooms: next } : {}),
  };
};
