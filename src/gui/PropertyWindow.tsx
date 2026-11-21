import { GripVertical, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { PlanEditor } from "../model/PlanEditor";
import { applyPropertyDraft, createPropertyDraft, type PropertyDraft, type PropertyErrors } from "./propertyDraft";
import { selectionTargetNames, type SelectionTarget } from "./selection";
import "./PropertyWindow.css";

type PropertyWindowProps = { target: SelectionTarget; editPlan: PlanEditor; onClose: () => void };
type Values = PropertyDraft["values"];

const DistanceField = ({
  label,
  field,
  values,
  errors,
  onChange,
}: {
  label: string;
  field:
    | "width"
    | "height"
    | "startX"
    | "startY"
    | "endX"
    | "endY"
    | "distanceAlongWall"
    | "distanceFromFloor"
    | "thickness";
  values: Values;
  errors: PropertyErrors;
  onChange: (values: Partial<Values>) => void;
}) => (
  <label>
    {label}
    <input
      type="number"
      step="any"
      value={values[field] ?? ""}
      aria-invalid={!!errors[field]}
      aria-describedby={errors[field] ? `property-${field}-error` : undefined}
      onChange={(event) => onChange({ [field]: event.target.value })}
    />
    {errors[field] && (
      <span className="property-error" id={`property-${field}-error`} role="alert">
        {errors[field]}
      </span>
    )}
  </label>
);

export const PropertyWindow = ({ target, editPlan, onClose }: PropertyWindowProps) => {
  const [position, setPosition] = useState({ x: 288, y: 88 });
  const [editor, setEditor] = useState<{ draft: PropertyDraft; errors: PropertyErrors }>(() => ({
    draft: createPropertyDraft(target),
    errors: {},
  }));
  if (editor.draft.target.item !== target.item || editor.draft.target.kind !== target.kind) {
    setEditor({ draft: createPropertyDraft(target), errors: {} });
  }
  const { draft, errors } = editor;
  const dragOriginRef = useRef<{ pointerX: number; pointerY: number; windowX: number; windowY: number } | undefined>(
    undefined,
  );
  const dragCleanupRef = useRef<() => void>(() => undefined);
  const title = `${selectionTargetNames[target.kind]} Properties`;

  const startDrag = (event: MouseEvent<HTMLDivElement>) => {
    dragOriginRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      windowX: position.x,
      windowY: position.y,
    };
    const drag = (moveEvent: globalThis.MouseEvent) => {
      const dragOrigin = dragOriginRef.current;
      if (!dragOrigin) return;
      setPosition({
        x: dragOrigin.windowX + moveEvent.clientX - dragOrigin.pointerX,
        y: dragOrigin.windowY + moveEvent.clientY - dragOrigin.pointerY,
      });
    };
    const stopDrag = () => {
      dragOriginRef.current = undefined;
      window.removeEventListener("mousemove", drag);
      window.removeEventListener("mouseup", stopDrag);
      dragCleanupRef.current = () => undefined;
    };
    dragCleanupRef.current();
    window.addEventListener("mousemove", drag);
    window.addEventListener("mouseup", stopDrag);
    dragCleanupRef.current = stopDrag;
  };

  useEffect(() => () => dragCleanupRef.current(), []);

  const updateValues = (values: Partial<Values>) => {
    setEditor((current) => ({
      draft: { ...current.draft, values: { ...current.draft.values, ...values } },
      errors: Object.fromEntries(Object.entries(current.errors).filter(([field]) => !(field in values))),
    }));
  };

  const apply = (close: boolean) => {
    const errors = applyPropertyDraft(draft, editPlan);
    if (Object.keys(errors).length > 0) {
      setEditor({ draft, errors });
    } else if (close) {
      onClose();
    } else {
      setEditor({ draft: createPropertyDraft(target), errors: {} });
    }
  };

  return (
    <section className="property-window" style={{ left: position.x, top: position.y }} aria-label={title}>
      <header className="property-window-titlebar" onMouseDown={startDrag}>
        <GripVertical size={16} aria-hidden="true" />
        <span>{title}</span>
        <button type="button" className="property-window-close" aria-label="Close properties" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <form
        className="property-window-body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          apply(true);
        }}
      >
        {target.kind === "room" && (
          <>
            <label>
              Name
              <input
                value={draft.values.name ?? ""}
                onChange={(event) => updateValues({ name: event.target.value })}
                autoFocus
              />
            </label>
            <fieldset>
              <legend>Walls in order</legend>
              {target.item.level?.walls.map((wall) => {
                const walls = draft.walls ?? target.item.walls;
                return (
                  <label key={wall.id} className="wall-option">
                    <input
                      type="checkbox"
                      checked={walls.includes(wall)}
                      onChange={(event) =>
                        setEditor((current) => ({
                          ...current,
                          draft: {
                            ...current.draft,
                            walls: event.target.checked ? [...walls, wall] : walls.filter((item) => item !== wall),
                          },
                        }))
                      }
                    />
                    {walls.includes(wall) ? `${walls.indexOf(wall) + 1}. ` : ""}
                    {wall.id}
                  </label>
                );
              })}
            </fieldset>
          </>
        )}
        {target.kind === "wall" && (
          <>
            <label>
              Wall ID
              <input value={target.item.id} readOnly />
            </label>
            <DistanceField
              label="Width (mm)"
              field="width"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
          </>
        )}
        {target.kind === "fence" && (
          <>
            <label>
              Fence ID
              <input value={target.item.id} readOnly />
            </label>
            <DistanceField
              label="Width (mm)"
              field="width"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
            <DistanceField
              label="Height (mm, optional)"
              field="height"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
          </>
        )}
        {(target.kind === "wall" || target.kind === "fence") && (
          <>
            <DistanceField
              label="Start X (mm)"
              field="startX"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
            <DistanceField
              label="Start Y (mm)"
              field="startY"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
            <DistanceField
              label="End X (mm)"
              field="endX"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
            <DistanceField
              label="End Y (mm)"
              field="endY"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
          </>
        )}
        {target.kind === "opening" && (
          <>
            <label>
              Opening ID
              <input value={target.item.id} readOnly />
            </label>
            <DistanceField
              label="Width (mm)"
              field="width"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
            <DistanceField
              label="Distance along wall (mm)"
              field="distanceAlongWall"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
            <DistanceField
              label="Height (mm, optional)"
              field="height"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
            <DistanceField
              label="Distance from floor (mm, optional)"
              field="distanceFromFloor"
              values={draft.values}
              errors={errors}
              onChange={updateValues}
            />
          </>
        )}
        {target.kind === "door" && (
          <>
            <label>
              Opening
              <input value={target.opening.id} readOnly />
            </label>
            <label>
              Hinge side
              <select
                value={draft.values.hingeSide}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "left" || value === "right") updateValues({ hingeSide: value });
                }}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              Swing direction
              <select
                value={draft.values.swingDirection}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "in" || value === "out") updateValues({ swingDirection: value });
                }}
              >
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </label>
          </>
        )}
        {(target.kind === "window" || target.kind === "slidingDoor") && (
          <label>
            Opening
            <input value={target.opening.id} readOnly />
          </label>
        )}
        {(target.kind === "door" || target.kind === "slidingDoor") && (
          <DistanceField
            label="Leaf thickness (mm)"
            field="thickness"
            values={draft.values}
            errors={errors}
            onChange={updateValues}
          />
        )}
        {errors.form && (
          <div className="property-error" role="alert">
            {errors.form}
          </div>
        )}
        <div className="property-window-actions">
          <button type="button" onClick={() => apply(false)}>
            Apply
          </button>
          <button type="submit">OK</button>
        </div>
      </form>
    </section>
  );
};
