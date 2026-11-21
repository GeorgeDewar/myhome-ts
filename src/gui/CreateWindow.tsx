import { useState } from "react";
import type { Level } from "../model/Level";
import type { Opening, OpeningItem } from "../model/Opening";
import type { PlanEditor } from "../model/PlanEditor";
import type { Wall } from "../model/Wall";
import { selectionTargetForOpeningItem, type SelectionTarget } from "./selection";
import "./PropertyWindow.css";

export type CreateRequest = {
  kind: "wall" | "fence" | "room" | "opening" | "item";
  level?: Level;
  wall?: Wall;
  opening?: Opening;
};

export const CreateWindow = ({
  request,
  editor,
  onCreated,
  onClose,
}: {
  request: CreateRequest;
  editor: PlanEditor;
  onCreated: (target: SelectionTarget) => void;
  onClose: () => void;
}) => {
  const [values, setValues] = useState({
    startX: "",
    startY: "",
    endX: "",
    endY: "",
    name: "",
    width: "900",
    distance: "",
    height: "",
    floor: "",
  });
  const [walls, setWalls] = useState<Wall[]>([]);
  const [itemType, setItemType] = useState<OpeningItem["type"]>("StandardDoor");
  const [error, setError] = useState("");

  const number = (text: string) => (text.trim() === "" ? NaN : Number(text));
  const field = (name: keyof typeof values, label: string) => (
    <label>
      {label}
      <input
        type={name === "name" ? "text" : "number"}
        step={name === "name" ? undefined : "any"}
        value={values[name]}
        onChange={(event) => setValues({ ...values, [name]: event.target.value })}
      />
    </label>
  );
  const submit = () => {
    let result: { ok: false; error: string } | { ok: true; target: SelectionTarget };
    if (request.kind === "wall" || request.kind === "fence") {
      const start: [number, number] = [number(values.startX), number(values.startY)];
      const end: [number, number] = [number(values.endX), number(values.endY)];
      if (request.kind === "wall") {
        if (!request.level) return setError("Select a level first.");
        const added = editor.addWall(request.level, start, end);
        result = added.ok ? { ok: true, target: { kind: "wall", item: added.item } } : added;
      } else {
        const added = editor.addFence(start, end);
        result = added.ok ? { ok: true, target: { kind: "fence", item: added.item } } : added;
      }
    } else if (request.kind === "room") {
      if (!request.level) return setError("Select a level first.");
      const added = editor.addRoom(request.level, values.name, walls);
      result = added.ok ? { ok: true, target: { kind: "room", item: added.item } } : added;
    } else if (request.kind === "opening") {
      if (!request.wall) return setError("Select a wall first.");
      const added = editor.addOpening(
        request.wall,
        number(values.width),
        number(values.distance),
        values.height.trim() ? number(values.height) : undefined,
        values.floor.trim() ? number(values.floor) : undefined,
      );
      result = added.ok ? { ok: true, target: { kind: "opening", item: added.item } } : added;
    } else {
      if (!request.opening) return setError("Select an opening first.");
      const added = editor.addOpeningItem(request.opening, itemType);
      result = added.ok ? { ok: true, target: selectionTargetForOpeningItem(added.item, request.opening) } : added;
    }
    if (result.ok) onCreated(result.target);
    else setError(result.error);
  };

  const title = `Add ${request.kind === "item" ? "opening item" : request.kind}`;
  return (
    <section className="property-window create-window" style={{ left: 288, top: 88 }} aria-label={title}>
      <header className="property-window-titlebar">{title}</header>
      <form
        className="property-window-body"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {(request.kind === "wall" || request.kind === "room") && <span>Level: {request.level?.name}</span>}
        {(request.kind === "wall" || request.kind === "fence") && (
          <>
            {field("startX", "Start X (mm)")}
            {field("startY", "Start Y (mm)")}
            {field("endX", "End X (mm)")}
            {field("endY", "End Y (mm)")}
          </>
        )}
        {request.kind === "room" && (
          <>
            {field("name", "Room name")}
            <fieldset>
              <legend>Select walls in order</legend>
              {request.level?.walls.map((wall) => (
                <label key={wall.id} className="create-wall-option">
                  <input
                    type="checkbox"
                    checked={walls.includes(wall)}
                    onChange={(event) =>
                      setWalls(event.target.checked ? [...walls, wall] : walls.filter((item) => item !== wall))
                    }
                  />
                  {walls.includes(wall) ? `${walls.indexOf(wall) + 1}. ` : ""}
                  {wall.id}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {request.kind === "opening" && (
          <>
            <span>Wall: {request.wall?.id}</span>
            {field("width", "Width (mm)")}
            {field("distance", "Distance along wall (mm)")}
            {field("height", "Height (mm, optional)")}
            {field("floor", "Distance from floor (mm, optional)")}
          </>
        )}
        {request.kind === "item" && (
          <label>
            Type
            <select
              value={itemType}
              onChange={(event) => {
                const type = event.target.value;
                if (type === "StandardDoor" || type === "SlidingDoor" || type === "StandardWindow") setItemType(type);
              }}
            >
              <option value="StandardDoor">Standard Door</option>
              <option value="SlidingDoor">Sliding Door</option>
              <option value="StandardWindow">Standard Window</option>
            </select>
          </label>
        )}
        {error && (
          <div className="property-error" role="alert">
            {error}
          </div>
        )}
        <div className="property-window-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Add</button>
        </div>
      </form>
    </section>
  );
};
