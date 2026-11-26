import { GripVertical, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { PlanEditor } from "../model/PlanEditor";
import { applyPropertyDraft, createPropertyDraft, type PropertyDraft, type PropertyErrors } from "./propertyDraft";
import { selectionTargetNames, type SelectionTarget } from "./selection";
import "./PropertyWindow.css";

type PropertyWindowProps = {
  target: SelectionTarget;
  editPlan: PlanEditor;
  onClose: () => void;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};
type Values = PropertyDraft["values"];

const DistanceField = ({
  label,
  field,
  values,
  errors,
  onChange,
  placeholder,
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
    | "thickness"
    | "widthTop" | "widthRight" | "widthBottom" | "widthLeft" | "depth";
  values: Values;
  errors: PropertyErrors;
  onChange: (values: Partial<Values>) => void;
  placeholder?: string;
}) => (
  <label>
    {label}
    <input
      type="number"
      step="any"
      value={values[field] ?? ""}
      placeholder={placeholder}
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

export const PropertyWindow = ({ target, editPlan, onClose, embedded = false, onDirtyChange }: PropertyWindowProps) => {
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
    const nextValues = { ...draft.values, ...values };
    onDirtyChange?.(Object.keys(nextValues).some((key) =>
      nextValues[key as keyof Values] !== draft.initialValues[key as keyof Values],
    ));
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
      onDirtyChange?.(false);
      onClose();
    } else {
      setEditor({ draft: createPropertyDraft(target), errors: {} });
      onDirtyChange?.(false);
    }
  };

  return (
    <section className={`property-window${embedded ? " property-window-embedded" : ""}`}
      style={embedded ? undefined : { left: position.x, top: position.y }} aria-label={title}>
      <header className="property-window-titlebar" onMouseDown={embedded ? undefined : startDrag}>
        {!embedded && <GripVertical size={16} aria-hidden="true" />}
        <span>{title}</span>
        {!embedded && <button type="button" className="property-window-close" aria-label="Close properties" onClick={onClose}>
          <X size={16} />
        </button>}
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
        {target.kind === "roomLabel" && (
          <>
            <label>
              Room name
              <input value={target.item.name} readOnly />
            </label>
            <label>
              Label text (optional)
              <textarea
                value={draft.values.labelText ?? ""}
                placeholder="Uses room name"
                onChange={(event) => updateValues({ labelText: event.target.value })}
                autoFocus
              />
            </label>
            <label>
              Font size (mm)
              <input
                type="number" step="1" min="1"
                value={draft.values.fontSize ?? ""}
                placeholder="Automatic"
                aria-invalid={!!errors.fontSize}
                aria-describedby={errors.fontSize ? "property-fontSize-error" : undefined}
                onChange={(event) => updateValues({ fontSize: event.target.value })}
              />
              {errors.fontSize && <span className="property-error" id="property-fontSize-error" role="alert">{errors.fontSize}</span>}
            </label>
            <label>
              Rotation (degrees)
              <input
                type="number" step="any"
                value={draft.values.rotation ?? ""}
                placeholder="0"
                aria-invalid={!!errors.rotation}
                aria-describedby={errors.rotation ? "property-rotation-error" : undefined}
                onChange={(event) => updateValues({ rotation: event.target.value })}
              />
              {errors.rotation && <span className="property-error" id="property-rotation-error" role="alert">{errors.rotation}</span>}
            </label>
          </>
        )}
        {target.kind === "wall" && (
          <>
            <label>
              Wall ID
              <input value={target.item.id} readOnly />
            </label>
            <label className="property-checkbox">
              <input
                type="checkbox"
                checked={draft.values.virtual ?? false}
                onChange={(event) => updateValues({ virtual: event.target.checked })}
              />
              Virtual
            </label>
            <label className="property-checkbox">
              <input
                type="checkbox"
                checked={draft.values.attic ?? false}
                onChange={(event) => updateValues({ attic: event.target.checked })}
              />
              Attic
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
            <label>
              Shape
              <select
                value={draft.values.shape}
                aria-invalid={!!errors.shape}
                aria-describedby={errors.shape ? "property-shape-error" : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "rectangle" || value === "halfCircleArch") updateValues({ shape: value });
                }}
              >
                <option value="rectangle">Rectangle</option>
                <option value="halfCircleArch">Half-circle arch</option>
              </select>
              {errors.shape && (
                <span className="property-error" id="property-shape-error" role="alert">
                  {errors.shape}
                </span>
              )}
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
                aria-invalid={!!errors.hingeSide}
                aria-describedby={errors.hingeSide ? "property-hingeSide-error" : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "left" || value === "right") updateValues({ hingeSide: value });
                }}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
              {errors.hingeSide && (
                <span className="property-error" id="property-hingeSide-error" role="alert">
                  {errors.hingeSide}
                </span>
              )}
            </label>
            <label>
              Swing direction
              <select
                value={draft.values.swingDirection}
                aria-invalid={!!errors.swingDirection}
                aria-describedby={errors.swingDirection ? "property-swingDirection-error" : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "in" || value === "out") updateValues({ swingDirection: value });
                }}
              >
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
              {errors.swingDirection && (
                <span className="property-error" id="property-swingDirection-error" role="alert">
                  {errors.swingDirection}
                </span>
              )}
            </label>
            <label>
              Open angle (degrees)
              <input
                type="number"
                min="0"
                max="180"
                step="any"
                value={draft.values.openAngle ?? ""}
                aria-invalid={!!errors.openAngle}
                aria-describedby={errors.openAngle ? "property-openAngle-error" : undefined}
                onChange={(event) => updateValues({ openAngle: event.target.value })}
              />
              {errors.openAngle && (
                <span className="property-error" id="property-openAngle-error" role="alert">
                  {errors.openAngle}
                </span>
              )}
            </label>
          </>
        )}
        {(target.kind === "window" || target.kind === "slidingDoor" || target.kind === "post") && (
          <label>
            Opening
            <input value={target.opening.id} readOnly />
          </label>
        )}
        {target.kind === "window" && (
          <>
            <label>
              Window type
              <select value={draft.values.windowType} aria-invalid={!!errors.windowType}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "awning" || value === "fixed") updateValues({ windowType: value });
                }}>
                <option value="awning">Awning</option>
                <option value="fixed">Fixed</option>
              </select>
              {errors.windowType && <span className="property-error" role="alert">{errors.windowType}</span>}
            </label>
            <DistanceField label="Sash top width (mm, optional)" field="widthTop" values={draft.values} errors={errors} onChange={updateValues} placeholder="35" />
            <DistanceField label="Sash right width (mm, optional)" field="widthRight" values={draft.values} errors={errors} onChange={updateValues} placeholder="35" />
            <DistanceField label="Sash bottom width (mm, optional)" field="widthBottom" values={draft.values} errors={errors} onChange={updateValues} placeholder="35" />
            <DistanceField label="Sash left width (mm, optional)" field="widthLeft" values={draft.values} errors={errors} onChange={updateValues} placeholder="35" />
            <DistanceField label="Sash depth (mm, optional)" field="depth" values={draft.values} errors={errors} onChange={updateValues} placeholder="35" />
          </>
        )}
        {target.kind === "post" && <p>No other properties are available yet.</p>}
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
