import * as Tabs from "@radix-ui/react-tabs";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, Download, Layers } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./App.css";
import { PlanContext } from "./context/PlanContext";
import { PlanView2D, type PlanView2DStatus } from "./graphics2d/PlanView2D";
import type { BaseMapSettings } from "./graphics2d/BaseMap";
import { planToGeographic, referenceAt, type Point } from "./graphics2d/georeference";
import { PlanView3D, type PlanView3DStatus } from "./graphics3d/PlanView3D";
import { PlanTree } from "./gui/PlanTree";
import { BaseMapControls } from "./gui/BaseMapControls";
import type { LayerVisibility } from "./gui/Layers";
import { loadSettings, saveSettings } from "./gui/settingsStorage";
import { CreateWindow, type CreateRequest } from "./gui/CreateWindow";
import { PropertyWindow } from "./gui/PropertyWindow";
import {
  isSelectionTarget,
  selectedTargets,
  selectionTargetNames,
  toggleRoomSelection,
  type SelectionState,
  type SelectionTarget,
} from "./gui/selection";
import type { JsonGeoreference, JsonPlan, JsonPosition } from "./model/json/Document";
import { downloadPlan } from "./model/json/downloadPlan";
import { Plan } from "./model/Plan";
import { PlanEditor } from "./model/PlanEditor";
import type { Room } from "./model/Room";
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
  const [storedSettings] = useState(loadSettings);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>(storedSettings.layerVisibility);
  const [editingTarget, setEditingTarget] = useState<SelectionTarget>();
  const [creating, setCreating] = useState<CreateRequest>();
  const [drawingWall, setDrawingWall] = useState(false);
  const [baseMapSettings, setBaseMapSettings] = useState<BaseMapSettings>({
    enabled: storedSettings.basemapEnabled, key: storedSettings.apiKey, type: "street", outsideOpacity: 1, insideOpacity: 0.3,
  });
  useEffect(() => {
    saveSettings({ apiKey: baseMapSettings.key, basemapEnabled: baseMapSettings.enabled, layerVisibility });
  }, [baseMapSettings.key, baseMapSettings.enabled, layerVisibility]);
  const [mapDraft, setMapDraft] = useState<JsonGeoreference>();
  const [mapPivot, setMapPivot] = useState<Point>({ x: 0, y: 0 });
  const [choosingMapPivot, setChoosingMapPivot] = useState(false);
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
  const planCentre = () => {
    const points = [...plan.getWallsOnLevel(activeLevel), ...plan.fences].flatMap((item) => [item.from, item.to]);
    if (!points.length) return { x: 0, y: 0 };
    const xs = points.map((point) => point.x.metres);
    const ys = points.map((point) => point.y.metres);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  };

  const selectTarget = (target: SelectionTarget, toggleRoom = false) =>
    setSelection((current) =>
      toggleRoom && target.kind === "room"
        ? toggleRoomSelection(current, target.item)
        : { targets: [target], activeIndex: 0 },
    );
  const toggleRoom = useCallback((room: Room) => {
    setSelection((current) => toggleRoomSelection(current, room));
  }, [setSelection]);

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
      const selectedRoom = target.kind === "room" && selection.rooms?.includes(target.item);
      if (index < 0 && !selectedRoom) return false;
      contextReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection((current) =>
        index < 0 ? { ...current, targets: [target], activeIndex: 0 } : { ...current, activeIndex: index },
      );
      setContextMenu({ target, x, y });
      return true;
    },
    [selection.targets, selection.rooms, setSelection, setContextMenu],
  );

  const deleteTarget = useCallback(
    (target: SelectionTarget) => {
      if (target.kind === "roomLabel") return;
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
      if (drawingWall || mapDraft) return;
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
  }, [activeTarget, deleteTarget, drawingWall, mapDraft, selection.activeIndex, selection.targets.length]);

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
            <button className="toolbar-button" type="button" onClick={handleDownload}>
              <Download size={16} aria-hidden="true" />
              Download JSON
            </button>
            <button
              className="toolbar-button"
              type="button"
              disabled={!currentLevel || !!mapDraft}
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
                  if (kind === "wall" || kind === "fence" || kind === "opening" || kind === "item") {
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
                <p>Ignored items and unexpected properties will not be included in downloaded JSON.</p>
                <ol>
                  {plan.loadWarnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ol>
              </details>
            </section>
          )}

          <section className="workspace">
            <PlanTree
              plan={plan}
              layerVisibility={layerVisibility}
              onLayerVisibilityChange={setLayerVisibility}
              activeLevel={activeLevel}
              selectedTargets={selectedTargets(selection)}
              activeTarget={activeTarget}
              onLevelSelect={selectLevel}
              onSelect={selectTarget}
              onEdit={setEditingTarget}
              onContextMenu={openContextMenu}
              baseMapControls={<BaseMapControls
                settings={baseMapSettings}
                onSettingsChange={setBaseMapSettings}
                reference={mapDraft ?? plan.georeference}
                aligning={!!mapDraft}
                choosingPivot={choosingMapPivot}
                onStart={(latitude, longitude) => {
                  const pivot = planCentre();
                  setMapPivot(pivot);
                  setMapDraft(referenceAt(pivot, latitude, longitude, 0));
                  setChoosingMapPivot(false);
                  setBaseMapSettings((current) => ({ ...current, enabled: true }));
                  setDrawingWall(false);
                  setActiveViewId("plan-2d");
                }}
                onAdjust={() => {
                  if (!plan.georeference) return;
                  setMapPivot(planCentre());
                  setMapDraft({ ...plan.georeference });
                  setChoosingMapPivot(false);
                  setBaseMapSettings((current) => ({ ...current, enabled: true }));
                  setDrawingWall(false);
                  setActiveViewId("plan-2d");
                }}
                onChoosePivot={() => setChoosingMapPivot(true)}
                onBearing={(bearing) => {
                  if (!mapDraft) return;
                  const location = planToGeographic(mapDraft, mapPivot);
                  setMapDraft(referenceAt(mapPivot, location.latitude, location.longitude, bearing));
                }}
                onApply={() => {
                  if (!mapDraft) return;
                  const result = editPlan.updateGeoreference(mapDraft);
                  if (!result.ok) { window.alert(result.error); return; }
                  setMapDraft(undefined);
                  setChoosingMapPivot(false);
                }}
                onCancel={() => { setMapDraft(undefined); setChoosingMapPivot(false); }}
              />}
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
                  layerVisibility={layerVisibility}
                  onStatusChange={setTwoDStatus}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onToggleRoom={toggleRoom}
                  onEdit={setEditingTarget}
                  onContextMenu={openContextMenu}
                  drawingWall={drawingWall}
                  onDrawWall={drawWall}
                  editPlan={editPlan}
                  version={planVersion}
                  baseMap={baseMapSettings.enabled && baseMapSettings.key && (mapDraft ?? plan.georeference)
                    ? { settings: baseMapSettings, reference: (mapDraft ?? plan.georeference)!, status: twoDStatus } : undefined}
                  alignment={mapDraft ? {
                    reference: mapDraft, pivot: mapPivot, choosingPivot: choosingMapPivot,
                    onReferenceChange: setMapDraft,
                    onPivotChange: (pivot) => { setMapPivot(pivot); setChoosingMapPivot(false); },
                  } : undefined}
                />
              </Tabs.Content>
              <Tabs.Content className="view-panel" value="plan-3d">
                <PlanView3D
                  onStatusChange={setThreeDStatus}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onToggleRoom={toggleRoom}
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
              {contextMenu.target.kind !== "roomLabel" && (
                <button type="button" role="menuitem" onClick={() => deleteTarget(contextMenu.target)}>
                  Delete
                </button>
              )}
              {contextMenu.target.kind === "room" && selection.rooms && editPlan.canMergeRooms(selection.rooms) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (contextMenu.target.kind !== "room" || !selection.rooms) return;
                    const room = contextMenu.target.item;
                    const result = editPlan.mergeRooms(selection.rooms, room);
                    setContextMenu(undefined);
                    if (!result.ok) {
                      window.alert(result.error);
                      return;
                    }
                    setSelection({ targets: [{ kind: "room", item: room }], activeIndex: 0 });
                    setEditingTarget((current) => (current && editPlan.contains(current.item) ? current : undefined));
                  }}
                >
                  Merge rooms
                </button>
              )}
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
