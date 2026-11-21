import { GripVertical, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { PlanEditor } from "../model/PlanEditor";
import { applyPropertyDraft, createPropertyDraft, type PropertyDraft, type PropertyErrors } from "./propertyDraft";
import type { SelectionTarget } from "./selection";
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
  field: "width" | "distanceAlongWall" | "thickness";
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
  const title = `${target.kind === "slidingDoor" ? "Sliding Door" : `${target.kind[0].toUpperCase()}${target.kind.slice(1)}`} Properties`;

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
          <label>
            Name
            <input
              value={draft.values.name ?? ""}
              onChange={(event) => updateValues({ name: event.target.value })}
              autoFocus
            />
          </label>
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
