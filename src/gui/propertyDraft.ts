import { Distance } from "../model/geom/Distance";
import type { PlanEditor } from "../model/PlanEditor";
import type { SelectionTarget } from "./selection";

type PropertyValues = {
  name?: string;
  width?: string;
  distanceAlongWall?: string;
  hingeSide?: "left" | "right";
  swingDirection?: "in" | "out";
  thickness?: string;
};

export type PropertyDraft = { target: SelectionTarget; values: PropertyValues; initialValues: PropertyValues };

export type PropertyErrors = Partial<Record<"width" | "distanceAlongWall" | "thickness", string>>;

export const createPropertyDraft = (target: SelectionTarget): PropertyDraft => {
  let values: PropertyValues;
  switch (target.kind) {
    case "room":
      values = { name: target.item.name };
      break;
    case "wall":
      values = { width: String(target.item.width.toJson()) };
      break;
    case "opening":
      values = {
        width: String(target.item.width.toJson()),
        distanceAlongWall: String(target.item.distanceAlongWall.toJson()),
      };
      break;
    case "door":
      values = {
        hingeSide: target.item.hingeSide,
        swingDirection: target.item.swingDirection,
        thickness: String(target.item.leafThickness.toJson()),
      };
      break;
    case "slidingDoor":
      values = { thickness: String(target.item.leafThickness.toJson()) };
      break;
    case "window":
      values = {};
      break;
  }
  return { target, values, initialValues: values };
};

export const applyPropertyDraft = (
  draft: PropertyDraft,
  editPlan: PlanEditor,
  onChange: () => void,
): PropertyErrors => {
  const { target, values, initialValues } = draft;
  const errors: PropertyErrors = {};
  const parseDistance = (field: "width" | "distanceAlongWall" | "thickness") => {
    const text = values[field] ?? "";
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value) || !Number.isFinite(value / 1000)) {
      errors[field] = "Enter a finite number of millimetres.";
      return undefined;
    }
    return value;
  };

  switch (target.kind) {
    case "room":
      if (values.name !== undefined && values.name !== initialValues.name) {
        target.item.name = values.name;
        onChange();
      }
      break;
    case "wall":
      if (values.width !== initialValues.width) {
        const width = parseDistance("width");
        if (width !== undefined) {
          const result = editPlan.updateWall(target.item, { width });
          if (!result.ok) errors.width = result.error;
        }
      }
      break;
    case "opening": {
      const width = parseDistance("width");
      const distance = parseDistance("distanceAlongWall");
      if (width === undefined || distance === undefined) break;
      let changed = false;
      if (values.width !== initialValues.width) {
        target.item.width = Distance.fromJson(width);
        changed = true;
      }
      if (values.distanceAlongWall !== initialValues.distanceAlongWall) {
        target.item.distanceAlongWall = Distance.fromJson(distance);
        changed = true;
      }
      if (changed) onChange();
      break;
    }
    case "door": {
      const thickness = parseDistance("thickness");
      if (thickness === undefined) break;
      let changed = false;
      if (values.hingeSide !== undefined && values.hingeSide !== initialValues.hingeSide) {
        target.item.hingeSide = values.hingeSide;
        changed = true;
      }
      if (values.swingDirection !== undefined && values.swingDirection !== initialValues.swingDirection) {
        target.item.swingDirection = values.swingDirection;
        changed = true;
      }
      if (values.thickness !== initialValues.thickness) {
        target.item.thickness = Distance.fromJson(thickness);
        changed = true;
      }
      if (changed) onChange();
      break;
    }
    case "slidingDoor": {
      const thickness = parseDistance("thickness");
      if (thickness === undefined) break;
      if (values.thickness !== initialValues.thickness) {
        target.item.thickness = Distance.fromJson(thickness);
        onChange();
      }
      break;
    }
    case "window":
      break;
  }
  return errors;
};
