import { createContext } from "react";
import type { Plan } from "../model/Plan";

export const PlanContext = createContext<Plan | null>(null);