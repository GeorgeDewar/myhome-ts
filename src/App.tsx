import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, Download, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import "./App.css";
import { PlanContext } from "./context/PlanContext";
import { PlanView2D, type PlanView2DStatus } from "./graphics2d/PlanView2D";
import { PlanView3D, type PlanView3DStatus } from "./graphics3d/PlanView3D";
import { PlanTree } from "./gui/PlanTree";
import { PropertyWindow } from "./gui/PropertyWindow";
import type { SelectionState, SelectionTarget } from "./gui/selection";
import type { JsonPlan } from "./model/json/Document";
import { downloadPlan } from "./model/json/downloadPlan";
import { Plan } from "./model/Plan";
import { PlanEditor } from "./model/PlanEditor";
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
  const [selection, setSelection] = useState<SelectionState>({ targets: [], activeIndex: -1 });
  const [editingTarget, setEditingTarget] = useState<SelectionTarget>();
  const [planVersion, setPlanVersion] = useState(0);
  const [editPlan] = useState(() => new PlanEditor(plan, () => setPlanVersion((version) => version + 1)));
  const [twoDStatus, setTwoDStatus] = useState<PlanView2DStatus>({
    cursor: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    scale: 20,
  });
  const [threeDStatus, setThreeDStatus] = useState<PlanView3DStatus>({
    position: { x: 0, y: 15, z: 45 },
    rotation: { x: 0, y: 0, z: 0 },
  });
  const activeLevelIndex = levels.findIndex((level) => level.number === activeLevel);
  const currentLevel = levels[activeLevelIndex];
  const activeView = initialViews.find((view) => view.id === activeViewId) ?? initialViews[0];
  const activeTarget = selection.targets[selection.activeIndex];

  const selectTarget = (target: SelectionTarget) => setSelection({ targets: [target], activeIndex: 0 });
  const refreshPlan = () => setPlanVersion((version) => version + 1);

  const handleDownload = async () => {
    try {
      await downloadPlan(plan);
    } catch (error) {
      console.error("Failed to download the plan", error);
      window.alert("Could not download the plan. Please try again.");
    }
  };

  const selectAdjacentLevel = (direction: -1 | 1) => {
    const nextLevel = levels[activeLevelIndex + direction];
    if (nextLevel) setActiveLevel(nextLevel.number);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Alt" && !event.repeat && selection.targets.length > 1) {
        event.preventDefault();
        setSelection((currentSelection) => ({
          targets: currentSelection.targets,
          activeIndex: (currentSelection.activeIndex + 1) % currentSelection.targets.length,
        }));
      }
      if (event.key === "Enter" && activeTarget) {
        event.preventDefault();
        setEditingTarget(activeTarget);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTarget, selection.targets.length]);

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
            <button className="download-button" type="button" onClick={handleDownload}>
              <Download size={16} aria-hidden="true" />
              Download JSON
            </button>
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
            <PlanTree
              plan={plan}
              activeLevel={activeLevel}
              selectedTargets={selection.targets}
              activeTarget={activeTarget}
              onLevelSelect={setActiveLevel}
              onSelect={selectTarget}
              onEdit={setEditingTarget}
            />

            <Tabs.Root className="view-host" value={activeView.id} onValueChange={setActiveViewId}>
              <Tabs.List className="view-tabs" aria-label="Plan views">
                {initialViews.map((view) => (
                  <Tabs.Trigger className="view-tab" key={view.id} value={view.id}>
                    {view.kind === "2d" ? "2D Plan" : "3D View"}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <Tabs.Content className="view-panel" value="plan-2d">
                <PlanView2D
                  level={activeLevel}
                  onStatusChange={setTwoDStatus}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onEdit={setEditingTarget}
                  version={planVersion}
                />
              </Tabs.Content>
              <Tabs.Content className="view-panel" value="plan-3d">
                <PlanView3D level={activeLevel} onStatusChange={setThreeDStatus} version={planVersion} />
              </Tabs.Content>
            </Tabs.Root>
          </section>

          <footer className="status-bar">
            <span>{currentLevel ? `Level ${currentLevel.number}: ${currentLevel.name}` : "No level selected"}</span>
            {activeView.kind === "2d" ? (
              <>
                <span>
                  Cursor: ({Math.round(twoDStatus.cursor.x * 1000)}mm, {Math.round(twoDStatus.cursor.y * 1000)}mm)
                </span>
                <span>Scale: {twoDStatus.scale.toFixed(2)}</span>
                <span>
                  Offset: ({Math.round(twoDStatus.offset.x * 1000)}mm, {Math.round(twoDStatus.offset.y * 1000)}mm)
                </span>
              </>
            ) : (
              <span>
                Camera Pos: ({threeDStatus.position.x.toFixed(2)}, {threeDStatus.position.y.toFixed(2)},{" "}
                {threeDStatus.position.z.toFixed(2)}), Angle: ({Math.round(threeDStatus.rotation.x)},{" "}
                {Math.round(threeDStatus.rotation.y)}, {Math.round(threeDStatus.rotation.z)})
              </span>
            )}
            <span className="status-spacer" />
            <span>{activeView.kind.toUpperCase()} view</span>
          </footer>
          {editingTarget && (
            <PropertyWindow
              target={editingTarget}
              editPlan={editPlan}
              onChange={refreshPlan}
              onClose={() => setEditingTarget(undefined)}
            />
          )}
        </main>
      </PlanContext>
    </Tooltip.Provider>
  );
}

export default App;
