import { describe, expect, it, vi } from "vitest";
import { Fence } from "../model/Fence";
import { drawFences } from "./PlanView2D";

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

  it("does not draw when there are no fences", () => {
    const context = { beginPath: vi.fn() };

    drawFences(context as unknown as CanvasRenderingContext2D, [], 20);

    expect(context.beginPath).not.toHaveBeenCalled();
  });
});
