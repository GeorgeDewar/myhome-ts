import { useEffect, useRef, useState } from "react";
import type { JsonColour } from "../model/json/Document";
import type { Plan } from "../model/Plan";
import type { PlanEditor } from "../model/PlanEditor";
import "./ColoursDialog.css";

type Draft = { id: string; description: string; value: string };
const emptyDraft: Draft = { id: "", description: "", value: "" };
const draftFor = (colour: JsonColour): Draft => ({
  id: colour.id, description: colour.description ?? "", value: colour.value,
});

export const ColoursDialog = ({ plan, editor, onClose }: {
  plan: Plan; editor: PlanEditor; onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<JsonColour>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const initial = selected ? draftFor(selected) : emptyDraft;
  const dirty = editing && (draft.id !== initial.id || draft.description !== initial.description || draft.value !== initial.value);
  const discard = () => !dirty || window.confirm("Discard unapplied colour changes?");
  const choose = (colour?: JsonColour) => {
    if (!discard()) return;
    setSelected(colour);
    setDraft(colour ? draftFor(colour) : emptyDraft);
    setEditing(true);
    setError("");
  };
  const close = () => { if (discard()) onClose(); };
  const save = () => {
    const result = editor.saveColour({
      id: draft.id, value: draft.value,
      ...(draft.description === "" && selected?.description !== "" ? {} : { description: draft.description }),
    }, selected);
    if (!result.ok) { setError(result.error); return; }
    setEditing(false);
    setSelected(undefined);
    setDraft(emptyDraft);
    setError("");
  };

  return <dialog ref={dialogRef} className="colours-dialog" aria-labelledby="colours-title"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header>
      <h2 id="colours-title">Manage Colours</h2>
      <button type="button" aria-label="Close colours" onClick={close}>×</button>
    </header>
    <div className="colours-dialog-body">
      {plan.colours.length === 0 ? <p>No colours defined.</p> : <ul>
        {plan.colours.map((colour) => <li key={colour.id}>
          <span className="colour-swatch" aria-hidden="true"
            style={{ backgroundColor: /^[0-9a-fA-F]{6}$/.test(colour.value) ? `#${colour.value}` : "transparent" }} />
          <span className="colour-details"><strong>{colour.id}</strong> <span>#{colour.value}</span>
            {colour.description !== undefined && <small>{colour.description}</small>}</span>
          <button type="button" onClick={() => choose(colour)} aria-label={`Edit ${colour.id}`}>Edit</button>
          <button type="button" onClick={() => {
            if (!discard() || !window.confirm(`Remove colour "${colour.id}"?`)) return;
            const result = editor.deleteColour(colour);
            if (!result.ok) { setError(result.error); return; }
            setEditing(false);
            setSelected(undefined);
            setDraft(emptyDraft);
            setError("");
          }} aria-label={`Remove ${colour.id}`}>Remove</button>
        </li>)}
      </ul>}
      <button type="button" onClick={() => choose()}>Add colour</button>
      {editing && <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <h3>{selected ? "Edit colour" : "Add colour"}</h3>
        <label>ID<input value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} /></label>
        <label>Description (optional)<input value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Hex value (without #)<input value={draft.value}
          onChange={(event) => setDraft({ ...draft, value: event.target.value })} /></label>
        <div className="colours-dialog-actions">
          <button type="button" onClick={() => {
            if (discard()) { setEditing(false); setSelected(undefined); setError(""); }
          }}>Cancel</button>
          <button type="submit">Save colour</button>
        </div>
      </form>}
      {error && <p role="alert" className="property-error">{error}</p>}
    </div>
  </dialog>;
};
