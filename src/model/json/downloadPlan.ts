import type { Plan } from "../Plan";
import { formatPlanJson } from "./formatPlanJson";

export async function downloadPlan(plan: Plan) {
  const json = await formatPlanJson(plan);
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  try {
    link.href = url;
    link.download = "myhome.json";
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Let the browser consume the URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
