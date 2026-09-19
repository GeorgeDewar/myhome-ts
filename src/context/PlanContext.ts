import { createContext } from "react";
import type { JsonPlan } from "../model/json/Document";

export const PlanContext = createContext<JsonPlan | null>(null);