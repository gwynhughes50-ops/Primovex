import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, addDoc, updateDoc } from "firebase/firestore";
import { CheckCircle2, Plus, Save, Thermometer } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_TEMPLATES } from "@/core/identity/capabilities";
import { normaliseUnit } from "@/mobile/fridgeCheck";
import { UNIT_TYPES, buildUnitDoc, canChooseAlertRoles, cleanAlertRoles, emptyForm, formFromUnit, roleChoices, validateUnit, withType } from "@/modules/temperature/fridgeSetup";
import { ALERT_ROLES_DEFAULT } from "@/modules/temperature/fridgeIncidents";

// Fridges and who is told: each fridge's name, site and the range it must stay in (so a reading outside it is
// flagged and the right people are alerted), and which roles are alerted. On the Temperature page; shown to
// admins, the Practice Manager and any role ticked for alerts (the nurse lead).

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";

function UnitRow({ unit, sites, units, onSaved }) {
  const [form, setForm] = useState(() => formFromUnit(unit));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(form) !== JSON.stringify(formFromUnit(unit));

  async function save() {
    const problem = validateUnit(form, units);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await updateDoc(doc(db, "temperature_units", unit.id), { ...buildUnitDoc(form, { sites }), updatedAt: serverTimestamp() });
      setMessage("Saved.");
      onSaved?.();
    } catch (problemSaving) {
      setError(problemSaving?.message || "Could not save. Check you have permission.");
    } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-slate-900/60 p-3 ${form.active ? "" : "opacity-60"}`}>
      <div className="grid gap-2 sm:grid-cols-6">
        <label className={`${LABEL} sm:col-span-2`}>Name<input className={FIELD} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className={LABEL}>Site
          <select className={FIELD} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
            <option value="">Choose…</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className={LABEL}>Kind
          <select className={FIELD} value={form.type} onChange={(e) => setForm(withType(form, e.target.value))}>
            {UNIT_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
          </select>
        </label>
        <label className={LABEL}>Lowest °C<input className={FIELD} inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} /></label>
        <label className={LABEL}>Highest °C<input className={FIELD} inputMode="decimal" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> In use</label>
        <button type="button" onClick={save} disabled={busy || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40"><Save className="h-4 w-4" aria-hidden="true" /> Save</button>
        {message && <span className="flex items-center gap-1 text-sm text-emerald-300" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {message}</span>}
        {error && <span className="text-sm text-rose-300" role="alert">{error}</span>}
      </div>
    </div>
  );
}

export default function FridgeSetup({ sites = [] }) {
  const { user, role, capabilities = [], isAdmin } = useAuth();
  const actorName = user?.displayName || user?.email || "Unknown";
  const [units, setUnits] = useState(null);
  const [customRoles, setCustomRoles] = useState([]);
  const [alertRoles, setAlertRoles] = useState(ALERT_ROLES_DEFAULT);
  const [rolesBusy, setRolesBusy] = useState(false);
  const [rolesMessage, setRolesMessage] = useState("");
  const [rolesError, setRolesError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(() => emptyForm(sites[0]?.id || ""));
  const [addError, setAddError] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const canChoose = canChooseAlertRoles({ capabilities, isAdmin });

  useEffect(() => onSnapshot(collection(db, "temperature_units"), (snap) => setUnits(snap.docs.map((d) => normaliseUnit(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))), () => setUnits([])), []);
  useEffect(() => onSnapshot(collection(db, "roles"), (snap) => setCustomRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCustomRoles([])), []);
  useEffect(() => onSnapshot(doc(db, "settings", "fridgeAlerts"), (snap) => { const roles = snap.exists() ? snap.data()?.roles : null; setAlertRoles(Array.isArray(roles) && roles.length ? roles : ALERT_ROLES_DEFAULT); }, () => {}), []);

  const choices = useMemo(() => roleChoices({ builtIn: Object.keys(ROLE_TEMPLATES), custom: customRoles.filter((r) => r.active !== false) }), [customRoles]);

  async function saveRoles(next) {
    setRolesBusy(true); setRolesError(""); setRolesMessage("");
    try {
      const roles = cleanAlertRoles(next, choices);
      await setDoc(doc(db, "settings", "fridgeAlerts"), { roles, updatedAt: serverTimestamp(), updatedBy: actorName }, { merge: true });
      setRolesMessage("Saved.");
    } catch (problem) {
      setRolesError(problem?.message || "Could not save. Check you have permission.");
    } finally { setRolesBusy(false); }
  }
  const toggleRole = (name) => saveRoles(alertRoles.includes(name) ? alertRoles.filter((r) => r !== name) : [...alertRoles, name]);

  async function addUnit() {
    const problem = validateUnit(form, units || []);
    if (problem) { setAddError(problem); return; }
    setAddBusy(true); setAddError("");
    try {
      await addDoc(collection(db, "temperature_units"), { ...buildUnitDoc(form, { sites }), createdAt: serverTimestamp(), createdBy: actorName });
      setForm(emptyForm(form.siteId));
      setAdding(false);
    } catch (problemSaving) {
      setAddError(problemSaving?.message || "Could not add it. Check you have permission.");
    } finally { setAddBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100"><Thermometer className="h-5 w-5 text-teal-300" aria-hidden="true" /> Fridges and their safe range</h2>
            <p className="mt-1 text-sm text-slate-400">Each fridge and freezer the practice checks, and the range it must stay in. A reading outside it is flagged red and alerts the people chosen below.</p>
          </div>
          <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-300/40 px-3 py-1.5 text-sm font-semibold text-teal-200"><Plus className="h-4 w-4" aria-hidden="true" /> Add a fridge</button>
        </div>

        {adding && (
          <div className="mt-3 rounded-xl border border-teal-300/30 bg-slate-950/50 p-3">
            <div className="grid gap-2 sm:grid-cols-6">
              <label className={`${LABEL} sm:col-span-2`}>Name<input className={FIELD} value={form.name} placeholder="e.g. Vaccine fridge" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className={LABEL}>Site
                <select className={FIELD} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                  <option value="">Choose…</option>
                  {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                </select>
              </label>
              <label className={LABEL}>Kind
                <select className={FIELD} value={form.type} onChange={(e) => setForm(withType(form, e.target.value))}>{UNIT_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select>
              </label>
              <label className={LABEL}>Lowest °C<input className={FIELD} inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} /></label>
              <label className={LABEL}>Highest °C<input className={FIELD} inputMode="decimal" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} /></label>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={addUnit} disabled={addBusy} className="rounded-lg bg-teal-500/90 px-3 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-40">{addBusy ? "Adding…" : "Add fridge"}</button>
              {addError && <span className="text-sm text-rose-300" role="alert">{addError}</span>}
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {units === null ? <p className="text-sm text-slate-400">Loading…</p> : units.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">No fridges set up yet. Add each fridge and freezer the practice checks.</p> : units.map((unit) => <UnitRow key={unit.id} unit={unit} sites={sites} units={units} />)}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-100">Who is alerted when a fridge is out of range</h2>
        <p className="mt-1 text-sm text-slate-400">They get a message on their screen straight away, with buttons to quarantine the fridge, record what happened to the stock and clear it. Tick the roles; people in those roles can also set up fridges. Give a role the permission to resolve temperature incidents under Roles so they can act.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {choices.map((name) => (
            <label key={name} className={`flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 ${canChoose ? "" : "opacity-60"}`}>
              <input type="checkbox" checked={alertRoles.includes(name)} disabled={!canChoose || rolesBusy} onChange={() => toggleRole(name)} /> {name}
            </label>
          ))}
        </div>
        {!canChoose && <p className="mt-2 text-xs text-slate-400">Only the Practice Manager and administrators choose who is alerted.</p>}
        <div className="mt-2 min-h-5 text-sm">
          {rolesMessage && <span className="flex items-center gap-1 text-emerald-300" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {rolesMessage}</span>}
          {rolesError && <span className="text-rose-300" role="alert">{rolesError}</span>}
        </div>
      </section>
    </div>
  );
}
