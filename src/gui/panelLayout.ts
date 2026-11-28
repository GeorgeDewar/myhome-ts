export const panelIds = ["layers", "basemap", "plan"] as const;
export type PanelId = (typeof panelIds)[number];
export const panelTitles: Record<PanelId, string> = { layers: "Layers", basemap: "Basemap", plan: "Plan" };

export type PanelState = { open: boolean; collapsed: boolean };
export type PanelLayout = Record<PanelId, PanelState>;

const storageKey = "openhome.panels";

export const defaultPanelLayout = (): PanelLayout => ({
  layers: { open: true, collapsed: false },
  basemap: { open: true, collapsed: false },
  plan: { open: true, collapsed: false },
});

const isPanelState = (value: unknown): value is PanelState =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as PanelState).open === "boolean" &&
  typeof (value as PanelState).collapsed === "boolean";

export const loadPanelLayout = (): PanelLayout => {
  const layout = defaultPanelLayout();
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return layout;
    const value: unknown = JSON.parse(stored);
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error("Layout must be an object.");
    for (const id of panelIds) {
      const panel = (value as Record<string, unknown>)[id];
      if (isPanelState(panel)) layout[id] = { open: panel.open, collapsed: panel.collapsed };
    }
  } catch (error) {
    console.error("Could not load the saved panel layout.", error);
  }
  return layout;
};

export const savePanelLayout = (layout: PanelLayout) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch (error) {
    console.error("Could not save the panel layout.", error);
  }
};
