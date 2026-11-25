import { useEffect, useRef, useState } from "react";
import type { Opening, OpeningItem } from "../model/Opening";
import { arrangementWarnings, emptySpaceMarkers, itemRectangle, largestEmptyRectangle, openingSize, type ItemRectangle } from "../model/geom/openingArrangement";
import type { PlanEditor } from "../model/PlanEditor";
import { PropertyWindow } from "./PropertyWindow";
import { selectionTargetForOpeningItem, selectionTargetNames, type SelectionTarget } from "./selection";
import "./OpeningEditor.css";

export const OpeningEditor = ({
  opening,
  initialItem,
  editPlan,
  onClose,
}: {
  opening: Opening;
  initialItem?: OpeningItem;
  editPlan: PlanEditor;
  onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<SelectionTarget>(() =>
    initialItem ? selectionTargetForOpeningItem(initialItem, opening) : { kind: "opening", item: opening },
  );
  const [dirty, setDirty] = useState(false);
  const [geometryDirty, setGeometryDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [gapPoint, setGapPoint] = useState<{ x: number; y: number }>();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const close = () => {
    if ((dirty || geometryDirty) && !window.confirm("Discard unapplied changes?")) return;
    onClose();
  };
  const select = (target: SelectionTarget) => {
    if (target.item === selected.item && target.kind === selected.kind) return;
    if ((dirty || geometryDirty) && !window.confirm("Discard unapplied changes?")) return;
    setDirty(false);
    setGeometryDirty(false);
    setMessage("");
    setGapPoint(undefined);
    setSelected(target);
  };

  const { width, height } = openingSize(opening);
  const rectangles = opening.contents.map((item) => itemRectangle(opening, item));
  const warnings = arrangementWarnings(width, height, rectangles);
  const gap = gapPoint && opening.shape !== "halfCircleArch"
    ? largestEmptyRectangle(width, height, rectangles, gapPoint) : undefined;
  const markers = opening.shape === "halfCircleArch" ? [] : emptySpaceMarkers(width, height, rectangles);
  const chooseSpace = (point: { x: number; y: number }) => {
    if (!largestEmptyRectangle(width, height, rectangles, point)) {
      setGapPoint(undefined);
      setMessage("There is no usable empty rectangle at that position.");
      return;
    }
    setMessage("");
    setGapPoint(point);
  };
  const archHeight = Math.min(width / 2, height);
  const outline =
    opening.shape === "halfCircleArch"
      ? `M 0 ${height} V ${archHeight} A ${width / 2} ${archHeight} 0 0 1 ${width} ${archHeight} V ${height} Z`
      : `M 0 0 H ${width} V ${height} H 0 Z`;

  return (
    <dialog
      ref={dialogRef}
      className="opening-editor"
      aria-labelledby="opening-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="opening-editor-header">
        <h2 id="opening-editor-title">Opening editor: {opening.id}</h2>
        <button type="button" aria-label="Close opening editor" onClick={close}>
          ×
        </button>
      </header>
      <div className="opening-editor-layout">
        <section className="opening-editor-overview" aria-label="Opening overview">
          <h3>Face-on view</h3>
          <svg
            className="opening-editor-diagram"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Opening outline"
            onClick={(event) => {
              if (opening.shape === "halfCircleArch") {
                setMessage("Click-to-add is not available for arched openings.");
                return;
              }
              const transform = event.currentTarget.getScreenCTM();
              if (!transform) {
                setMessage("Could not locate the selected space in the diagram.");
                return;
              }
              const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
              chooseSpace({ x: point.x, y: point.y });
            }}
          >
            <path d={outline} fill="#f0f4f8" stroke="#486581" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {opening.contents.map((item, index) => {
              const rectangle = rectangles[index];
              return <rect key={index} {...rectangle}
                fill={item.type === "Post" ? "#a97956" : item.type === "StandardWindow" ? "#a4cedd" : "#cdb496"}
                fillOpacity="0.7" stroke={selected.item === item ? "#d64545" : "#486581"}
                strokeWidth={selected.item === item ? 3 : 1} vectorEffect="non-scaling-stroke"
                onClick={(event) => {
                  event.stopPropagation();
                  select(selectionTargetForOpeningItem(item, opening));
                }} />;
            })}
            {gap && <rect {...gap} fill="#2680c2" fillOpacity="0.3" stroke="#2680c2"
              strokeWidth="2" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {markers.map((marker, index) => <g key={index} role="button" tabIndex={0}
              aria-label={`Add item in empty space ${index + 1}`}
              onClick={(event) => { event.stopPropagation(); chooseSpace(marker); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  chooseSpace(marker);
                }
              }}>
              <text x={marker.x} y={marker.y} textAnchor="middle" dominantBaseline="central"
                fontSize={marker.size} fill="#2680c2">+</text>
            </g>)}
          </svg>
          <p>Outline uses saved dimensions{opening.height === undefined ? " and the default display height" : ""}.</p>
          <p>Positions are measured from the top-left of the opening. Select an item in the diagram or list.</p>
          {opening.shape !== "halfCircleArch" && <p>Click empty space to add an item there.</p>}
          {warnings.overlap && <p role="status">Warning: opening items overlap.</p>}
          {opening.shape === "halfCircleArch"
            ? <p role="status">Adding items and gap checking are unavailable for arched openings; item bounds are checked against the rectangular outline only.</p>
            : warnings.gap && <p role="status">Warning: the opening contains gaps.</p>}
          <div className="opening-editor-items" aria-label="Opening items">
            <button
              type="button"
              aria-pressed={selected.kind === "opening"}
              onClick={() => select({ kind: "opening", item: opening })}
            >
              Opening properties
            </button>
            {opening.contents.map((item, index) => {
              const target = selectionTargetForOpeningItem(item, opening);
              return (
                <button type="button" key={index} aria-pressed={selected.item === item} onClick={() => select(target)}>
                  {index + 1}. {selectionTargetNames[target.kind]}
                </button>
              );
            })}
            {opening.contents.length === 0 && <p>This opening has no items.</p>}
          </div>
          {gap && <div className="opening-editor-gap" aria-label="Add item in selected space">
            <p>Choose an item for the highlighted space:</p>
            {(["StandardWindow", "StandardDoor", "SlidingDoor", "Post"] as const).map((type) =>
              <button key={type} type="button" onClick={() => {
                if ((dirty || geometryDirty) && !window.confirm("Discard unapplied changes?")) return;
                const result = editPlan.addOpeningItem(opening, type, gap);
                if (!result.ok) { setMessage(result.error); return; }
                setDirty(false);
                setGeometryDirty(false);
                setMessage("");
                setGapPoint(undefined);
                setSelected(selectionTargetForOpeningItem(result.item, opening));
              }}>Add {type === "StandardWindow" ? "window" : type === "StandardDoor" ? "door" : type === "SlidingDoor" ? "sliding door" : "post"} here</button>)}
            <button type="button" onClick={() => setGapPoint(undefined)}>Cancel</button>
          </div>}
          {selected.kind !== "opening" && "opening" in selected && <button type="button" onClick={() => {
            if ((dirty || geometryDirty) && !window.confirm("Discard unapplied changes?")) return;
            const result = editPlan.deleteOpeningItem(selected.item);
            if (!result.ok) { setMessage(result.error); return; }
            setDirty(false);
            setGeometryDirty(false);
            setMessage("");
            setGapPoint(undefined);
            setSelected({ kind: "opening", item: opening });
          }}>Remove selected item</button>}
          {message && <p role="alert">{message}</p>}
        </section>
        <div>
          {selected.kind !== "opening" && "opening" in selected && <GeometryFields
            key={opening.contents.indexOf(selected.item)}
            opening={opening} item={selected.item} editPlan={editPlan} onDirtyChange={setGeometryDirty}
          />}
          <PropertyWindow target={selected} editPlan={editPlan} embedded onDirtyChange={setDirty}
            onClose={geometryDirty ? close : onClose} />
        </div>
      </div>
    </dialog>
  );
};

const GeometryFields = ({ opening, item, editPlan, onDirtyChange }: {
  opening: Opening; item: OpeningItem; editPlan: PlanEditor; onDirtyChange: (dirty: boolean) => void;
}) => {
  const initial = itemRectangle(opening, item);
  const [values, setValues] = useState(() => ({
    x: String(initial.x), y: String(initial.y), width: String(initial.width), height: String(initial.height),
  }));
  const [error, setError] = useState("");
  return <form className="property-window-body" noValidate onSubmit={(event) => {
    event.preventDefault();
    const fields = ["x", "y", "width", "height"] as const;
    if (fields.some((field) => values[field].trim() === "" || !Number.isFinite(Number(values[field])))) {
      setError("Enter finite numbers for all item dimensions.");
      return;
    }
    const geometry: ItemRectangle = {
      x: Number(values.x), y: Number(values.y), width: Number(values.width), height: Number(values.height),
    };
    const result = editPlan.updateOpeningItemGeometry(opening, item, geometry);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    onDirtyChange(false);
  }}>
    <strong>Item position and size</strong>
    {(["x", "y", "width", "height"] as const).map((field) => <label key={field}>
      {field === "x" ? "X" : field === "y" ? "Y" : field === "width" ? "Width" : "Height"} (mm)
      <input type="number" step={field === "x" || field === "y" ? "1" : "any"} value={values[field]}
        onChange={(event) => {
          const next = { ...values, [field]: event.target.value };
          setValues(next);
          onDirtyChange((["x", "y", "width", "height"] as const).some((key) => next[key] !== String(itemRectangle(opening, item)[key])));
        }} />
    </label>)}
    {error && <span className="property-error" role="alert">{error}</span>}
    <div className="property-window-actions"><button type="submit">Apply position</button></div>
  </form>;
};
