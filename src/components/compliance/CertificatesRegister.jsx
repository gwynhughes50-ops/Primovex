import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, ExternalLink, FileBadge, FileText, Pencil, Plus, Printer, RefreshCw, RotateCcw, Archive, Save, Search, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { useAuth } from "@/contexts/AuthContext";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import { namesWithCurrent } from "@/lib/stockPickerOptions";
import { printHtmlDocument } from "@/lib/printHtmlDocument";
import { openDocument } from "@/lib/openDocument";
import {
  CERT_TYPES, STATUS_LABEL, WARN_DAYS, certLabel, certStatus, certSummary, emptyCertificate, expiryText, registerRows, searchCertificates, sortCertificates, suggestedExpiry, validateCertificate,
} from "@/modules/certificates/certificates";
import { certificatesRegisterHtml } from "@/modules/certificates/certificatesReport";
import { pdfProblem, renewCertificate, restoreCertificate, retireCertificate, saveCertificate, useCertificates } from "@/modules/certificates/certificateService";

// Compliance > Certificates: the gas safety certificate, the electrical test, the fire risk assessment, the extinguisher
// service and the rest, each with who did it, when, when it runs out and the PDF, so nothing quietly expires. The caretaker
// and practice manager keep it up to date; anyone with compliance access can read it.

const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60 [&>option]:bg-slate-900";
const LABEL = "block text-xs font-semibold uppercase tracking-wide text-slate-400";
const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40";
const OTHER = "__other";
const STATUS_STYLE = {
  expired: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  missing: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  "due-soon": "border-amber-400/40 bg-amber-500/10 text-amber-200",
  ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
};
const uk = (key) => (key ? key.split("-").reverse().join("/") : "not set");

function CertificateForm({ initial, supplierNames, onCancel, onSaved }) {
  const { user, displayName } = useAuth();
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "Unknown" };
  const { siteNames } = useSiteSpaceNames(true);
  const [form, setForm] = useState(initial);
  const [touchedExpiry, setTouchedExpiry] = useState(Boolean(initial.id));
  const [otherSupplier, setOtherSupplier] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState("");
  const isNew = !initial.id;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const sites = namesWithCurrent(siteNames, form.site);
  const suppliers = namesWithCurrent(supplierNames, form.provider);

  // the usual expiry follows the type and the date it was done, until someone sets it themselves
  const withSuggestion = (patch) => setForm((f) => {
    const next = { ...f, ...patch };
    return touchedExpiry ? next : { ...next, expiryDate: suggestedExpiry(next.type, next.completedOn) || next.expiryDate };
  });

  function chooseFile(event) {
    const picked = event.target.files?.[0] || null;
    const problem = picked ? pdfProblem(picked) : "";
    if (problem) { setError(problem); setFile(null); event.target.value = ""; return; }
    setError(""); setFile(picked);
  }

  async function save() {
    const found = validateCertificate({ ...form, certUrl: form.certUrl || (file ? "pending" : "") });
    setProblems(found);
    if (found.length) return;
    setBusy(true); setError("");
    try {
      await saveCertificate(form, { pendingFile: file, actor });
      onSaved(isNew ? "Added to the register." : "Saved.");
    } catch (problem) {
      if (problem?.savedId) set({ id: problem.savedId });
      setError(problem?.savedId ? `The details were saved but the PDF did not upload (${problem.message}). Press Save to try the PDF again.` : problem?.message || "Could not save. Check you have permission.");
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-teal-300/30 bg-slate-900/80 p-4 shadow-lg" aria-label={isNew ? "Add a certificate" : "Edit a certificate"}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-slate-100"><FileBadge className="h-5 w-5 text-teal-300" aria-hidden="true" /> {isNew ? "Add a certificate" : `Edit ${certLabel(initial)}`}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-200" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>What is it
          <select className={FIELD} value={form.type} onChange={(e) => withSuggestion({ type: e.target.value })}>{CERT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        </label>
        {form.type === "other" && <label className={LABEL}>Name it<input className={FIELD} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="e.g. Pest control contract" /></label>}
        <label className={LABEL}>Site it covers
          {sites.length > 0
            ? <select className={FIELD} value={form.site} onChange={(e) => set({ site: e.target.value })}><option value="">Choose…</option>{sites.map((name) => <option key={name} value={name}>{name}</option>)}</select>
            : <input className={FIELD} value={form.site} onChange={(e) => set({ site: e.target.value })} placeholder="Site name" />}
        </label>
        <label className={LABEL}>Done by (contractor or insurer)
          <select className={FIELD} value={otherSupplier ? OTHER : form.provider} onChange={(e) => { if (e.target.value === OTHER) { setOtherSupplier(true); set({ provider: "" }); } else { setOtherSupplier(false); set({ provider: e.target.value }); } }}>
            <option value="">Choose…</option>
            {suppliers.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value={OTHER}>Someone not in the list…</option>
          </select>
          {otherSupplier && <input className={FIELD} placeholder="Name" value={form.provider} onChange={(e) => set({ provider: e.target.value })} />}
        </label>
        <label className={LABEL}>Date it was done<input type="date" className={FIELD} value={form.completedOn} onChange={(e) => withSuggestion({ completedOn: e.target.value })} /></label>
        <label className={LABEL}>Runs out or next due<input type="date" className={FIELD} value={form.expiryDate} onChange={(e) => { setTouchedExpiry(true); set({ expiryDate: e.target.value }); }} />
          <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">Filled in from the usual length for this kind; change it if the certificate says different.</span>
        </label>
        <label className={LABEL}>Certificate number (optional)<input className={FIELD} value={form.reference} onChange={(e) => set({ reference: e.target.value })} maxLength={80} /></label>
        <div>
          <span className={LABEL}>Certificate (PDF)</span>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
            {form.certUrl && !file && <span className="inline-flex items-center gap-1 text-emerald-300"><FileText className="h-4 w-4" aria-hidden="true" /> {form.certFileName || "Attached"}</span>}
            {file && <span className="inline-flex items-center gap-1 text-teal-200"><FileText className="h-4 w-4" aria-hidden="true" /> {file.name}</span>}
            <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-white/5">{form.certUrl || file ? "Replace PDF" : "Choose PDF"}<input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={chooseFile} /></label>
          </div>
        </div>
      </div>
      {problems.length > 0 && <ul className="mt-3 list-disc space-y-0.5 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 pl-7 text-sm text-rose-200" role="alert">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"><Save className="h-4 w-4" aria-hidden="true" /> {busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={BTN}>Cancel</button>
      </div>
    </section>
  );
}

function RenewForm({ cert, supplierNames, onCancel, onDone }) {
  const { user, displayName } = useAuth();
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "Unknown" };
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [completedOn, setCompletedOn] = useState(todayKey);
  const [expiryDate, setExpiryDate] = useState(suggestedExpiry(cert.type, todayKey));
  const [touched, setTouched] = useState(false);
  const [provider, setProvider] = useState(cert.provider);
  const [reference, setReference] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suppliers = namesWithCurrent(supplierNames, provider);

  async function save() {
    setBusy(true); setError("");
    try {
      await renewCertificate(cert, { completedOn, expiryDate, provider, reference, file, actor });
      onDone(`${certLabel(cert)} renewed. It now runs out on ${uk(expiryDate)}.`);
    } catch (problem) { setError(problem?.message || "Could not record the renewal. Check you have permission."); } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-xl border border-teal-300/30 bg-slate-950/50 p-3">
      <p className="text-sm font-semibold text-slate-100">Record a renewal of {certLabel(cert)}</p>
      <p className="text-xs text-slate-400">The old certificate is kept in its history.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <label className={LABEL}>Date done<input type="date" className={FIELD} value={completedOn} onChange={(e) => { setCompletedOn(e.target.value); if (!touched) setExpiryDate(suggestedExpiry(cert.type, e.target.value)); }} /></label>
        <label className={LABEL}>New date it runs out<input type="date" className={FIELD} value={expiryDate} onChange={(e) => { setTouched(true); setExpiryDate(e.target.value); }} /></label>
        <label className={LABEL}>Done by<select className={FIELD} value={provider} onChange={(e) => setProvider(e.target.value)}>{suppliers.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className={LABEL}>Certificate number<input className={FIELD} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200">
        {file && <span className="inline-flex items-center gap-1 text-teal-200"><FileText className="h-4 w-4" aria-hidden="true" /> {file.name}</span>}
        <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/5">{file ? "Replace PDF" : "Choose the new PDF"}<input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0] || null; const p = f ? pdfProblem(f) : ""; if (p) { setError(p); setFile(null); e.target.value = ""; } else { setError(""); setFile(f); } }} /></label>
      </div>
      {error && <p className="mt-2 text-sm text-rose-300" role="alert">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{busy ? "Saving…" : "Save renewal"}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={BTN}>Cancel</button>
      </div>
    </div>
  );
}

export default function CertificatesRegister() {
  const { can, isAdmin, user, displayName } = useAuth();
  const canManage = can("compliance.manageAssets") || isAdmin;
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "Unknown" };
  const { list, error: loadError } = useCertificates(true);
  const [supplierDocs, setSupplierDocs] = useState([]);
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState("");
  const [history, setHistory] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (isSafeSyntheticMode()) return undefined;
    return onSnapshot(collection(db, "suppliers"), (snap) => setSupplierDocs(snap.docs.map((d) => d.data())), () => setSupplierDocs([]));
  }, []);

  const supplierNames = useMemo(() => {
    const names = new Set();
    supplierDocs.filter((s) => s.active !== false).forEach((s) => s.name && names.add(String(s.name).trim()));
    (list || []).forEach((c) => c.provider && names.add(c.provider));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [supplierDocs, list]);

  const now = new Date();
  const all = list || [];
  const active = useMemo(() => all.filter((c) => c.active !== false), [all]);
  const retired = useMemo(() => all.filter((c) => c.active === false), [all]);
  const shown = useMemo(() => sortCertificates(searchCertificates(active, search), now), [active, search]);
  const summary = certSummary(all, now);

  async function run(id, work, done) {
    setBusyId(id); setError(""); setMessage("");
    try { await work(); setMessage(done); } catch (problem) { setError(problem?.message || "That didn't work. Check you have permission."); } finally { setBusyId(""); }
  }

  const printRegister = () => printHtmlDocument(certificatesRegisterHtml(registerRows(all, now), { generatedOn: `Printed ${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` }));
  async function openPdf(url, path, fileName) {
    const problem = await openDocument({ url, path, fileName: fileName || "certificate.pdf" });
    if (problem) setError(problem);
  }

  if (list === null) return <p className="text-sm text-slate-400">Opening the certificates register…</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100"><FileBadge className="h-5 w-5 text-teal-300" aria-hidden="true" /> Certificates and servicing</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">The gas safety certificate, electrical test, fire risk assessment, extinguisher service and the rest: who did it, when, when it runs out and the PDF. A certificate shows as running out {WARN_DAYS} days before, so there is time to book the contractor.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={printRegister} disabled={!active.length} className={BTN}><Printer className="h-4 w-4" aria-hidden="true" /> Print register</button>
            {canManage && <button type="button" onClick={() => { setEditing({ ...emptyCertificate() }); setMessage(""); setError(""); }} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-3 py-1.5 text-sm font-semibold text-slate-950"><Plus className="h-4 w-4" aria-hidden="true" /> Add a certificate</button>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">{summary.total} certificate{summary.total === 1 ? "" : "s"}</span>
          {summary.expired > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-3 py-1 text-rose-200"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> {summary.expired} expired</span>}
          {summary.dueSoon > 0 && <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-200">{summary.dueSoon} running out in {WARN_DAYS} days</span>}
          {summary.noPdf > 0 && <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-200">{summary.noPdf} without the PDF</span>}
          {summary.total > 0 && summary.needsAttention === 0 && summary.noPdf === 0 && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-200"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> All in date</span>}
        </div>
      </section>

      {loadError && <p className="text-sm text-rose-300" role="alert">{loadError}</p>}
      {message && <p className="flex items-center gap-1 text-sm text-emerald-300" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {message}</p>}
      {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}

      {editing && <CertificateForm key={editing.id || "new"} initial={editing} supplierNames={supplierNames} onCancel={() => setEditing(null)} onSaved={(done) => { setEditing(null); setMessage(done); }} />}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden="true" />
        <input className={`${FIELD} mt-0 pl-9`} placeholder="Search by certificate, contractor or site" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the certificates register" />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">{all.length === 0 ? (canManage ? "Nothing on the register yet. Add the gas safety certificate, electrical test, fire risk assessment and the others." : "Nothing on the register yet.") : "Nothing matches that search."}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => {
            const status = certStatus(c, now);
            return (
              <li key={c.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100">{certLabel(c)}</p>
                    <p className="text-sm text-slate-400">{[c.site, c.provider, c.reference && `No. ${c.reference}`].filter(Boolean).join(" · ")} · done {uk(c.completedOn)} · runs out {uk(c.expiryDate)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>{expiryText(c, now)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {c.certUrl ? <button type="button" onClick={() => openPdf(c.certUrl, c.certPath, c.certFileName)} className={BTN}><ExternalLink className="h-4 w-4" aria-hidden="true" /> Open the certificate</button> : <span className="text-sm text-rose-300">No PDF attached</span>}
                  {canManage && (
                    <>
                      <button type="button" onClick={() => { setRenewing(renewing === c.id ? "" : c.id); setMessage(""); setError(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300/40 px-3 py-1.5 text-sm font-semibold text-teal-200 hover:bg-teal-500/10"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Record a renewal</button>
                      <button type="button" onClick={() => { setEditing(c); setMessage(""); setError(""); }} className={BTN}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</button>
                      <button type="button" disabled={busyId === c.id} onClick={() => run(c.id, () => retireCertificate(c, "No longer needed", actor), `${certLabel(c)} retired. It stays on record.`)} className={BTN}><Archive className="h-4 w-4" aria-hidden="true" /> Retire</button>
                    </>
                  )}
                  {c.previous.length > 0 && <button type="button" onClick={() => setHistory(history === c.id ? "" : c.id)} className="text-xs font-semibold text-slate-400 underline">{history === c.id ? "Hide" : "Show"} {c.previous.length} earlier</button>}
                </div>
                {renewing === c.id && <RenewForm cert={c} supplierNames={supplierNames} onCancel={() => setRenewing("")} onDone={(done) => { setRenewing(""); setMessage(done); }} />}
                {history === c.id && (
                  <ul className="mt-3 space-y-1 border-t border-white/5 pt-2 text-sm text-slate-300">
                    {[...c.previous].reverse().map((p, i) => (
                      <li key={`${p.replacedOn}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                        <span>Done {uk(p.completedOn)}, ran out {uk(p.expiryDate)}{p.provider ? ` · ${p.provider}` : ""}{p.reference ? ` · No. ${p.reference}` : ""} <span className="text-slate-500">(replaced {uk(p.replacedOn)}{p.replacedBy ? ` by ${p.replacedBy}` : ""})</span></span>
                        {p.certUrl && <button type="button" onClick={() => openPdf(p.certUrl, p.certPath, p.certFileName)} className="text-xs font-semibold text-teal-300 underline">Open</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {retired.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowRetired((v) => !v)} className="text-xs font-semibold text-slate-400 underline">{showRetired ? "Hide" : "Show"} {retired.length} retired</button>
          {showRetired && (
            <ul className="mt-2 space-y-2">
              {retired.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-950/30 px-3 py-2 text-sm text-slate-300">
                  <span>{certLabel(c)} <span className="text-xs text-slate-500">· {c.site}{c.expiryDate ? `, ran out ${uk(c.expiryDate)}` : ""}</span></span>
                  {canManage && <button type="button" disabled={busyId === c.id} onClick={() => run(c.id, () => restoreCertificate(c, actor), `${certLabel(c)} is back on the register.`)} className={BTN}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
