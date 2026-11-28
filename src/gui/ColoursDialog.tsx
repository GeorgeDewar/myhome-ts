import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { uniqueColourId } from "../model/colourId";
import type { JsonColour } from "../model/json/Document";
import type { Plan } from "../model/Plan";
import type { PlanEditor } from "../model/PlanEditor";
import "./ColoursDialog.css";

type Draft = { name: string; id: string; description: string; value: string };
type Errors = { name?: string; id?: string; value?: string; form?: string };

const isHex = (value: string) => /^[0-9a-fA-F]{6}$/.test(value);
const draftFor = (colour?: JsonColour): Draft => ({
  name: colour?.name ?? "", id: colour?.id ?? "", description: colour?.description ?? "", value: colour?.value ?? "",
});

export const ColoursDialog = ({ plan, editor, onClose }: {
  plan: Plan; editor: PlanEditor; onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragCleanup = useRef<() => void>(() => {});
  const [selected, setSelected] = useState<JsonColour | "new" | undefined>(() => plan.colours[0]);
  const [draft, setDraft] = useState<Draft>(() => draftFor(plan.colours[0]));
  const [autoId, setAutoId] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      dragCleanup.current();
      dialog.close();
    };
  }, []);

  const existing = selected === "new" ? undefined : selected;
  const initial = draftFor(existing);
  const dirty = selected !== undefined && (Object.keys(initial) as (keyof Draft)[]).some((key) => draft[key] !== initial[key]);
  const takenIds = plan.colours.filter((colour) => colour !== existing).map((colour) => colour.id);
  const generatedId = uniqueColourId(draft.name, takenIds);
  const trimmedName = draft.name.trim().toLowerCase();
  const duplicateName = trimmedName !== "" &&
    plan.colours.some((colour) => colour !== existing && colour.name.trim().toLowerCase() === trimmedName);
  const validHex = isHex(draft.value);

  const confirmDiscard = () => !dirty || window.confirm("Discard unapplied colour changes?");
  const show = (next: JsonColour | "new" | undefined) => {
    setSelected(next);
    setDraft(draftFor(next === "new" ? undefined : next));
    setAutoId(next === "new");
    setErrors({});
  };
  const select = (next: JsonColour | "new") => {
    if (next !== selected && confirmDiscard()) show(next);
  };
  const close = () => {
    if (confirmDiscard()) onClose();
  };
  const change = (values: Partial<Draft>, field?: keyof Errors) => {
    setDraft({ ...draft, ...values });
    if (field) setErrors({ ...errors, [field]: undefined });
  };

  const apply = () => {
    if (selected === undefined) return;
    const result = editor.saveColour({
      id: draft.id.trim(), name: draft.name.trim(),
      ...(draft.description.trim() === "" ? {} : { description: draft.description }),
      value: draft.value,
    }, existing);
    if (!result.ok) {
      setErrors(result.field ? { [result.field]: result.error } : { form: result.error });
      return;
    }
    show(existing ?? plan.colours.at(-1));
  };

  const remove = () => {
    if (!existing || !window.confirm(`Remove colour "${existing.name}"?`)) return;
    const index = plan.colours.indexOf(existing);
    const result = editor.deleteColour(existing);
    if (!result.ok) {
      setErrors({ form: result.error });
      return;
    }
    show(plan.colours[Math.min(index, plan.colours.length - 1)]);
  };

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

  const idDiffers = generatedId !== "" && draft.id !== generatedId;

  return <dialog ref={dialogRef} className="colours-dialog" aria-labelledby="colours-title"
    style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="colours-dialog-header" onMouseDown={startDrag}>
      <GripVertical size={16} aria-hidden="true" />
      <h2 id="colours-title">Manage colours</h2>
      <button type="button" aria-label="Close colours" onClick={close}>×</button>
    </header>
    <div className="colours-dialog-layout">
      <aside className="colours-dialog-list">
        <ul aria-label="Colours">
          {plan.colours.map((colour) => <li key={colour.id}>
            <button type="button" aria-pressed={selected === colour} onClick={() => select(colour)}>
              <span className="colour-swatch" aria-hidden="true"
                style={{ backgroundColor: isHex(colour.value) ? `#${colour.value}` : "transparent" }} />
              <span><strong>{colour.name}</strong><small>#{colour.value} · {colour.id}</small></span>
            </button>
          </li>)}
        </ul>
        <button type="button" className="colours-dialog-add" onClick={() => select("new")}>+ Add colour</button>
      </aside>
      <section className="colours-dialog-detail">
        {selected === undefined ? <p className="colours-dialog-empty">
          {plan.colours.length === 0 ? "No colours defined yet." : "Select a colour to edit it."}
        </p> : <form noValidate onSubmit={(event) => { event.preventDefault(); apply(); }}>
          <h3>
            {draft.name.trim() || (selected === "new" ? "New colour" : "Unnamed colour")}
            {dirty && <span className="colours-dialog-dirty">Unsaved changes</span>}
          </h3>
          <div className={`colours-dialog-preview${validHex ? "" : " is-invalid"}`}
            style={validHex ? { backgroundColor: `#${draft.value}` } : undefined}>
            <span>{validHex ? `#${draft.value}` : "No valid colour"}</span>
          </div>
          <label>
            Name
            <input aria-label="Name" value={draft.name} aria-invalid={!!errors.name}
              onChange={(event) => change({
                name: event.target.value,
                ...(autoId ? { id: uniqueColourId(event.target.value, takenIds) } : {}),
              }, "name")} />
            {errors.name && <span className="colours-dialog-error" role="alert">{errors.name}</span>}
            {duplicateName && <span className="colours-dialog-warning">
              Another colour is already called “{draft.name.trim()}”. Names don’t have to be unique, but it can be confusing.
            </span>}
          </label>
          <div className="colours-dialog-row">
            <div className="colours-dialog-field">
              <span className="colours-dialog-labelrow">
                <span>ID</span>
                {selected === "new"
                  ? <button type="button" className="colours-dialog-badge" onClick={() => {
                    setAutoId(!autoId);
                    if (!autoId) setDraft({ ...draft, id: generatedId });
                  }}>{autoId ? "Auto · Edit" : "Custom · Reset to auto"}</button>
                  : idDiffers && <span className="colours-dialog-badge">Custom</span>}
              </span>
              <input aria-label="ID" value={draft.id} aria-invalid={!!errors.id} readOnly={autoId}
                onChange={(event) => change({ id: event.target.value }, "id")} />
              {errors.id ? <span className="colours-dialog-error" role="alert">{errors.id}</span>
                : autoId ? <span className="colours-dialog-hint">Generated from the name. Used internally to reference this colour.</span>
                : existing && idDiffers ? <span className="colours-dialog-hint">
                  Renaming doesn’t change the ID.{" "}
                  <button type="button" className="colours-dialog-link" onClick={() => change({ id: generatedId }, "id")}>
                    Generate from name
                  </button> → {generatedId}
                </span>
                : <span className="colours-dialog-hint">Used internally to reference this colour. Must be unique.</span>}
            </div>
            <div className="colours-dialog-field">
              <span className="colours-dialog-labelrow"><span>Colour</span></span>
              <span className="colours-dialog-hexrow">
                <input type="color" aria-label="Colour picker" value={validHex ? `#${draft.value.toLowerCase()}` : "#000000"}
                  onChange={(event) => change({ value: event.target.value.slice(1).toUpperCase() }, "value")} />
                <span aria-hidden="true">#</span>
                <input aria-label="Hex value" value={draft.value} aria-invalid={!!errors.value} maxLength={7}
                  onChange={(event) => change({ value: event.target.value.trim().replace(/^#/, "") }, "value")} />
              </span>
              {errors.value ? <span className="colours-dialog-error" role="alert">{errors.value}</span>
                : <span className="colours-dialog-hint">Six hex digits, e.g. 2E5E4E.</span>}
            </div>
          </div>
          <label>
            <span>Description <span className="colours-dialog-hint">(optional)</span></span>
            <textarea aria-label="Description" rows={2} value={draft.description}
              onChange={(event) => change({ description: event.target.value })} />
          </label>
          <p className="colours-dialog-hint">Not used by anything in the plan yet.</p>
          {errors.form && <p className="colours-dialog-error" role="alert">{errors.form}</p>}
          <footer>
            <button type="button" className="colours-dialog-danger" disabled={selected === "new"} onClick={remove}>Remove…</button>
            <span />
            <button type="button" disabled={!dirty} onClick={() => show(selected)}>Revert</button>
            <button type="submit" className="colours-dialog-primary" disabled={!dirty}>Apply</button>
          </footer>
        </form>}
      </section>
    </div>
    <div className="colours-dialog-footer">
      <span>{plan.colours.length} {plan.colours.length === 1 ? "colour" : "colours"}</span>
      <button type="button" onClick={close}>Close</button>
    </div>
  </dialog>;
};
