import type { Plan } from "../model/Plan";
import "./PlanTree.css";

type PlanTreeProps = {
  plan: Plan;
  activeLevel: number;
};

export const PlanTree = ({ plan, activeLevel }: PlanTreeProps) => (
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
              <summary className={`tree-row ${level.number === activeLevel ? "is-active" : ""}`}>
                <span>{level.name}</span>
              </summary>
              <details className="tree-group tree-category">
                <summary className="tree-row">
                  <span>Walls</span>
                  <span className="tree-count">{level.walls.length}</span>
                </summary>
                {level.walls.map((wall) => (
                  <details className="tree-group tree-wall" key={wall.id}>
                    <summary className="tree-row">
                      <span>{wall.id}</span>
                    </summary>
                    {wall.openings.map((opening) => (
                      <details className="tree-group tree-opening" key={opening.id}>
                        <summary className="tree-row">
                          <span>{opening.id}</span>
                        </summary>
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
                <summary className="tree-row">
                  <span>Rooms</span>
                  <span className="tree-count">{level.rooms.length}</span>
                </summary>
                {level.rooms.map((room, index) => (
                  <div className="tree-row tree-room" key={`${room.name}-${index}`}>
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