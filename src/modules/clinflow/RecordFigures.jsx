import { useState } from "react";
import { ClipboardPenLine } from "lucide-react";
import { FIELDS, cleanEnteredFigures, fieldsForGaps } from "./clinflowEnteredFigures";

// Figures from the clinical record that complete a calculation the letter only half gives. Shown inside the "Check this letter yourself" notice: the person types what the
// calculation is missing and ClinFlow works out the result. A figure the letter gives is never replaced, and a result that uses one says so.
export default function RecordFigures({ gaps = [], entered, disabled, onSave, onClear }) {
  const { required, optional } = fieldsForGaps(gaps);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const [problem, setProblem] = useState("");
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const { values, problems } = cleanEnteredFigures(draft);
    if (problems.length) return setProblem(problems[0]);
    if (!Object.keys(values).length) return setProblem("Enter at least one figure.");
    setProblem("");
    await onSave(values);
    setDraft({}); setOpen(false);
  };
  const field = (key, wanted) => {
    const def = FIELDS[key];
    return (
      <label key={key} className={wanted ? "" : "cf-figure-optional"}>
        <span>{def.label}{def.unit ? ` (${def.unit})` : ""}{wanted ? "" : " · helps, not needed"}</span>
        {def.choices
          ? <select value={draft[key] || ""} onChange={(event) => set(key, event.target.value)}><option value="">Not entered</option>{def.choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          : <input type="number" inputMode="decimal" min={def.min} max={def.max} step={def.step} value={draft[key] ?? ""} onChange={(event) => set(key, event.target.value)} />}
      </label>
    );
  };
  const enteredKeys = Object.keys(entered?.values || {});
  return (
    <div className="cf-figures">
      {enteredKeys.length > 0 && (
        <p className="cf-figures-entered">
          <b>Entered from the clinical record:</b> {enteredKeys.map((key) => `${FIELDS[key]?.label || key} ${FIELDS[key]?.choices ? FIELDS[key].choices.find(([value]) => value === entered.values[key])?.[1] : `${entered.values[key]}${FIELDS[key]?.unit ? ` ${FIELDS[key].unit}` : ""}`}`).join(", ")}
          {entered.byName ? ` (by ${entered.byName})` : ""}. <button type="button" className="cf-dm-link" disabled={disabled} onClick={onClear}>Remove them</button>
        </p>
      )}
      {required.length > 0 && !open && <button type="button" className="cf-figures-open" disabled={disabled} onClick={() => setOpen(true)}><ClipboardPenLine size={14} aria-hidden="true" /> Enter the missing figures from the clinical record</button>}
      {required.length > 0 && open && (
        <div className="cf-figures-form" role="group" aria-label="Figures from the clinical record">
          <p>Type what the patient's record says. ClinFlow then works out the result and marks it as using figures you entered. A figure already in the letter is never replaced.</p>
          <div className="cf-figures-grid">{required.map((key) => field(key, true))}{optional.map((key) => field(key, false))}</div>
          {problem && <p className="cf-figures-problem" role="alert">{problem}</p>}
          <div className="cf-figures-buttons">
            <button type="button" className="primary" disabled={disabled} onClick={save}>Save and work it out</button>
            <button type="button" onClick={() => { setOpen(false); setProblem(""); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
