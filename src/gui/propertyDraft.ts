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

export type PropertyErrors = Partial<Record<"width" | "distanceAlongWall" | "thickness" | "form", string>>;

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

export const applyPropertyDraft = (draft: PropertyDraft, editPlan: PlanEditor): PropertyErrors => {
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
  const report = (
    result: { ok: true } | { ok: false; error: string; field?: string },
    fallback: keyof PropertyErrors = "form",
  ) => {
    if (result.ok) return;
    const field = result.field;
    if (field === "width" || field === "distanceAlongWall" || field === "thickness") {
      errors[field] = result.error;
    } else {
      errors[fallback] = result.error;
    }
  };

  switch (target.kind) {
    case "room":
      report(editPlan.updateRoom(target.item, { name: values.name !== initialValues.name ? values.name : undefined }));
      break;
    case "wall":
      if (values.width !== initialValues.width) {
        const width = parseDistance("width");
        if (width !== undefined) {
          report(editPlan.updateWall(target.item, { width }), "width");
        }
      }
      break;
    case "opening": {
      const width = parseDistance("width");
      const distance = parseDistance("distanceAlongWall");
      if (width === undefined || distance === undefined) break;
      report(
        editPlan.updateOpening(target.item, {
          width: values.width !== initialValues.width ? width : undefined,
          distanceAlongWall: values.distanceAlongWall !== initialValues.distanceAlongWall ? distance : undefined,
        }),
      );
      break;
    }
    case "door": {
      const thickness = parseDistance("thickness");
      if (thickness === undefined) break;
      report(
        editPlan.updateDoor(target.item, {
          hingeSide: values.hingeSide !== initialValues.hingeSide ? values.hingeSide : undefined,
          swingDirection: values.swingDirection !== initialValues.swingDirection ? values.swingDirection : undefined,
          thickness: values.thickness !== initialValues.thickness ? thickness : undefined,
        }),
      );
      break;
    }
    case "slidingDoor": {
      const thickness = parseDistance("thickness");
      if (thickness === undefined) break;
      report(
        editPlan.updateSlidingDoor(target.item, {
          thickness: values.thickness !== initialValues.thickness ? thickness : undefined,
        }),
      );
      break;
    }
    case "window":
      break;
  }
  return errors;
};
