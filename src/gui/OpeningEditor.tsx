import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { DEFAULT_SASH_DIMENSION_MM, type Opening, type OpeningItem } from "../model/Opening";
import { arrangementWarnings, defaultItemRectangle, emptySpaceMarkers, itemGeometry, itemRectangle, largestEmptyRectangle, openingSize, type ItemGeometry } from "../model/geom/openingArrangement";
import type { PlanEditor } from "../model/PlanEditor";
import { windowTypes } from "../model/windowTypes";
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
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragCleanup = useRef<() => void>(() => {});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      dragCleanup.current();
      dialog.close();
    };
  }, []);

  const startDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const drag = (move: globalThis.MouseEvent) =>
      setOffset({ x: offset.x + move.clientX - startX, y: offset.y + move.clientY - startY });
    const stop = () => {
      window.removeEventListener("mousemove", drag);
      window.removeEventListener("mouseup", stop);
      dragCleanup.current = () => {};
    };
    dragCleanup.current();
    window.addEventListener("mousemove", drag);
    window.addEventListener("mouseup", stop);
    dragCleanup.current = stop;
  };

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
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      aria-labelledby="opening-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="opening-editor-header" onMouseDown={startDrag}>
        <GripVertical size={16} aria-hidden="true" />
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
            role="group"
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
              const target = selectionTargetForOpeningItem(item, opening);
              const sash = item.type === "Window" && windowTypes[item.windowType].sashRequired ? item.sash : undefined;
              const hasSash = item.type === "Window" && windowTypes[item.windowType].sashRequired;
              const left = Math.min(rectangle.width, sash?.widthLeft?.toJson() ?? DEFAULT_SASH_DIMENSION_MM);
              const right = Math.max(left, rectangle.width - (sash?.widthRight?.toJson() ?? DEFAULT_SASH_DIMENSION_MM));
              const top = Math.min(rectangle.height, sash?.widthTop?.toJson() ?? DEFAULT_SASH_DIMENSION_MM);
              const bottom = Math.max(top, rectangle.height - (sash?.widthBottom?.toJson() ?? DEFAULT_SASH_DIMENSION_MM));
              return <g key={index} role="button" tabIndex={0} aria-label={`${index + 1}. ${selectionTargetNames[target.kind]}`}
                onClick={(event) => {
                  event.stopPropagation();
                  const svg = event.currentTarget.ownerSVGElement;
                  const transform = svg?.getScreenCTM();
                  if (!transform) {
                    setMessage("Could not locate the selected item in the diagram.");
                    return;
                  }
                  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
                  const hits = opening.contents.filter((_, i) => {
                    const rect = rectangles[i];
                    return point.x >= rect.x && point.x < rect.x + rect.width &&
                      point.y >= rect.y && point.y < rect.y + rect.height;
                  }).reverse();
                  const activeIndex = hits.findIndex((hit) => hit === selected.item);
                  select(selectionTargetForOpeningItem(hits[(activeIndex + 1) % hits.length] ?? item, opening));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select(target);
                  }
                }}>
                <rect {...rectangle}
                  fill={item.type === "Post" ? "#a97956" : item.type === "Window" ? "#a4cedd" : "#cdb496"}
                  fillOpacity="0.7" />
                {hasSash && <path
                  d={`M ${rectangle.x} ${rectangle.y} h ${rectangle.width} v ${rectangle.height} h ${-rectangle.width} Z M ${rectangle.x + left} ${rectangle.y + top} H ${rectangle.x + right} V ${rectangle.y + bottom} H ${rectangle.x + left} Z`}
                  fill="#a97956" fillRule="evenodd" pointerEvents="none" />}
                <rect {...rectangle} fill="none" stroke={selected.item === item ? "#d64545" : "#486581"}
                  strokeWidth={selected.item === item ? 3 : 1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              </g>;
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
          <p>Positions are measured from the top-left of the opening. Select an item in the diagram; click again to cycle overlapping items.</p>
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
            {opening.contents.length === 0 && <p>This opening has no items.</p>}
          </div>
          {gap && <div className="opening-editor-gap" aria-label="Add item in selected space">
            <p>Choose an item for the highlighted space:</p>
            {(["Window", "StandardDoor", "SlidingDoor", "Post"] as const).map((type) =>
              <button key={type} type="button" onClick={() => {
                if ((dirty || geometryDirty) && !window.confirm("Discard unapplied changes?")) return;
                const result = editPlan.addOpeningItem(opening, type, gap);
                if (!result.ok) { setMessage(result.error); return; }
                setDirty(false);
                setGeometryDirty(false);
                setMessage("");
                setGapPoint(undefined);
                setSelected(selectionTargetForOpeningItem(result.item, opening));
              }}>Add {type === "Window" ? "window" : type === "StandardDoor" ? "door" : type === "SlidingDoor" ? "sliding door" : "post"} here</button>)}
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

const geometryFields = ["x", "y", "width", "height"] as const;
const storedText = (item: OpeningItem) => {
  const stored = itemGeometry(item);
  return { x: String(stored.x ?? ""), y: String(stored.y ?? ""), width: String(stored.width ?? ""), height: String(stored.height ?? "") };
};

const GeometryFields = ({ opening, item, editPlan, onDirtyChange }: {
  opening: Opening; item: OpeningItem; editPlan: PlanEditor; onDirtyChange: (dirty: boolean) => void;
}) => {
  const defaults = defaultItemRectangle(opening);
  const [values, setValues] = useState(() => storedText(item));
  const [error, setError] = useState("");
  return <form className="property-window-body" noValidate onSubmit={(event) => {
    event.preventDefault();
    if (geometryFields.some((field) => values[field].trim() !== "" && !Number.isFinite(Number(values[field])))) {
      setError("Enter finite numbers for item dimensions, or leave them blank for the default.");
      return;
    }
    const geometry = Object.fromEntries(geometryFields.map((field) =>
      [field, values[field].trim() === "" ? undefined : Number(values[field])])) as ItemGeometry;
    const result = editPlan.updateOpeningItemGeometry(opening, item, geometry);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    onDirtyChange(false);
  }}>
    <strong>Item position and size</strong>
    {geometryFields.map((field) => <label key={field}>
      {field === "x" ? "X" : field === "y" ? "Y" : field === "width" ? "Width" : "Height"} (mm)
      <input type="number" step={field === "x" || field === "y" ? "1" : "any"} value={values[field]}
        placeholder={String(defaults[field])}
        onChange={(event) => {
          const next = { ...values, [field]: event.target.value };
          setValues(next);
          const stored = storedText(item);
          onDirtyChange(geometryFields.some((key) => next[key] !== stored[key]));
        }} />
    </label>)}
    {error && <span className="property-error" role="alert">{error}</span>}
    <div className="property-window-actions"><button type="submit">Apply position</button></div>
  </form>;
};
