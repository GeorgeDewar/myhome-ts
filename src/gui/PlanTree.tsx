import type { MouseEvent } from "react";
import type { Plan } from "../model/Plan";
import { selectionTargetForOpeningItem, selectionTargetNames, isSelectionTarget, type SelectionTarget } from "./selection";
import "./PlanTree.css";

type PlanTreeProps = {
  plan: Plan;
  activeLevel: number;
  selectedTargets: SelectionTarget[];
  activeTarget?: SelectionTarget;
  onLevelSelect: (level: number) => void;
  onSelect: (target: SelectionTarget, toggle?: boolean) => void;
  onEdit: (target: SelectionTarget) => void;
  onContextMenu: (target: SelectionTarget, x: number, y: number) => boolean;
};

export const PlanTree = ({
  plan,
  activeLevel,
  selectedTargets = [],
  activeTarget,
  onLevelSelect,
  onSelect,
  onEdit,
  onContextMenu,
}: PlanTreeProps) => {
  const rowClassName = (target?: SelectionTarget) =>
    `tree-row${target && selectedTargets.some((selectedTarget) => isSelectionTarget(selectedTarget, target)) ? " is-selected" : ""}${target && activeTarget && isSelectionTarget(activeTarget, target) ? " is-active" : ""}`;
  const select = (target: SelectionTarget, toggle = false) => onSelect(target, toggle);
  const edit = (target: SelectionTarget) => {
    select(target);
    onEdit(target);
  };
  const contextMenu = (event: MouseEvent, target: SelectionTarget) => {
    if (onContextMenu(target, event.clientX, event.clientY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <nav>
        <details className="tree-group tree-category">
          <summary className="tree-row">
            <span>Fences</span>
            <span className="tree-count">{plan.fences.length}</span>
          </summary>
          {plan.fences.map((fence) => (
            <div
              className={`${rowClassName({ kind: "fence", item: fence })} tree-item`}
              key={fence.id}
              onClick={() => select({ kind: "fence", item: fence })}
              onDoubleClick={() => edit({ kind: "fence", item: fence })}
              onContextMenu={(event) => contextMenu(event, { kind: "fence", item: fence })}
            >
              <span>{fence.id}</span>
            </div>
          ))}
        </details>
        {plan.buildings.map((building) => (
          <details className="tree-group tree-building" key={building.name} open>
            <summary className="tree-row tree-parent">
              <span>{building.name}</span>
            </summary>
            {building.levels.map((level) => (
              <details className="tree-group tree-level" key={`${building.name}-${level.number}`} open>
                <summary
                  className={`tree-row ${level.number === activeLevel ? "is-level-active" : ""}`}
                  onClick={() => onLevelSelect(level.number)}
                >
                  <span>{level.name}</span>
                </summary>
                <details className="tree-group tree-category">
                  <summary className="tree-row">
                    <span>Walls</span>
                    <span className="tree-count">{level.walls.length}</span>
                  </summary>
                  {level.walls.map((wall) => (
                    <details className="tree-group tree-wall" key={wall.id}>
                      <summary
                        className={rowClassName({ kind: "wall", item: wall })}
                        onClick={() => select({ kind: "wall", item: wall })}
                        onDoubleClick={() => edit({ kind: "wall", item: wall })}
                        onContextMenu={(event) => contextMenu(event, { kind: "wall", item: wall })}
                      >
                        <span>{wall.id}</span>
                      </summary>
                      {wall.openings.map((opening) => (
                        <details className="tree-group tree-opening" key={opening.id}>
                          <summary
                            className={rowClassName({ kind: "opening", item: opening })}
                            onClick={(event) => select({ kind: "opening", item: opening }, event.ctrlKey || event.metaKey)}
                            onDoubleClick={() => edit({ kind: "opening", item: opening })}
                            onContextMenu={(event) => contextMenu(event, { kind: "opening", item: opening })}
                          >
                            <span>{opening.id}</span>
                          </summary>
                          {opening.contents.map((content, index) => {
                            const target = selectionTargetForOpeningItem(content, opening);
                            return (
                              <div
                                className={`${rowClassName(target)} tree-item`}
                                key={`${opening.id}-${index}`}
                                onClick={() => select(target)}
                                onDoubleClick={() => edit(target)}
                                onContextMenu={(event) => contextMenu(event, target)}
                              >
                                <span>{selectionTargetNames[target.kind]}</span>
                              </div>
                            );
                          })}
                        </details>
                      ))}
                    </details>
                  ))}
                </details>
                <details className="tree-group tree-category">
                  <summary className="tree-row">
                    <span>Rooms</span>
                    <span className="tree-count">{level.rooms.length}</span>
                  </summary>
                  {level.rooms.map((room, index) => (
                    <div
                      className={`${rowClassName({ kind: "room", item: room })} tree-room`}
                      key={`${room.name}-${index}`}
                      onClick={(event) => select({ kind: "room", item: room }, event.ctrlKey || event.metaKey)}
                      onDoubleClick={() => edit({ kind: "room", item: room })}
                      onContextMenu={(event) => contextMenu(event, { kind: "room", item: room })}
                    >
                      <span>{room.name}</span>
                    </div>
                  ))}
                </details>
              </details>
            ))}
          </details>
        ))}
    </nav>
  );
};
