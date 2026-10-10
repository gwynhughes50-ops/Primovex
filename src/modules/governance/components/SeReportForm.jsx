import { useMemo, useState } from "react";
import { loadSpaceRegistry } from "@/modules/sense/services/sharedSpaceRegistry";
import { SE_CATEGORIES, SE_HARM_LEVELS, friendly, validateReport } from "../seModel";
import { reportEvent } from "../services/seService";
import { ErrorText, FIELD, LABEL, PRIMARY, SECONDARY, Sheet } from "./SeShared";

// Anyone can report a significant event, on a phone or a computer. What they are asked for is kept
// to what the team needs to decide what happens next. Nobody is named: staff and patients are
// referred to by role, EMIS number or initials.

const today = () => new Date().toISOString().slice(0, 10);

export default function SeReportForm({ actor, onClose, onReported }) {
  const [form, setForm] = useState({
    title: "", description: "", immediateAction: "", eventDate: today(), category: "other", harm: "none",
    locationId: "", locationName: "", patientInvolved: false, emisNumber: "", patientInitials: "", dateOfBirth: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  // Where it happened is picked from the practice's own rooms, not typed.
  const spaces = useMemo(() => {
    try { return (loadSpaceRegistry()?.spaces || []).filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)); } catch { return []; }
  }, []);

  async function submit() {
    const problem = validateReport(form);
    if (problem) { setError(problem); return; }
    try {
      setBusy(true);
      setError("");
      const id = await reportEvent(form, actor);
      onReported?.(id);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not report the event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet eyebrow="Significant event" title="Report an event" subtitle="Something that happened, or nearly happened, that the practice should learn from. Please don't use anyone's name." onClose={onClose}>
      <div className="mt-4 space-y-3">
        <label className={LABEL}>Short title
          <input value={form.title} maxLength={120} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. Wrong vaccine drawn up" className={FIELD} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={LABEL}>Date it happened
            <input type="date" value={form.eventDate} max={today()} onChange={(e) => update({ eventDate: e.target.value })} className={FIELD} />
          </label>
          <label className={LABEL}>Where
            <select value={form.locationId} onChange={(e) => { const s = spaces.find((x) => x.id === e.target.value); update({ locationId: e.target.value, locationName: s?.name || "" }); }} className={FIELD}>
              <option value="">Not in a room / elsewhere</option>
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <label className={LABEL}>What kind of event
          <select value={form.category} onChange={(e) => update({ category: e.target.value })} className={FIELD}>
            {SE_CATEGORIES.map((c) => <option key={c} value={c}>{friendly(c)}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Harm caused</legend>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {SE_HARM_LEVELS.map((level) => (
              <label key={level.key} className="flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-sm" style={{ borderColor: form.harm === level.key ? level.color : `${level.color}55`, background: form.harm === level.key ? `${level.color}26` : `${level.color}0f` }}>
                <input type="radio" name="harm" className="mt-1" style={{ accentColor: level.color }} checked={form.harm === level.key} onChange={() => update({ harm: level.key })} />
                <span><b className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: level.color }} aria-hidden="true" />{level.label}</b><span className="text-xs text-[var(--medtrak-muted)]">{level.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className={LABEL}>What happened
          <textarea value={form.description} rows={4} onChange={(e) => update({ description: e.target.value })} placeholder="Describe it factually. Use roles (the nurse, a receptionist), not names." className={FIELD} />
        </label>
        <label className={LABEL}>What was done straight away
          <textarea value={form.immediateAction} rows={2} onChange={(e) => update({ immediateAction: e.target.value })} className={FIELD} />
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-[var(--medtrak-border)] px-3 py-3 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4" checked={form.patientInvolved} onChange={(e) => update({ patientInvolved: e.target.checked })} /> A patient was involved
        </label>
        {form.patientInvolved && (
          <div className="space-y-2 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3">
            <p className="text-[11px] text-[var(--medtrak-muted)]">EMIS number only, or initials and date of birth if there isn't one. Never a name.</p>
            <label className={LABEL}>EMIS number
              <input value={form.emisNumber} inputMode="numeric" onChange={(e) => update({ emisNumber: e.target.value })} className={FIELD} />
            </label>
            {!form.emisNumber.trim() && (
              <div className="grid grid-cols-2 gap-2">
                <label className={LABEL}>Initials
                  <input value={form.patientInitials} maxLength={12} onChange={(e) => update({ patientInitials: e.target.value.toUpperCase() })} className={FIELD} />
                </label>
                <label className={LABEL}>Date of birth
                  <input type="date" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} className={FIELD} />
                </label>
              </div>
            )}
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="sticky bottom-0 -mx-5 -mb-6 mt-3 flex justify-end gap-2 border-t border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className={PRIMARY}>{busy ? "Sending…" : "Report event"}</button>
        </div>
      </div>
    </Sheet>
  );
}
