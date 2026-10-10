import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { AlertTriangle, Archive, CheckCircle2, ExternalLink, FileText, FlaskConical, Pencil, Plus, Printer, QrCode, RotateCcw, Save, Search, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import { namesWithCurrent } from "@/lib/stockPickerOptions";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { getQrImageUrl } from "@/lib/qrCode";
import { openDocument } from "@/lib/openDocument";
import { buildNfcUrl } from "@/modules/sense/services/nfcService";
import {
  FIRST_AID_OPTIONS, HAZARD_TYPES, PPE_OPTIONS, REVIEW_STATUS_LABEL, dateKey, emptySubstance, firstAidLabel, hazardLabel, nextReviewFrom, ppeLabel,
  reviewStatus, reviewSummary, reviewText, searchSubstances, shortLabel, sortSubstances, storagePlaces, validateSubstance,
} from "@/modules/coshh/coshh";
import { coshhLabelsHtml, coshhRegisterHtml } from "@/modules/coshh/coshhLabels";
import { markReviewed, saveSubstance, sdsProblem, setActive, useCoshhSubstances } from "@/modules/coshh/coshhService";

// COSHH register (Compliance > COSHH): the hazardous substances the practice keeps, with the protective equipment,
// first aid, where each is stored, its safety data sheet and when the assessment is next reviewed. The caretaker
// and practice manager keep it up to date; partners can read it. Everything is picked from lists, nothing is
// free-typed except the product name as printed on the label.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const OTHER = "__other";

const STATUS_STYLE = {
  overdue: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  missing: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  "due-soon": "border-amber-400/40 bg-amber-500/10 text-amber-200",
  ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
};

const ukDate = (key) => (key ? key.split("-").reverse().join("/") : "not set");

function CheckGroup({ title, options, value, onChange, exclusive = "none" }) {
  const toggle = (key) => {
    const has = value.includes(key);
    let next = has ? value.filter((k) => k !== key) : [...value, key];
    // "none" can't sit next to a real choice
    if (!has && key === exclusive) next = [key];
    if (!has && key !== exclusive) next = next.filter((k) => k !== exclusive);
    onChange(next);
  };
  return (
    <fieldset>
      <legend className={LABEL}>{title}</legend>
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.key} className="flex items-start gap-2 rounded-lg px-2 py-1 text-sm text-slate-200 hover:bg-white/5">
            <input type="checkbox" className="mt-1" checked={value.includes(option.key)} onChange={() => toggle(option.key)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SubstanceForm({ initial, supplierNames, onCancel, onSaved }) {
  const { user } = useAuth();
  const actorName = user?.displayName || user?.email || "Unknown";
  const { siteNames, spaceNamesFor } = useSiteSpaceNames(true);
  const [form, setForm] = useState(() => ({
    ...initial,
    reviewDate: initial.reviewDate || nextReviewFrom(dateKey(new Date())),
  }));
  const [otherSupplier, setOtherSupplier] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const suppliers = namesWithCurrent(supplierNames, form.supplier);
  const sites = namesWithCurrent(siteNames, form.site);
  const locations = namesWithCurrent(spaceNamesFor(form.site), form.location);
  const isNew = !initial.id;

  function chooseFile(event) {
    const picked = event.target.files?.[0] || null;
    const problem = picked ? sdsProblem(picked) : "";
    if (problem) { setError(problem); setFile(null); event.target.value = ""; return; }
    setError("");
    setFile(picked);
  }

  async function save() {
    // a chosen file counts as the sheet for the checks below
    const found = validateSubstance({ ...form, sdsUrl: form.sdsUrl || (file ? "pending" : "") });
    setProblems(found);
    if (found.length) return;
    setBusy(true); setError("");
    try {
      await saveSubstance(form, { pendingFile: file, actorName });
      onSaved(isNew ? "Added to the register." : "Saved.");
    } catch (problem) {
      if (problem?.savedId) set({ id: problem.savedId });
      setError(problem?.savedId ? `The details were saved but the PDF did not upload (${problem.message}). Press Save to try the PDF again.` : problem?.message || "Could not save. Check you have permission.");
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-teal-300/30 bg-slate-900/80 p-4 shadow-lg" aria-label={isNew ? "Add a substance" : "Edit a substance"}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><FlaskConical className="h-5 w-5 text-teal-300" aria-hidden="true" /> {isNew ? "Add a substance" : `Edit ${initial.name}`}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-200" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Product name (as on the label)
          <input className={FIELD} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className={LABEL}>Supplier
          <select className={FIELD} value={otherSupplier ? OTHER : form.supplier} onChange={(e) => { if (e.target.value === OTHER) { setOtherSupplier(true); set({ supplier: "" }); } else { setOtherSupplier(false); set({ supplier: e.target.value }); } }}>
            <option value="">Choose…</option>
            {suppliers.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value={OTHER}>A supplier not in the list…</option>
          </select>
          {otherSupplier && <input className={FIELD} placeholder="Supplier name" value={form.supplier} onChange={(e) => set({ supplier: e.target.value })} />}
        </label>
        <label className={LABEL}>Site
          <select className={FIELD} value={form.site} onChange={(e) => set({ site: e.target.value, location: "" })}>
            <option value="">Choose…</option>
            {sites.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className={LABEL}>Stored in (room or cupboard)
          <select className={FIELD} value={form.location} onChange={(e) => set({ location: e.target.value })}>
            <option value="">Choose…</option>
            {locations.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <CheckGroup title="Hazard types" options={HAZARD_TYPES} value={form.hazards} onChange={(hazards) => set({ hazards })} />
        <CheckGroup title="Protective equipment" options={PPE_OPTIONS} value={form.ppe} onChange={(ppe) => set({ ppe })} />
        <CheckGroup title="First aid" options={FIRST_AID_OPTIONS} value={form.firstAid} onChange={(firstAid) => set({ firstAid })} exclusive="" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>Next review due
          <input type="date" className={FIELD} value={form.reviewDate} onChange={(e) => set({ reviewDate: e.target.value })} />
        </label>
        <div>
          <span className={LABEL}>Safety data sheet (PDF)</span>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
            {form.sdsUrl && !file && <span className="inline-flex items-center gap-1 text-emerald-300"><FileText className="h-4 w-4" aria-hidden="true" /> {form.sdsFileName || "Attached"}</span>}
            {file && <span className="inline-flex items-center gap-1 text-teal-200"><FileText className="h-4 w-4" aria-hidden="true" /> {file.name}</span>}
            <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5">
              {form.sdsUrl || file ? "Replace PDF" : "Choose PDF"}
              <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={chooseFile} />
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-400">The supplier must give you this. It is also on their website.</p>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 pl-7 text-sm text-rose-200" role="alert">
          {problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><Save className="h-4 w-4" aria-hidden="true" /> {busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200">Cancel</button>
      </div>
    </section>
  );
}

function Chips({ keys, label, tone = "slate" }) {
  const toneClass = tone === "amber" ? "border-amber-400/30 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-slate-200";
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((key) => <span key={key} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>{shortLabel(label(key))}</span>)}
    </div>
  );
}

export default function CoshhRegister() {
  const { can, user } = useAuth();
  const canManage = can("coshh.manage");
  const actor = { uid: user?.uid || "", name: user?.displayName || user?.email || "Unknown" };
  const { list, error: loadError } = useCoshhSubstances();
  const [supplierDocs, setSupplierDocs] = useState([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => onSnapshot(collection(db, "suppliers"), (snap) => setSupplierDocs(snap.docs.map((d) => d.data())), () => setSupplierDocs([])), []);

  const supplierNames = useMemo(() => {
    const names = new Set();
    supplierDocs.filter((s) => s.active !== false).forEach((s) => s.name && names.add(String(s.name).trim()));
    (list || []).forEach((s) => s.supplier && names.add(s.supplier));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [supplierDocs, list]);

  const now = new Date();
  const active = useMemo(() => (list || []).filter((s) => s.active !== false), [list]);
  const shown = useMemo(() => sortSubstances(searchSubstances((list || []).filter((s) => showArchived || s.active !== false), search), now), [list, search, showArchived]);
  const summary = reviewSummary(list || [], now);
  const places = useMemo(() => storagePlaces(list || []), [list]);

  async function run(id, work, done) {
    setBusyId(id); setError(""); setMessage("");
    try { await work(); setMessage(done); } catch (problem) { setError(problem?.message || "That didn't work. Check you have permission."); } finally { setBusyId(""); }
  }

  const printLabels = () => printHtmlDocument(coshhLabelsHtml(places, { urlFor: (place) => buildNfcUrl("coshh", place.key), qrFor: (link) => getQrImageUrl(link, 220) }));
  const printRegister = () => printHtmlDocument(coshhRegisterHtml(sortSubstances(active, now).map((s) => ({
    name: s.name, supplier: s.supplier,
    hazards: s.hazards.map((k) => shortLabel(hazardLabel(k))).join(", "),
    ppe: s.ppe.map((k) => shortLabel(ppeLabel(k))).join(", "),
    firstAid: s.firstAid.map((k) => firstAidLabel(k)).join("; "),
    place: [s.location, s.site].filter(Boolean).join(", "),
    review: `${ukDate(s.reviewDate)} (${REVIEW_STATUS_LABEL[reviewStatus(s, now)]})`,
  })), { generatedOn: `Printed ${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` }));

  async function viewSheet(s) {
    const problem = await openDocument({ url: s.sdsUrl, path: s.sdsPath, fileName: s.sdsFileName || "safety-data-sheet.pdf" });
    if (problem) setError(problem);
  }

  if (list === null) return <p className="text-sm text-slate-400">Opening the COSHH register…</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100"><FlaskConical className="h-5 w-5 text-teal-300" aria-hidden="true" /> COSHH register</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">The hazardous substances kept at the practice: what each is, what to wear, what to do if it splashes, where it lives and its safety data sheet. Review each at least once a year, or sooner if the product or how it is used changes. Cleaners can look any of this up on their phone, and a QR code on each cupboard opens its list.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={printRegister} disabled={!active.length} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 disabled:opacity-40"><Printer className="h-4 w-4" aria-hidden="true" /> Print register</button>
            {canManage && <button type="button" onClick={printLabels} disabled={!places.length} title="One QR label per cupboard or room, to stick on the door" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 disabled:opacity-40"><QrCode className="h-4 w-4" aria-hidden="true" /> Print cupboard labels</button>}
            {canManage && <button type="button" onClick={() => { setEditing(emptySubstance()); setMessage(""); setError(""); }} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-3 py-1.5 text-sm font-semibold text-slate-950"><Plus className="h-4 w-4" aria-hidden="true" /> Add a substance</button>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">{summary.total} product{summary.total === 1 ? "" : "s"}</span>
          {summary.overdue > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-rose-200"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> {summary.overdue} review{summary.overdue === 1 ? "" : "s"} overdue</span>}
          {summary.dueSoon > 0 && <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-200">{summary.dueSoon} due in the next 30 days</span>}
          {summary.total > 0 && summary.needsAttention === 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-200"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> All reviews in date</span>}
        </div>
      </section>

      {loadError && <p className="text-sm text-rose-300" role="alert">{loadError}</p>}
      {message && <p className="flex items-center gap-1 text-sm text-emerald-300" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {message}</p>}
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}

      {editing && (
        <SubstanceForm
          key={editing.id || "new"}
          initial={editing}
          supplierNames={supplierNames}
          onCancel={() => setEditing(null)}
          onSaved={(done) => { setEditing(null); setMessage(done); }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden="true" />
          <input className={`${FIELD} mt-0 pl-9`} placeholder="Search by product, supplier or cupboard" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the COSHH register" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived products</label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">
          {(list || []).length === 0 ? (canManage ? "Nothing in the register yet. Add each cleaning product and chemical the practice keeps." : "Nothing in the register yet.") : "No product matches that search."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => {
            const status = reviewStatus(s, now);
            return (
              <li key={s.id} className={`rounded-xl border border-white/10 bg-slate-900/60 p-3 ${s.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{s.name}{!s.active && <span className="ml-2 text-xs font-normal text-slate-400">(archived)</span>}</p>
                    <p className="text-sm text-slate-400">{s.supplier} · stored in {[s.location, s.site].filter(Boolean).join(", ") || "not set"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`} title={`Review date ${ukDate(s.reviewDate)}`}>{s.active ? reviewText(s, now) : "Archived"}</span>
                </div>
                <div className="mt-2 grid gap-2 text-sm lg:grid-cols-3">
                  <div><p className={LABEL}>Hazards</p><Chips keys={s.hazards} label={hazardLabel} tone="amber" /></div>
                  <div><p className={LABEL}>Wear</p><Chips keys={s.ppe} label={ppeLabel} /></div>
                  <div><p className={LABEL}>First aid</p><Chips keys={s.firstAid} label={firstAidLabel} /></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {s.sdsUrl
                    ? <button type="button" onClick={() => viewSheet(s)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Safety data sheet</button>
                    : <span className="text-sm text-rose-300">No safety data sheet attached</span>}
                  {canManage && s.active && (
                    <>
                      <button type="button" disabled={busyId === s.id} onClick={() => run(s.id, () => markReviewed(s, actor), `${s.name} reviewed. Next review ${ukDate(nextReviewFrom(dateKey(new Date())))}.`)} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300/40 px-3 py-1.5 text-sm font-semibold text-teal-200 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Mark as reviewed</button>
                      <button type="button" onClick={() => { setEditing(s); setMessage(""); setError(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100"><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</button>
                      <button type="button" disabled={busyId === s.id} onClick={() => run(s.id, () => setActive(s, false, actor.name), `${s.name} archived.`)} title="No longer kept at the practice. It stays on record." className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-300 disabled:opacity-40"><Archive className="h-4 w-4" aria-hidden="true" /> Archive</button>
                    </>
                  )}
                  {canManage && !s.active && (
                    <button type="button" disabled={busyId === s.id} onClick={() => run(s.id, () => setActive(s, true, actor.name), `${s.name} is back in the register.`)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 disabled:opacity-40"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore</button>
                  )}
                  {s.lastReviewedAt && <span className="text-xs text-slate-500">Last reviewed {ukDate(s.lastReviewedAt)}{s.lastReviewedByName ? ` by ${s.lastReviewedByName}` : ""}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
