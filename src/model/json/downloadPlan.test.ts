import { afterEach, describe, expect, it, vi } from "vitest";
import { Plan } from "../Plan";
import { downloadPlan } from "./downloadPlan";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("downloadPlan", () => {
  it("downloads the current plan as JSON and releases the temporary URL", async () => {
    vi.useFakeTimers();
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => link), body: { appendChild } });
    vi.stubGlobal("window", { setTimeout });
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:plan");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const plan = Plan.fromJson({
      buildings: [{ name: "House", levels: [{ number: 0, name: "Ground", rooms: [{ name: "Room", walls: [] }] }] }],
    });
    plan.buildings[0].levels[0].rooms[0].name = "Edited room";

    await downloadPlan(plan);

    const blob = createUrl.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toEqual(plan.toJson());
    expect(link.href).toBe("blob:plan");
    expect(link.download).toBe("myhome.json");
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith("blob:plan");
  });

  it("cleans up and reports an error if starting the download fails", async () => {
    vi.useFakeTimers();
    const link = {
      href: "",
      download: "",
      click: vi.fn(() => {
        throw new Error("download failed");
      }),
      remove: vi.fn(),
    };
    vi.stubGlobal("document", { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } });
    vi.stubGlobal("window", { setTimeout });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:plan");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    await expect(downloadPlan(new Plan())).rejects.toThrow("download failed");
    expect(link.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeUrl).toHaveBeenCalledWith("blob:plan");
  });
});
