import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLayerVisibility, loadSettings, saveSettings } from "./settingsStorage";

describe("local settings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("restores the applied API key and visibility choices", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const settings = {
      apiKey: "test-key",
      basemapEnabled: true,
      layerVisibility: { ...defaultLayerVisibility, fences: false, virtualWalls: true },
    };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
    saveSettings({ ...settings, apiKey: "" });
    expect(loadSettings().apiKey).toBe("");
  });

  it("keeps valid settings when another stored setting is invalid", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => JSON.stringify({ apiKey: "test-key", basemapEnabled: true, layerVisibility: { fences: "no" } }),
      },
    });
    expect(loadSettings()).toEqual({
      apiKey: "test-key",
      basemapEnabled: true,
      layerVisibility: defaultLayerVisibility,
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("reports storage failures and keeps defaults on read failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("unavailable");
        },
        setItem: () => {
          throw new Error("unavailable");
        },
      },
    });
    const settings = loadSettings();
    expect(settings).toEqual({ apiKey: "", basemapEnabled: false, layerVisibility: defaultLayerVisibility });
    saveSettings(settings);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
