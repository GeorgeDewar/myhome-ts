import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { JsonColour } from "../model/json/Document";
import type { Plan } from "../model/Plan";
import type { PlanEditor } from "../model/PlanEditor";
import "./ColoursDialog.css";

type Draft = { id: string; description: string; value: string };
type Errors = { id?: string; value?: string; form?: string };

const isHex = (value: string) => /^[0-9a-fA-F]{6}$/.test(value);
const draftFor = (colour?: JsonColour): Draft => ({
  id: colour?.id ?? "", description: colour?.description ?? "", value: colour?.value ?? "",
});

export const ColoursDialog = ({ plan, editor, onClose }: {
  plan: Plan; editor: PlanEditor; onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dragCleanup = useRef<() => void>(() => {});
  const [selected, setSelected] = useState<JsonColour | "new" | undefined>(() => plan.colours[0]);
  const [draft, setDraft] = useState<Draft>(() => draftFor(plan.colours[0]));
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

  const initial = draftFor(selected === "new" ? undefined : selected);
  const dirty = selected !== undefined &&
    (draft.id !== initial.id || draft.description !== initial.description || draft.value !== initial.value);
  const confirmDiscard = () => !dirty || window.confirm("Discard unapplied colour changes?");
  const show = (next: JsonColour | "new" | undefined) => {
    setSelected(next);
    setDraft(draftFor(next === "new" ? undefined : next));
    setErrors({});
  };
  const select = (next: JsonColour | "new") => {
    if (next !== selected && confirmDiscard()) show(next);
  };
  const close = () => {
    if (confirmDiscard()) onClose();
  };

  const apply = () => {
    if (selected === undefined) return;
    const existing = selected === "new" ? undefined : selected;
    const result = editor.saveColour({
      id: draft.id.trim(), value: draft.value,
      ...(draft.description.trim() === "" ? {} : { description: draft.description }),
    }, existing);
    if (!result.ok) {
      setErrors(result.field ? { [result.field]: result.error } : { form: result.error });
      return;
    }
    show(existing ?? plan.colours.at(-1));
  };

  const remove = () => {
    if (selected === undefined || selected === "new") return;
    if (!window.confirm(`Remove colour "${selected.id}"?`)) return;
    const index = plan.colours.indexOf(selected);
    const result = editor.deleteColour(selected);
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

  const validHex = isHex(draft.value);

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
              <span><strong>{colour.id}</strong><small>#{colour.value}</small></span>
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
            {selected === "new" ? "New colour" : selected.id}
            {dirty && <span className="colours-dialog-dirty">Unsaved changes</span>}
          </h3>
          <div className={`colours-dialog-preview${validHex ? "" : " is-invalid"}`}
            style={validHex ? { backgroundColor: `#${draft.value}` } : undefined}>
            <span>{validHex ? `#${draft.value}` : "No valid colour"}</span>
          </div>
          <div className="colours-dialog-row">
            <label>
              ID
              <input aria-label="ID" value={draft.id} aria-invalid={!!errors.id}
                onChange={(event) => { setDraft({ ...draft, id: event.target.value }); setErrors({ ...errors, id: undefined }); }} />
              {errors.id ? <span className="colours-dialog-error" role="alert">{errors.id}</span>
                : <span className="colours-dialog-hint">Referenced by items in the plan. Must be unique.</span>}
            </label>
            <label>
              Colour
              <span className="colours-dialog-hexrow">
                <input type="color" aria-label="Colour picker" value={validHex ? `#${draft.value.toLowerCase()}` : "#000000"}
                  onChange={(event) => {
                    setDraft({ ...draft, value: event.target.value.slice(1).toUpperCase() });
                    setErrors({ ...errors, value: undefined });
                  }} />
                <span aria-hidden="true">#</span>
                <input aria-label="Hex value" value={draft.value} aria-invalid={!!errors.value} maxLength={7}
                  onChange={(event) => {
                    setDraft({ ...draft, value: event.target.value.trim().replace(/^#/, "") });
                    setErrors({ ...errors, value: undefined });
                  }} />
              </span>
              {errors.value ? <span className="colours-dialog-error" role="alert">{errors.value}</span>
                : <span className="colours-dialog-hint">Six hex digits, e.g. 2E5E4E.</span>}
            </label>
          </div>
          <label>
            <span>Description <span className="colours-dialog-hint">(optional)</span></span>
            <textarea aria-label="Description" rows={2} value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
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
