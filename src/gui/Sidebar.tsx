import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { panelIds, panelTitles, type PanelId, type PanelLayout } from "./panelLayout";
import "./Sidebar.css";

// A locked panel is forced open and cannot be collapsed or closed, e.g. while it holds an in-progress task.
export const Sidebar = ({
  layout,
  onLayoutChange,
  panels,
  locked = {},
}: {
  layout: PanelLayout;
  onLayoutChange: (layout: PanelLayout) => void;
  panels: Record<PanelId, ReactNode>;
  locked?: Partial<Record<PanelId, boolean>>;
}) => {
  const visible = panelIds.filter((id) => layout[id].open || locked[id]);
  if (visible.length === 0) return null;
  const update = (id: PanelId, change: Partial<PanelLayout[PanelId]>) =>
    onLayoutChange({ ...layout, [id]: { ...layout[id], ...change } });
  return (
    <aside className="plan-tree" aria-label="Side panels">
      {visible.map((id) => {
        const collapsed = layout[id].collapsed && !locked[id];
        return (
          <div className="side-panel" key={id}>
            <div className="side-panel-header">
              <button
                type="button"
                className="side-panel-title"
                aria-expanded={!collapsed}
                disabled={locked[id]}
                onClick={() => update(id, { collapsed: !layout[id].collapsed })}
              >
                {collapsed ? (
                  <ChevronRight size={14} aria-hidden="true" />
                ) : (
                  <ChevronDown size={14} aria-hidden="true" />
                )}
                {panelTitles[id]}
              </button>
              <button
                type="button"
                className="side-panel-close"
                aria-label={`Close ${panelTitles[id]} panel`}
                disabled={locked[id]}
                onClick={() => update(id, { open: false })}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="side-panel-body" hidden={collapsed}>
              {panels[id]}
            </div>
          </div>
        );
      })}
    </aside>
  );
};
