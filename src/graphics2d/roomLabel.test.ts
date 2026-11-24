import { describe, expect, it, vi } from "vitest";
import { Plan } from "../model/Plan";
import { doubleClickSelection, selectionAtPoint } from "./planView2DHelpers";
import { drawRoomLabel, labelDragUpdate, labelHandles, labelHit, labelLayout, labelWorldPoint, oppositeLabelCorner } from "./roomLabel";

const setup = () => {
  const plan = Plan.fromJson({
    buildings: [{ name: "House", levels: [{
      number: 0, name: "Ground",
      walls: [
        { id: "a", start: [0, 0], end: [4000, 0] },
        { id: "b", start: [4000, 0], end: [4000, 4000] },
        { id: "c", start: [4000, 4000], end: [0, 4000] },
        { id: "d", start: [0, 4000], end: [0, 0] },
      ],
      rooms: [{ name: "Room", walls: [{ ref: "a" }, { ref: "b" }, { ref: "c" }, { ref: "d" }] }],
    }] }],
  });
  const room = plan.getRoomsOnLevel(0)[0];
  const context = {
    font: "", textAlign: "", textBaseline: "", fillStyle: "", strokeStyle: "", lineWidth: 0,
    measureText(text: string) {
      const size = parseFloat(this.font);
      return {
        width: text.length * size * 0.6,
        actualBoundingBoxLeft: text.length * size * 0.3,
        actualBoundingBoxRight: text.length * size * 0.3,
        actualBoundingBoxAscent: size * 0.4,
        actualBoundingBoxDescent: size * 0.4,
      };
    },
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillText: vi.fn(),
    strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), rect: vi.fn(), fill: vi.fn(),
  };
  return { room, context, canvas: context as unknown as CanvasRenderingContext2D };
};

describe("room labels", () => {
  it("prioritizes the room while retaining a label hit for Alt cycling", () => {
    const { room, canvas } = setup();
    const point = { x: 2, y: 2 };
    const selection = selectionAtPoint(canvas, point, [...room.walls], [room], [], true, true, 40);
    expect(selection.targets.map((target) => target.kind)).toEqual(["roomLabel", "room"]);
    expect(selection.targets[selection.activeIndex]).toEqual({ kind: "room", item: room });
    const hidden = selectionAtPoint(canvas, point, [...room.walls], [room], [], true, false, 40);
    expect(hidden.targets.map((target) => target.kind)).toEqual(["room"]);
    expect(selectionAtPoint(canvas, { x: 1, y: 1 }, [...room.walls], [room], [], true, true, 40)
      .targets.map((target) => target.kind)).toEqual(["room"]);
  });

  it("retains a label outside its room for Alt without selecting it on the first click", () => {
    const { room, canvas } = setup();
    room.label = { position: [6000, 6000], rotation: 45 };
    const selection = selectionAtPoint(canvas, { x: 6, y: 6 }, [...room.walls], [room], [], true, true, 40);
    expect(selection.targets.map((target) => target.kind)).toEqual(["roomLabel"]);
    expect(selection.activeIndex).toBe(-1);
  });

  it("uses the selection before a double-click to choose room or label properties", () => {
    const { room, canvas } = setup();
    const hits = selectionAtPoint(canvas, { x: 2, y: 2 }, [...room.walls], [room], [], true, true, 40);
    const cold = doubleClickSelection({ targets: [], activeIndex: -1 }, hits);
    expect(cold.targets[cold.activeIndex]).toEqual({ kind: "room", item: room });
    const fromRoom = doubleClickSelection({ targets: [{ kind: "room", item: room }], activeIndex: 0 }, hits);
    expect(fromRoom.targets[fromRoom.activeIndex].kind).toBe("roomLabel");
    const fromLabel = doubleClickSelection({ targets: hits.targets, activeIndex: 0 }, hits);
    expect(fromLabel.targets[fromLabel.activeIndex].kind).toBe("roomLabel");
    const fromMultiSelection = doubleClickSelection({ targets: [], activeIndex: -1, rooms: [room] }, hits);
    expect(fromMultiSelection.targets[fromMultiSelection.activeIndex].kind).toBe("roomLabel");
  });

  it("opens the owning room on a cold double-click of a label outside its room", () => {
    const { room, canvas } = setup();
    room.label = { position: [6000, 6000] };
    const hits = selectionAtPoint(canvas, { x: 6, y: 6 }, [...room.walls], [room], [], true, true, 40);
    const selection = doubleClickSelection({ targets: [], activeIndex: -1 }, hits);
    expect(selection.targets[selection.activeIndex]).toEqual({ kind: "room", item: room });
  });

  it("uses automatic placement and size unless overridden, and measures multiline text", () => {
    const { room, context, canvas } = setup();
    const automatic = labelLayout(canvas, room)!;
    expect(automatic.position).toEqual({ x: 2, y: 2 });
    expect(automatic.fontSize).toBe(0.3);
    expect(automatic.lines).toEqual(["Room"]);
    room.label = { text: "One\nLonger", position: [1100, 2500], fontSize: 500, rotation: 45 };
    const layout = labelLayout(canvas, room)!;
    expect(layout.position).toEqual({ x: 1.1, y: 2.5 });
    expect(layout.fontSize).toBe(0.5);
    expect(layout.bounds.right - layout.bounds.left).toBeCloseTo(1.8);
    expect(layout.bounds.bottom - layout.bounds.top).toBeCloseTo(1);
    drawRoomLabel(canvas, layout, true, 20);
    expect(context.fillText).toHaveBeenNthCalledWith(1, "One", 0, -0.3);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "Longer", 0, 0.3);
    expect(context.rotate).toHaveBeenCalledWith(-Math.PI / 4);
    expect(context.rect).toHaveBeenCalledTimes(5);
  });

  it("hit-tests rotated bounds and all handles", () => {
    const { room, canvas } = setup();
    room.label = { rotation: 45 };
    const layout = labelLayout(canvas, room)!;
    const handles = labelHandles(layout, 40);
    expect(labelHit(layout, labelWorldPoint(layout, { x: 0, y: 0 }), 40, false)).toBe("move");
    for (const corner of handles.corners) {
      expect(labelHit(layout, labelWorldPoint(layout, corner), 40, true)).toBe("resize");
    }
    expect(labelHit(layout, labelWorldPoint(layout, handles.rotation), 40, true)).toBe("rotate");
    expect(labelHit(layout, { x: -10, y: -10 }, 40, true)).toBeUndefined();
  });

  it("moves, snaps font size and rotation, and allows unsnapped integer sizes with Ctrl", () => {
    const { room, canvas } = setup();
    const layout = labelLayout(canvas, room)!;
    const start = { x: 3, y: 2 };
    expect(labelDragUpdate(layout, "move", start, { x: 3.1254, y: 1.75 }, { free: false }))
      .toEqual({ position: [2125, 1750] });
    expect(labelDragUpdate(layout, "resize", start, { x: 3.51, y: 2 }, { free: false }).fontSize).toBe(450);
    expect(labelDragUpdate(layout, "resize", start, { x: 3.51, y: 2 }, { free: true }).fontSize).toBe(453);
    expect(labelDragUpdate(layout, "resize", start, { x: 1, y: 2 }, { free: false }).fontSize).toBe(30);
    expect(labelDragUpdate(layout, "resize", start, { x: 1, y: 2 }, { free: true }).fontSize).toBe(1);
    const angle = 20 * Math.PI / 180;
    const end = { x: 2 + Math.cos(angle), y: 2 - Math.sin(angle) };
    expect(labelDragUpdate(layout, "rotate", start, end, { free: false }).rotation).toBe(0);
    expect(labelDragUpdate(layout, "rotate", start, end, { free: true }).rotation).toBeCloseTo(20);
    const end70 = { x: 2 + Math.cos(70 * Math.PI / 180), y: 2 - Math.sin(70 * Math.PI / 180) };
    expect(labelDragUpdate(layout, "rotate", start, end70, { free: false }).rotation).toBe(90);
    const acrossStart = { x: 2 - Math.cos(angle), y: 2 + Math.sin(angle) };
    const acrossEnd = { x: 2 - Math.cos(angle), y: 2 - Math.sin(angle) };
    expect(labelDragUpdate(layout, "rotate", acrossStart, acrossEnd, { free: true }).rotation).toBeCloseTo(-40);
  });

  it.each([0, 45])("keeps the opposite corner anchored while resizing at %s degrees", (rotation) => {
    const { room, canvas } = setup();
    room.label = { text: "One\nLonger", position: [2000, 2000], fontSize: 300, rotation };
    const layout = labelLayout(canvas, room)!;
    for (const [index, corner] of labelHandles(layout, 40).corners.entries()) {
      const start = labelWorldPoint(layout, corner);
      const anchor = oppositeLabelCorner(layout, start, 40);
      const point = { x: anchor.x + (start.x - anchor.x) * 1.53, y: anchor.y + (start.y - anchor.y) * 1.53 };
      for (const free of [false, true]) {
        const update = labelDragUpdate(layout, "resize", start, point, { free, oppositeCorner: anchor });
        expect(update.fontSize).toBe(free ? 459 : 450);
        const next = labelLayout(canvas, room, { ...room.label, ...update })!;
        const opposite = labelWorldPoint(next, labelHandles(next, 40).corners[(index + 2) % 4]);
        expect(opposite.x).toBeCloseTo(anchor.x, 3);
        expect(opposite.y).toBeCloseTo(anchor.y, 3);
      }
    }
  });
});
