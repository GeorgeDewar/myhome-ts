import type { LayerVisibility } from "./Layers";

const storageKey = "openhome.settings";

export const defaultLayerVisibility: LayerVisibility = {
  fences: true,
  normalWalls: true,
  virtualWalls: false,
  atticWalls: false,
  roomLabels: true,
  doors: true,
  compass: true,
};

export type StoredSettings = { apiKey: string; layerVisibility: LayerVisibility; basemapEnabled: boolean };

const isLayerVisibility = (value: unknown): value is Omit<LayerVisibility, "compass"> & { compass?: boolean } => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const layers = value as Record<string, unknown>;
  return Object.keys(defaultLayerVisibility).every(
    (key) => typeof layers[key] === "boolean" || (key === "compass" && !Object.hasOwn(layers, key)),
  );
};

export const loadSettings = (): StoredSettings => {
  const defaults: StoredSettings = { apiKey: "", layerVisibility: defaultLayerVisibility, basemapEnabled: false };
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return defaults;
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Settings must be an object.");
    }
    const settings = value as Record<string, unknown>;
    if (
      typeof settings.apiKey !== "string" ||
      typeof settings.basemapEnabled !== "boolean" ||
      !isLayerVisibility(settings.layerVisibility)
    ) {
      console.error("Some saved settings have an invalid format.");
    }
    return {
      apiKey: typeof settings.apiKey === "string" ? settings.apiKey : defaults.apiKey,
      basemapEnabled: typeof settings.basemapEnabled === "boolean" ? settings.basemapEnabled : defaults.basemapEnabled,
      layerVisibility: isLayerVisibility(settings.layerVisibility)
        ? { ...settings.layerVisibility, compass: settings.layerVisibility.compass ?? defaults.layerVisibility.compass }
        : defaults.layerVisibility,
    };
  } catch (error) {
    console.error("Could not load saved settings.", error);
    return defaults;
  }
};

export const saveSettings = (settings: StoredSettings) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch (error) {
    console.error("Could not save settings.", error);
  }
};
