import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { useState } from "react";
import "./App.css";
import { PlanContext } from "./context/PlanContext";
import { PlanView3D } from "./graphics3d/PlanView3D";
import type { JsonPlan } from "./model/json/Document";
import { Plan } from "./model/Plan";
import testPlan from "./testData/McKeefry.json";

type ViewDescriptor = { id: string; kind: "2d" | "3d"; level: number };

const initialViews: ViewDescriptor[] = [
  { id: "plan-2d", kind: "2d", level: 0 },
  { id: "plan-3d", kind: "3d", level: 0 },
];

function App() {
  const jsonPlan = testPlan as JsonPlan;
  const [plan] = useState(() => Plan.fromJson(jsonPlan));
  const levels = plan.buildings.flatMap((building) => building.levels);
  const [activeLevel, setActiveLevel] = useState(levels[0]?.number ?? 0);
  const [activeViewId, setActiveViewId] = useState(initialViews[0].id);
  const activeLevelIndex = levels.findIndex((level) => level.number === activeLevel);
  const currentLevel = levels[activeLevelIndex];
  const activeView = initialViews.find((view) => view.id === activeViewId) ?? initialViews[0];

  const selectAdjacentLevel = (direction: -1 | 1) => {
    const nextLevel = levels[activeLevelIndex + direction];
    if (nextLevel) setActiveLevel(nextLevel.number);
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <PlanContext value={plan}>
        <main className="app-shell">
          <header className="toolbar" aria-label="Plan toolbar">
            <div className="toolbar-brand">
              <Layers aria-hidden="true" size={18} strokeWidth={2.4} />
              <span>OpenHome</span>
            </div>
            <div className="toolbar-divider" />
            <div className="level-control" aria-label="Active level">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Previous level"
                    disabled={activeLevelIndex <= 0}
                    onClick={() => selectAdjacentLevel(-1)}
                  >
                    <ChevronDown size={18} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip" sideOffset={6}>
                    Previous level
                    <Tooltip.Arrow />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
              <span className="level-label">{currentLevel?.name ?? "No level"}</span>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Next level"
                    disabled={activeLevelIndex < 0 || activeLevelIndex >= levels.length - 1}
                    onClick={() => selectAdjacentLevel(1)}
                  >
                    <ChevronUp size={18} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="tooltip" sideOffset={6}>
                    Next level
                    <Tooltip.Arrow />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>
          </header>

          <section className="workspace">
            <aside className="plan-tree" aria-label="Plan hierarchy">
              <div className="panel-heading">Plan</div>
              <nav>
                {plan.buildings.map((building) => (
                  <details className="tree-group tree-building" key={building.name} open>
                    <summary className="tree-row tree-parent"><span>{building.name}</span></summary>
                    {building.levels.map((level) => (
                      <details className="tree-group tree-level" key={`${building.name}-${level.number}`} open>
                        <summary className={`tree-row ${level.number === activeLevel ? "is-active" : ""}`}>
                          <span>{level.name}</span>
                        </summary>
                        <details className="tree-group tree-category">
                          <summary className="tree-row"><span>Walls</span><span className="tree-count">{level.walls.length}</span></summary>
                          {level.walls.map((wall) => (
                            <details className="tree-group tree-wall" key={wall.id}>
                              <summary className="tree-row"><span>{wall.id}</span></summary>
                              {wall.openings.map((opening) => (
                                <details className="tree-group tree-opening" key={opening.id}>
                                  <summary className="tree-row"><span>{opening.id}</span></summary>
                                  {opening.contents.map((content, index) => (
                                    <div className="tree-row tree-item" key={`${opening.id}-${index}`}>
                                      <span>{content.type === "StandardDoor" ? "Standard Door" : "Standard Window"}</span>
                                    </div>
                                  ))}
                                </details>
                              ))}
                            </details>
                          ))}
                        </details>
                        <details className="tree-group tree-category">
                          <summary className="tree-row"><span>Rooms</span><span className="tree-count">{level.rooms.length}</span></summary>
                          {level.rooms.map((room) => <div className="tree-row tree-room" key={room.name}><span>{room.name}</span></div>)}
                        </details>
                      </details>
                    ))}
                  </details>
                ))}
              </nav>
            </aside>

            <Tabs.Root className="view-host" value={activeView.id} onValueChange={setActiveViewId}>
              <Tabs.List className="view-tabs" aria-label="Plan views">
                {initialViews.map((view) => (
                  <Tabs.Trigger className="view-tab" key={view.id} value={view.id}>
                    {view.kind === "2d" ? "2D Plan" : "3D View"}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <Tabs.Content className="view-panel" value="plan-2d">
                <div className="empty-view">
                  <div className="empty-view-grid" />
                  <div className="empty-view-content">
                    <span>2D Plan</span>
                    <small>Canvas editor coming next</small>
                  </div>
                </div>
              </Tabs.Content>
              <Tabs.Content className="view-panel" value="plan-3d">
                <PlanView3D level={activeLevel} />
              </Tabs.Content>
            </Tabs.Root>
          </section>

          <footer className="status-bar">
            <span>{currentLevel ? `Level ${currentLevel.number}: ${currentLevel.name}` : "No level selected"}</span>
            <span>{currentLevel?.walls.length ?? 0} walls</span>
            <span>{currentLevel?.rooms.length ?? 0} rooms</span>
            <span className="status-spacer" />
            <span>{activeView.kind.toUpperCase()} view</span>
          </footer>
        </main>
      </PlanContext>
    </Tooltip.Provider>
  );
}

export default App;
