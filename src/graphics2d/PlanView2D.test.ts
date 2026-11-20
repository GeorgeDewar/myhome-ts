import { describe, expect, it, vi } from "vitest";
import { Fence } from "../model/Fence";
import { drawFences } from "./PlanView2D";
import { slidingDoorLeaves } from "./renderPolygons";

describe("drawFences", () => {
  it("draws fence geometry in brown", () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
    };
    const fences = [Fence.fromJson({ id: "fence", start: [0, 0], end: [1000, 0] })];

    drawFences(context as unknown as CanvasRenderingContext2D, fences, 20);

    expect(context.fillStyle).toBe("#8b5a2b");
    expect(context.strokeStyle).toBe("#6b3f1c");
    expect(context.fill).toHaveBeenCalledWith("evenodd");
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenCalledOnce();
    expect(context.lineTo).toHaveBeenCalled();
  });

  describe("slidingDoorLeaves", () => {
    it("creates overlapping horizontal leaves with the specified thickness", () => {
      const [left, right] = slidingDoorLeaves({ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 0, y: 1 }, 0.06);

      expect(left[0]).toEqual({ x: 1, y: 2 });
      expect(right[2]).toEqual({ x: 3, y: 2 });
      expect(left[1].x).toBeGreaterThan(right[3].x);
      expect(left[2].y - left[1].y).toBeCloseTo(0.06);
      expect(right[2].y - right[1].y).toBeCloseTo(0.06);
    });

    it("rotates the leaves with the wall and handles a zero-width opening", () => {
      const [first, second] = slidingDoorLeaves({ x: 1, y: 2 }, { x: 1, y: 4 }, { x: -1, y: 0 }, 0.035);

      expect(first[1].y).toBeGreaterThan(second[3].y);
      expect(first[1].x - first[2].x).toBeCloseTo(0.035);
      expect(second[1].x - second[2].x).toBeCloseTo(0.035);
      const collapsed = slidingDoorLeaves({ x: 1, y: 2 }, { x: 1, y: 2 }, { x: -1, y: 0 }, 0.035);
      expect(collapsed.flat().every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    });
  });

  it("does not draw when there are no fences", () => {
    const context = { beginPath: vi.fn() };

    drawFences(context as unknown as CanvasRenderingContext2D, [], 20);

    expect(context.beginPath).not.toHaveBeenCalled();
  });
});
