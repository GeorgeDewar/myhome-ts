import type { Plan } from "../model/Plan";
import { selectionTargetForOpeningItem, isSelectionTarget, type SelectionTarget } from "./selection";
import "./PlanTree.css";

type PlanTreeProps = {
  plan: Plan;
  activeLevel: number;
  selectedTargets: SelectionTarget[];
  activeTarget?: SelectionTarget;
  onLevelSelect: (level: number) => void;
  onSelect: (target: SelectionTarget) => void;
  onEdit: (target: SelectionTarget) => void;
};

export const PlanTree = ({
  plan,
  activeLevel,
  selectedTargets = [],
  activeTarget,
  onLevelSelect,
  onSelect,
  onEdit,
}: PlanTreeProps) => {
  const rowClassName = (target?: SelectionTarget) =>
    `tree-row${target && selectedTargets.some((selectedTarget) => isSelectionTarget(selectedTarget, target)) ? " is-selected" : ""}${target && activeTarget && isSelectionTarget(activeTarget, target) ? " is-active" : ""}`;
  const select = (target: SelectionTarget) => onSelect(target);
  const edit = (target: SelectionTarget) => {
    select(target);
    onEdit(target);
  };

  return (
    <aside className="plan-tree" aria-label="Plan hierarchy">
      <div className="panel-heading">Plan</div>
      <nav>
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
                      >
                        <span>{wall.id}</span>
                      </summary>
                      {wall.openings.map((opening) => (
                        <details className="tree-group tree-opening" key={opening.id}>
                          <summary
                            className={rowClassName({ kind: "opening", item: opening })}
                            onClick={() => select({ kind: "opening", item: opening })}
                            onDoubleClick={() => edit({ kind: "opening", item: opening })}
                          >
                            <span>{opening.id}</span>
                          </summary>
                          {opening.contents.map((content, index) => (
                            <div
                              className={`${rowClassName(selectionTargetForOpeningItem(content, opening))} tree-item`}
                              key={`${opening.id}-${index}`}
                              onClick={() => select(selectionTargetForOpeningItem(content, opening))}
                              onDoubleClick={() => edit(selectionTargetForOpeningItem(content, opening))}
                            >
                              <span>
                                {content.type === "StandardDoor"
                                  ? "Standard Door"
                                  : content.type === "SlidingDoor"
                                    ? "Sliding Door"
                                    : "Standard Window"}
                              </span>
                            </div>
                          ))}
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
                      onClick={() => select({ kind: "room", item: room })}
                      onDoubleClick={() => edit({ kind: "room", item: room })}
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
    </aside>
  );
};
