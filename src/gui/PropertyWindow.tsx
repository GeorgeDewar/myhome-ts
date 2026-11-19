import { GripVertical, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { SelectionTarget } from "./selection";
import { Distance } from "../model/geom/Distance";
import "./PropertyWindow.css";

type PropertyWindowProps = { target: SelectionTarget; onChange: () => void; onClose: () => void };

const distanceInMillimetres = (value: number) => Math.round(value * 1000);

export const PropertyWindow = ({ target, onChange, onClose }: PropertyWindowProps) => {
  const [position, setPosition] = useState({ x: 288, y: 88 });
  const dragOriginRef = useRef<{ pointerX: number; pointerY: number; windowX: number; windowY: number } | undefined>(
    undefined,
  );
  const dragCleanupRef = useRef<() => void>(() => undefined);
  const title = `${target.kind[0].toUpperCase()}${target.kind.slice(1)} Properties`;

  const startDrag = (event: MouseEvent<HTMLDivElement>) => {
    dragOriginRef.current = { pointerX: event.clientX, pointerY: event.clientY, windowX: position.x, windowY: position.y };
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
  const setDistance = (update: (value: Distance) => void, millimetres: string) => {
    const value = Number(millimetres);
    if (!Number.isFinite(value)) return;
    update(new Distance(value / 1000));
    onChange();
  };

  return (
    <section className="property-window" style={{ left: position.x, top: position.y }} aria-label={title}>
      <header
        className="property-window-titlebar"
        onMouseDown={startDrag}
      >
        <GripVertical size={16} aria-hidden="true" />
        <span>{title}</span>
        <button type="button" className="property-window-close" aria-label="Close properties" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="property-window-body">
        {target.kind === "room" && (
          <label>
            Name
            <input
              value={target.item.name}
              onChange={(event) => {
                target.item.name = event.target.value;
                onChange();
              }}
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
            <label>
              Width (mm)
              <input
                type="number"
                value={distanceInMillimetres(target.item.width.metres)}
                onChange={(event) =>
                  setDistance((value) => {
                    target.item.explicitWidth = value;
                  }, event.target.value)
                }
              />
            </label>
          </>
        )}
        {target.kind === "opening" && (
          <>
            <label>
              Opening ID
              <input value={target.item.id} readOnly />
            </label>
            <label>
              Width (mm)
              <input
                type="number"
                value={distanceInMillimetres(target.item.width.metres)}
                onChange={(event) =>
                  setDistance((value) => {
                    target.item.width = value;
                  }, event.target.value)
                }
              />
            </label>
            <label>
              Distance along wall (mm)
              <input
                type="number"
                value={distanceInMillimetres(target.item.distanceAlongWall.metres)}
                onChange={(event) =>
                  setDistance((value) => {
                    target.item.distanceAlongWall = value;
                  }, event.target.value)
                }
              />
            </label>
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
                value={target.item.hingeSide}
                onChange={(event) => {
                  target.item.hingeSide = event.target.value as "left" | "right";
                  onChange();
                }}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              Swing direction
              <select
                value={target.item.swingDirection}
                onChange={(event) => {
                  target.item.swingDirection = event.target.value as "in" | "out";
                  onChange();
                }}
              >
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </label>
            <label>
              Leaf thickness (mm)
              <input
                type="number"
                value={distanceInMillimetres(target.item.leafThickness.metres)}
                onChange={(event) =>
                  setDistance((value) => {
                    target.item.thickness = value;
                  }, event.target.value)
                }
              />
            </label>
          </>
        )}
        {target.kind === "window" && (
          <label>
            Opening
            <input value={target.opening.id} readOnly />
          </label>
        )}
      </div>
    </section>
  );
};
