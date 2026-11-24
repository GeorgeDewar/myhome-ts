import type { PlanEditor } from "../model/PlanEditor";
import type { JsonOpening } from "../model/json/Document";
import type { SelectionTarget } from "./selection";

type PropertyValues = {
  name?: string;
  labelText?: string;
  fontSize?: string;
  rotation?: string;
  virtual?: boolean;
  attic?: boolean;
  shape?: JsonOpening["shape"];
  width?: string;
  height?: string;
  startX?: string;
  startY?: string;
  endX?: string;
  endY?: string;
  distanceAlongWall?: string;
  distanceFromFloor?: string;
  hingeSide?: "left" | "right";
  swingDirection?: "in" | "out";
  thickness?: string;
  openAngle?: string;
};

export type PropertyDraft = {
  target: SelectionTarget;
  values: PropertyValues;
  initialValues: PropertyValues;
};

type DistanceField =
  "width" | "height" | "startX" | "startY" | "endX" | "endY" | "distanceAlongWall" | "distanceFromFloor" | "thickness";
export type PropertyErrors = Partial<Record<DistanceField | "fontSize" | "rotation" | "openAngle" | "shape" | "hingeSide" | "swingDirection" | "form", string>>;

export const createPropertyDraft = (target: SelectionTarget): PropertyDraft => {
  let values: PropertyValues;
  switch (target.kind) {
    case "room":
      values = { name: target.item.name };
      break;
    case "roomLabel":
      values = {
        labelText: target.item.label?.text ?? "",
        fontSize: String(target.item.label?.fontSize ?? Math.round(target.effectiveFontSize)),
        rotation: String(target.item.label?.rotation ?? 0),
      };
      break;
    case "wall":
    case "fence":
      values = {
        width: String(target.item.width.toJson()),
        ...(target.kind === "fence"
          ? { height: target.item.height === undefined ? "" : String(target.item.height.toJson()) }
          : { virtual: target.item.virtual ?? false, attic: target.item.attic ?? false }),
        startX: String(target.item.from.x.toPositionJson()),
        startY: String(target.item.from.y.toPositionJson()),
        endX: String(target.item.to.x.toPositionJson()),
        endY: String(target.item.to.y.toPositionJson()),
      };
      break;
    case "opening":
      values = {
        shape: target.item.shape ?? "rectangle",
        width: String(target.item.width.toJson()),
        distanceAlongWall: String(target.item.distanceAlongWall.toJson()),
        height: target.item.height === undefined ? "" : String(target.item.height.toJson()),
        distanceFromFloor:
          target.item.distanceFromFloor === undefined ? "" : String(target.item.distanceFromFloor.toPositionJson()),
      };
      break;
    case "door":
      values = {
        hingeSide: target.item.hingeSide,
        swingDirection: target.item.swingDirection,
        thickness: String(target.item.leafThickness.toJson()),
        openAngle: String(target.item.effectiveOpenAngle),
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
  const parseDistance = (field: DistanceField) => {
    const text = values[field] ?? initialValues[field] ?? "";
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value) || !Number.isFinite(value / 1000)) {
      errors[field] = "Enter a finite number of millimetres.";
      return undefined;
    }
    return value;
  };
  const optionalDistance = (field: "height" | "distanceFromFloor") => {
    if (values[field] === undefined || values[field] === initialValues[field]) return undefined;
    return values[field].trim() === "" ? null : parseDistance(field);
  };
  const point = (xField: "startX" | "endX", yField: "startY" | "endY"): [number, number] | undefined => {
    if (
      (values[xField] === undefined || values[xField] === initialValues[xField]) &&
      (values[yField] === undefined || values[yField] === initialValues[yField])
    )
      return undefined;
    const x = parseDistance(xField);
    const y = parseDistance(yField);
    return x === undefined || y === undefined ? undefined : [x, y];
  };
  const report = (result: { ok: true } | { ok: false; error: string; field?: Exclude<keyof PropertyErrors, "form"> }) => {
    if (result.ok) return;
    errors[result.field ?? "form"] = result.error;
  };

  switch (target.kind) {
    case "room":
      report(
        editPlan.updateRoom(target.item, {
          name: values.name !== initialValues.name ? values.name : undefined,
        }),
      );
      break;
    case "roomLabel": {
      const fontSizeText = values.fontSize ?? initialValues.fontSize ?? "";
      const rotationText = values.rotation ?? initialValues.rotation ?? "";
      const fontSize = fontSizeText.trim() === "" ? null : Number(fontSizeText);
      const rotation = rotationText.trim() === "" ? null : Number(rotationText);
      if (fontSize !== null && (!Number.isInteger(fontSize) || fontSize <= 0)) {
        errors.fontSize = "Enter a positive integer number of millimetres.";
      }
      if (rotation !== null && !Number.isFinite(rotation)) errors.rotation = "Enter a finite angle.";
      if (Object.keys(errors).length > 0) break;
      report(editPlan.updateRoom(target.item, {
        label: {
          text: values.labelText !== undefined && values.labelText !== initialValues.labelText
            ? (values.labelText === "" ? null : values.labelText) : undefined,
          fontSize: fontSizeText !== initialValues.fontSize ? fontSize : undefined,
          rotation: rotationText !== initialValues.rotation ? rotation : undefined,
        },
      }));
      break;
    }
    case "wall": {
      const width =
        values.width !== undefined && values.width !== initialValues.width ? parseDistance("width") : undefined;
      const start = point("startX", "startY");
      const end = point("endX", "endY");
      const virtual = values.virtual !== initialValues.virtual ? values.virtual : undefined;
      const attic = values.attic !== initialValues.attic ? values.attic : undefined;
      if (
        Object.keys(errors).length === 0 &&
        (width !== undefined || start !== undefined || end !== undefined || virtual !== undefined || attic !== undefined)
      ) {
        report(editPlan.updateWall(target.item, { width, start, end, virtual, attic }));
      }
      break;
    }
    case "fence": {
      const width =
        values.width !== undefined && values.width !== initialValues.width ? parseDistance("width") : undefined;
      const height = optionalDistance("height");
      const start = point("startX", "startY");
      const end = point("endX", "endY");
      if (Object.keys(errors).length === 0) report(editPlan.updateFence(target.item, { width, height, start, end }));
      break;
    }
    case "opening": {
      const width = parseDistance("width");
      const distance = parseDistance("distanceAlongWall");
      const height = optionalDistance("height");
      const floor = optionalDistance("distanceFromFloor");
      if (width === undefined || distance === undefined || Object.keys(errors).length > 0) break;
      report(
        editPlan.updateOpening(target.item, {
          shape: values.shape !== initialValues.shape ? values.shape : undefined,
          width: values.width !== initialValues.width ? width : undefined,
          distanceAlongWall: values.distanceAlongWall !== initialValues.distanceAlongWall ? distance : undefined,
          height,
          distanceFromFloor: floor,
        }),
      );
      break;
    }
    case "door": {
      const thickness = parseDistance("thickness");
      const angleText = values.openAngle ?? initialValues.openAngle ?? "";
      const angle = Number(angleText);
      if (angleText.trim() === "" || !Number.isFinite(angle) || angle < 0 || angle > 180) {
        errors.openAngle = "Enter an angle between 0 and 180 degrees.";
      }
      if (thickness === undefined || errors.openAngle) break;
      report(
        editPlan.updateDoor(target.item, {
          hingeSide: values.hingeSide !== initialValues.hingeSide ? values.hingeSide : undefined,
          swingDirection: values.swingDirection !== initialValues.swingDirection ? values.swingDirection : undefined,
          thickness: values.thickness !== initialValues.thickness ? thickness : undefined,
          openAngle: values.openAngle !== initialValues.openAngle ? angle : undefined,
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
