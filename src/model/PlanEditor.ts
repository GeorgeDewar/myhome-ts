import { Distance } from "./geom/Distance";
import type { Plan } from "./Plan";
import type { Wall } from "./Wall";

type WallUpdate = { width?: number };
type EditResult = { ok: true } | { ok: false; error: string };

export class PlanEditor {
  constructor(
    private plan: Plan,
    private onChange: () => void,
  ) {}

  updateWall(wall: Wall, update: WallUpdate): EditResult {
    const belongsToPlan = this.plan.buildings.some((building) =>
      building.levels.some((level) => level.walls.includes(wall)),
    );
    if (!belongsToPlan) return { ok: false, error: "This wall is no longer in the plan." };

    let changed = false;
    if (update.width !== undefined) {
      const width = update.width / 1000;
      if (!Number.isFinite(update.width) || !Number.isFinite(width) || update.width <= 0) {
        return { ok: false, error: "Wall width must be a positive, finite number of millimetres." };
      }
      const distance = new Distance(width);
      if (distance.toJson() <= 0) {
        return { ok: false, error: "Wall width is too small to save." };
      }

      if (wall.explicitWidth?.metres !== width) {
        wall.explicitWidth = distance;
        changed = true;
      }
    }

    if (changed) this.onChange();
    return { ok: true };
  }
}
