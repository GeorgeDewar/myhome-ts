import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, Download, Layers } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./App.css";
import { PlanContext } from "./context/PlanContext";
import { PlanView2D, type PlanView2DStatus } from "./graphics2d/PlanView2D";
import { PlanView3D, type PlanView3DStatus } from "./graphics3d/PlanView3D";
import { PlanTree } from "./gui/PlanTree";
import { CreateWindow, type CreateRequest } from "./gui/CreateWindow";
import { PropertyWindow } from "./gui/PropertyWindow";
import { isSelectionTarget, selectionTargetNames, type SelectionState, type SelectionTarget } from "./gui/selection";
import type { JsonPlan, JsonPosition } from "./model/json/Document";
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
  const [creating, setCreating] = useState<CreateRequest>();
  const [drawingWall, setDrawingWall] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ target: SelectionTarget; x: number; y: number }>();
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextReturnFocusRef = useRef<HTMLElement | null>(null);
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

  const drawWall = useCallback((start: JsonPosition, end: JsonPosition) => {
    if (!currentLevel) {
      window.alert("Select a level first.");
      return false;
    }
    const result = editPlan.addWall(currentLevel, start, end);
    if (!result.ok) {
      window.alert(result.error);
      return false;
    }
    setSelection({ targets: [{ kind: "wall", item: result.item }], activeIndex: 0 });
    setDrawingWall(false);
    return true;
  }, [currentLevel, editPlan, setSelection, setDrawingWall]);

  const openContextMenu = useCallback(
    (target: SelectionTarget, x: number, y: number) => {
      const index = selection.targets.findIndex((selected) => isSelectionTarget(selected, target));
      if (index < 0) return false;
      contextReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection((current) => ({ ...current, activeIndex: index }));
      setContextMenu({ target, x, y });
      return true;
    },
    [selection.targets, setSelection, setContextMenu],
  );

  const deleteTarget = useCallback(
    (target: SelectionTarget) => {
      const result =
        target.kind === "wall"
          ? editPlan.deleteWall(target.item)
          : target.kind === "fence"
            ? editPlan.deleteFence(target.item)
          : target.kind === "room"
            ? editPlan.deleteRoom(target.item)
            : target.kind === "opening"
              ? editPlan.deleteOpening(target.item)
              : editPlan.deleteOpeningItem(target.item);
      setContextMenu(undefined);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      setSelection({ targets: [], activeIndex: -1 });
      setEditingTarget((current) => (current && editPlan.contains(current.item) ? current : undefined));
    },
    [editPlan, setContextMenu, setSelection, setEditingTarget],
  );

  const handleDownload = async () => {
    try {
      await downloadPlan(plan);
    } catch (error) {
      console.error("Failed to download the plan", error);
      window.alert("Could not download the plan. Please try again.");
    }
  };

  const selectLevel = (level: number) => {
    setActiveLevel(level);
    setDrawingWall(false);
  };

  const selectAdjacentLevel = (direction: -1 | 1) => {
    const nextLevel = levels[activeLevelIndex + direction];
    if (nextLevel) selectLevel(nextLevel.number);
  };

  useLayoutEffect(() => {
    const menu = contextMenuRef.current;
    if (!contextMenu || !menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(contextMenu.x, window.innerWidth - width))}px`;
    menu.style.top = `${Math.max(0, Math.min(contextMenu.y, window.innerHeight - height))}px`;
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) setContextMenu(undefined);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [contextMenu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (drawingWall && event.key === "Escape") {
        event.preventDefault();
        setDrawingWall(false);
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) return;
      if (
        event.target instanceof Element &&
        event.target.closest(".property-window, .object-context-menu, [contenteditable='true']")
      ) return;
      if (drawingWall) return;
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
      if (
        event.key === "Delete" &&
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        activeTarget
      ) {
        event.preventDefault();
        deleteTarget(activeTarget);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTarget, deleteTarget, drawingWall, selection.targets.length]);

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
            <button
              className="download-button"
              type="button"
              disabled={!currentLevel}
              aria-pressed={drawingWall}
              onClick={() => {
                setActiveViewId("plan-2d");
                setDrawingWall((drawing) => !drawing);
              }}
            >
              Draw wall
            </button>
            <select
                aria-label="Add object"
                value=""
                onChange={(event) => {
                  const kind = event.target.value;
                  if (kind === "wall" || kind === "fence" || kind === "room" || kind === "opening" || kind === "item") {
                    setCreating({
                      kind,
                      level: currentLevel,
                      wall: activeTarget?.kind === "wall" ? activeTarget.item : undefined,
                      opening: activeTarget?.kind === "opening" ? activeTarget.item :
                        activeTarget?.kind === "door" || activeTarget?.kind === "slidingDoor" || activeTarget?.kind === "window" ? activeTarget.opening : undefined,
                    });
                  }
                }}
              >
                <option value="">Add...</option>
                <option value="wall" disabled={!currentLevel}>Wall</option>
                <option value="room" disabled={!currentLevel}>Room</option>
                <option value="fence">Fence</option>
                <option value="opening" disabled={activeTarget?.kind !== "wall"}>Opening (select a wall)</option>
                <option value="item" disabled={!activeTarget || !["opening", "door", "slidingDoor", "window"].includes(activeTarget.kind)}>Opening item (select an opening)</option>
            </select>
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

          {plan.loadWarnings.length > 0 && (
            <section className="load-warnings" role="alert" aria-label="Plan loading warnings">
              <details open>
                <summary>{plan.loadWarnings.length} plan loading warning{plan.loadWarnings.length === 1 ? "" : "s"}</summary>
                <p>Invalid items were ignored and will not be included in downloaded JSON.</p>
                <ol>
                  {plan.loadWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ol>
              </details>
            </section>
          )}

          <section className="workspace">
            <PlanTree
              plan={plan}
              activeLevel={activeLevel}
              selectedTargets={selection.targets}
              activeTarget={activeTarget}
              onLevelSelect={selectLevel}
              onSelect={selectTarget}
              onEdit={setEditingTarget}
              onContextMenu={openContextMenu}
            />

            <Tabs.Root className="view-host" value={activeView.id} onValueChange={(id) => {
              setActiveViewId(id);
              if (id !== "plan-2d") setDrawingWall(false);
            }}>
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
                  onContextMenu={openContextMenu}
                  drawingWall={drawingWall}
                  onDrawWall={drawWall}
                  version={planVersion}
                />
              </Tabs.Content>
              <Tabs.Content className="view-panel" value="plan-3d">
                <PlanView3D
                  onStatusChange={setThreeDStatus}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onEdit={setEditingTarget}
                  onContextMenu={openContextMenu}
                  version={planVersion}
                />
              </Tabs.Content>
            </Tabs.Root>
          </section>

          <footer className="status-bar">
            <span>{currentLevel ? `Level ${currentLevel.number}: ${currentLevel.name}` : "No level selected"}</span>
            {drawingWall && <span>Click the wall endpoints. Press Escape to cancel.</span>}
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
          {contextMenu && (
            <div
              ref={contextMenuRef}
              className="object-context-menu"
              role="menu"
              aria-labelledby="object-context-menu-label"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setContextMenu(undefined);
                  contextReturnFocusRef.current?.focus();
                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const buttons = contextMenuRef.current?.querySelectorAll<HTMLButtonElement>("button");
                  if (buttons?.length) {
                    const index = Array.from(buttons).findIndex((button) => button === document.activeElement);
                    buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length].focus();
                  }
                } else if (event.key === "Tab") {
                  setContextMenu(undefined);
                }
              }}
            >
              <div id="object-context-menu-label" className="object-context-menu-label">
                {selectionTargetNames[contextMenu.target.kind]}
              </div>
              <button
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => {
                  setEditingTarget(contextMenu.target);
                  setContextMenu(undefined);
                }}
              >
                Edit
              </button>
              <button type="button" role="menuitem" onClick={() => deleteTarget(contextMenu.target)}>
                Delete
              </button>
            </div>
          )}
          {editingTarget && (
            <PropertyWindow
              target={editingTarget}
              editPlan={editPlan}
              onClose={() => setEditingTarget(undefined)}
            />
          )}
          {creating && (
            <CreateWindow
              key={creating.kind}
              request={creating}
              editor={editPlan}
              onClose={() => setCreating(undefined)}
              onCreated={(target) => {
                selectTarget(target);
                setCreating(undefined);
              }}
            />
          )}
        </main>
      </PlanContext>
    </Tooltip.Provider>
  );
}

export default App;
