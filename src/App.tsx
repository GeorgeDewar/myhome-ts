import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./App.css";
import { PlanContext } from "./context/PlanContext";
import { PlanView2D, type PlanTool, type PlanView2DStatus } from "./graphics2d/PlanView2D";
import type { BaseMapSettings } from "./graphics2d/BaseMap";
import { planToGeographic, referenceAt, type Point } from "./graphics2d/georeference";
import { PlanView3D, type PlanView3DStatus } from "./graphics3d/PlanView3D";
import { PlanTree } from "./gui/PlanTree";
import { MenuBar } from "./gui/MenuBar";
import { Sidebar } from "./gui/Sidebar";
import { loadPanelLayout, savePanelLayout } from "./gui/panelLayout";
import { BaseMapControls } from "./gui/BaseMapControls";
import { Layers, type LayerVisibility } from "./gui/Layers";
import { loadSettings, saveSettings } from "./gui/settingsStorage";
import { PropertyWindow } from "./gui/PropertyWindow";
import { OpeningEditor } from "./gui/OpeningEditor";
import { ColoursDialog } from "./gui/ColoursDialog";
import {
  isSelectionTarget,
  selectedTargets,
  selectionTargetNames,
  toggleRoomSelection,
  toggleOpeningSelection,
  type SelectionState,
  type SelectionTarget,
} from "./gui/selection";
import type { JsonGeoreference, JsonPlan, JsonPosition } from "./model/json/Document";
import { downloadPlan } from "./model/json/downloadPlan";
import { Plan } from "./model/Plan";
import { PlanEditor } from "./model/PlanEditor";
import type { Room } from "./model/Room";
import type { Opening } from "./model/Opening";
import type { Wall } from "./model/Wall";
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
  const [managingColours, setManagingColours] = useState(false);
  const [tool, setTool] = useState<PlanTool>();
  const [toolMessage, setToolMessage] = useState<string>();
  const [panelLayout, setPanelLayout] = useState(loadPanelLayout);
  useEffect(() => { savePanelLayout(panelLayout); }, [panelLayout]);
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

  const selectTarget = (target: SelectionTarget, toggle = false) =>
    setSelection((current) =>
      toggle && target.kind === "room"
        ? toggleRoomSelection(current, target.item)
        : toggle && target.kind === "opening"
          ? toggleOpeningSelection(current, target.item)
        : { targets: [target], activeIndex: 0 },
    );
  const toggleRoom = useCallback((room: Room) => {
    setSelection((current) => toggleRoomSelection(current, room));
  }, [setSelection]);
  const toggleOpening = useCallback((opening: Opening) => {
    setSelection((current) => toggleOpeningSelection(current, opening));
  }, [setSelection]);

  const failTool = useCallback((message: string) => {
    setToolMessage(message);
    return false;
  }, [setToolMessage]);

  const drawLine = useCallback((kind: "wall" | "fence", start: JsonPosition, end: JsonPosition) => {
    if (kind === "wall") {
      if (!currentLevel) return failTool("Select a level first.");
      const result = editPlan.addWall(currentLevel, start, end);
      if (!result.ok) return failTool(result.error);
      setSelection({ targets: [{ kind: "wall", item: result.item }], activeIndex: 0 });
    } else {
      const result = editPlan.addFence(start, end);
      if (!result.ok) return failTool(result.error);
      setSelection({ targets: [{ kind: "fence", item: result.item }], activeIndex: 0 });
    }
    setToolMessage(undefined);
    return true;
  }, [currentLevel, editPlan, failTool, setSelection, setToolMessage]);

  const placeOpening = useCallback((wall: Wall, distanceAlongWall: number) => {
    const result = editPlan.addOpeningAt(wall, distanceAlongWall);
    if (!result.ok) return failTool(result.error);
    setSelection({ targets: [{ kind: "opening", item: result.item }], activeIndex: 0 });
    setToolMessage(undefined);
    return true;
  }, [editPlan, failTool, setSelection, setToolMessage]);

  const chooseTool = useCallback((next?: PlanTool) => {
    setTool(next);
    setToolMessage(undefined);
  }, [setTool, setToolMessage]);

  const openContextMenu = useCallback(
    (target: SelectionTarget, x: number, y: number) => {
      const index = selection.targets.findIndex((selected) => isSelectionTarget(selected, target));
      const selectedRoom = target.kind === "room" && selection.rooms?.includes(target.item);
      const selectedOpening = target.kind === "opening" && selection.openings?.includes(target.item);
      if (index < 0 && !selectedRoom && !selectedOpening) return false;
      contextReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection((current) =>
        index < 0 ? { ...current, targets: [target], activeIndex: 0 } : { ...current, activeIndex: index },
      );
      setContextMenu({ target, x, y });
      return true;
    },
    [selection.targets, selection.rooms, selection.openings, setSelection, setContextMenu],
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
    chooseTool();
  };

  const mergeRooms = (retained: Room) => {
    if (!selection.rooms) return;
    const result = editPlan.mergeRooms(selection.rooms, retained);
    setContextMenu(undefined);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    setSelection({ targets: [{ kind: "room", item: retained }], activeIndex: 0 });
    setEditingTarget((current) => (current && editPlan.contains(current.item) ? current : undefined));
  };

  const mergeOpenings = (retained: Opening) => {
    if (!selection.openings) return;
    if (!window.confirm(
      "Merge these openings into one rectangle? Their separate dimensions will be lost, and their items will overlap until arranged in the opening editor.",
    )) return;
    const result = editPlan.mergeOpenings(selection.openings, retained);
    setContextMenu(undefined);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    setSelection({ targets: [{ kind: "opening", item: retained }], activeIndex: 0 });
    setEditingTarget(undefined);
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
      if (tool && event.key === "Escape") {
        event.preventDefault();
        chooseTool();
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) return;
      if (
        event.target instanceof Element &&
        event.target.closest(".property-window, .opening-editor, .colours-dialog, .object-context-menu, [contenteditable='true']")
      ) return;
      if (tool || mapDraft) return;
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
  }, [activeTarget, chooseTool, deleteTarget, tool, mapDraft, selection.activeIndex, selection.targets.length]);

  const toolsUnavailable = activeView.kind !== "2d" || !!mapDraft;
  const lockedPanels = { basemap: !!mapDraft };
  const sidebarVisible = Object.values(panelLayout).some((panel) => panel.open) || !!mapDraft;
  const toolHint = tool === "opening"
    ? "Add opening — click the wall where its centre should go · Esc to finish"
    : tool && `Add ${tool} — click the start point, then the end point · Esc to finish`;

  return (
    <PlanContext value={plan}>
      <main className="app-shell">
        <MenuBar
          onDownload={handleDownload}
          onEditSelected={activeTarget ? () => setEditingTarget(activeTarget) : undefined}
          onDeleteSelected={activeTarget && activeTarget.kind !== "roomLabel" ? () => deleteTarget(activeTarget) : undefined}
          onMergeRooms={activeTarget?.kind === "room" && selection.rooms && editPlan.canMergeRooms(selection.rooms)
            ? () => mergeRooms(activeTarget.item) : undefined}
          onMergeOpenings={activeTarget?.kind === "opening" && selection.openings && editPlan.canMergeOpenings(selection.openings)
            ? () => mergeOpenings(activeTarget.item) : undefined}
          onManageColours={() => setManagingColours(true)}
          tool={tool}
          disabledTools={{ wall: toolsUnavailable || !currentLevel, fence: toolsUnavailable, opening: toolsUnavailable || !currentLevel }}
          onToolChange={chooseTool}
          layout={panelLayout}
          onLayoutChange={setPanelLayout}
          lockedPanels={lockedPanels}
          levels={levels}
          activeLevel={activeLevel}
          onLevelSelect={selectLevel}
        />

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

        <section className={`workspace${sidebarVisible ? "" : " workspace-full"}`}>
          <Sidebar
            layout={panelLayout}
            onLayoutChange={setPanelLayout}
            locked={lockedPanels}
            panels={{
              layers: <Layers visibility={layerVisibility} onChange={setLayerVisibility} />,
              basemap: <BaseMapControls
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
                chooseTool();
                setActiveViewId("plan-2d");
              }}
              onAdjust={() => {
                if (!plan.georeference) return;
                setMapPivot(planCentre());
                setMapDraft({ ...plan.georeference });
                setChoosingMapPivot(false);
                setBaseMapSettings((current) => ({ ...current, enabled: true }));
                chooseTool();
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
            />,
              plan: <PlanTree
                plan={plan}
                activeLevel={activeLevel}
                selectedTargets={selectedTargets(selection)}
                activeTarget={activeTarget}
                onLevelSelect={selectLevel}
                onSelect={selectTarget}
                onEdit={setEditingTarget}
                onContextMenu={openContextMenu}
              />,
            }}
          />

          <Tabs.Root className="view-host" value={activeView.id} onValueChange={(id) => {
            setActiveViewId(id);
            if (id !== "plan-2d") chooseTool();
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
                onToggleOpening={toggleOpening}
                onEdit={setEditingTarget}
                onContextMenu={openContextMenu}
                tool={tool}
                onDrawLine={drawLine}
                onPlaceOpening={placeOpening}
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
              {toolHint && <div className="tool-hint" role="status">{toolMessage ?? toolHint}</div>}
            </Tabs.Content>
            <Tabs.Content className="view-panel" value="plan-3d">
              <PlanView3D
                onStatusChange={setThreeDStatus}
                selection={selection}
                onSelectionChange={setSelection}
                onToggleRoom={toggleRoom}
                onToggleOpening={toggleOpening}
                onEdit={setEditingTarget}
                onContextMenu={openContextMenu}
                version={planVersion}
              />
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
                  if (contextMenu.target.kind === "room") mergeRooms(contextMenu.target.item);
                }}
              >
                Merge rooms
              </button>
            )}
            {contextMenu.target.kind === "opening" && selection.openings && editPlan.canMergeOpenings(selection.openings) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  if (contextMenu.target.kind === "opening") mergeOpenings(contextMenu.target.item);
                }}
              >
                Merge openings
              </button>
            )}
          </div>
        )}
        {editingTarget && (editingTarget.kind === "opening" || editingTarget.kind === "door" ||
          editingTarget.kind === "slidingDoor" || editingTarget.kind === "window" || editingTarget.kind === "post") ? (
          <OpeningEditor
            opening={editingTarget.kind === "opening" ? editingTarget.item : editingTarget.opening}
            initialItem={editingTarget.kind === "opening" ? undefined : editingTarget.item}
            editPlan={editPlan}
            onClose={() => setEditingTarget(undefined)}
          />
        ) : editingTarget && (
          <PropertyWindow
            target={editingTarget}
            editPlan={editPlan}
            onClose={() => setEditingTarget(undefined)}
          />
        )}
        {managingColours && <ColoursDialog plan={plan} editor={editPlan} onClose={() => setManagingColours(false)} />}
      </main>
    </PlanContext>
  );
}

export default App;
