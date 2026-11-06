import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { Camera, CheckCircle2, FilePlus2, Loader2, UploadCloud } from "lucide-react";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import { CertificateForm, RenewForm } from "@/components/compliance/CertificatesRegister";
import { SubstanceForm } from "@/components/compliance/CoshhRegister";
import { INTAKE_KINDS, cardFor, describeProblem, findRenewalTarget, ukDay } from "@/modules/documents/documentIntake";
import { ACCEPT, DROP_HINT, fileProblem, prepareFile, readDocument, recordAfterReading } from "@/modules/documents/documentIntakeService";
import { certLabel } from "@/modules/certificates/certificates";
import { useCertificates } from "@/modules/certificates/certificateService";

// Add a document: drop a certificate or a COSHH safety data sheet (or, on a phone, take a photo of it) and the register's own form opens already filled in from it, with a panel showing
// what was read and the words it came from. Nothing is saved until the person has checked the form and ticked that they have. See modules/documents/documentIntake.js for the rules.
// In Demo and Training mode a made-up sample is used and nothing leaves the device.

const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/5 disabled:opacity-40";
const FIELD = "mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60 [&>option]:bg-slate-900";

export default function DocumentIntakePanel({ phone = false }) {
  const navigate = useNavigate();
  const demo = isSafeSyntheticMode();
  const { siteNames } = useSiteSpaceNames(true);
  const { list: certificates } = useCertificates(true);
  const [supplierDocs, setSupplierDocs] = useState([]);
  const [kind, setKind] = useState("auto");
  const [stage, setStage] = useState("pick"); // pick | reading | card | other | done
  const [pdf, setPdf] = useState(null); // the PDF that will be kept as the record
  const [original, setOriginal] = useState(null); // the file as it was dropped, so it can be read again as another kind
  const [sourceNote, setSourceNote] = useState(""); // how the file was handled (an email attachment was used, a text copy was made)
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [choice, setChoice] = useState(""); // "" | "renew" | "new": for a certificate that looks like a renewal
  const [over, setOver] = useState(false);
  const fileInput = useRef(null);
  const photoInput = useRef(null);

  useEffect(() => {
    if (demo) return undefined;
    return onSnapshot(collection(db, "suppliers"), (snap) => setSupplierDocs(snap.docs.map((d) => d.data())), () => setSupplierDocs([]));
  }, [demo]);
  const supplierNames = useMemo(() => [...new Set(supplierDocs.filter((s) => s.active !== false && s.name).map((s) => String(s.name).trim()))].sort((a, b) => a.localeCompare(b)), [supplierDocs]);

  const card = useMemo(() => {
    const built = result ? cardFor(result, { siteNames, supplierNames }) : null;
    return built ? { ...built, evidence: { ...built.evidence, sourceNote } } : null;
  }, [result, siteNames, supplierNames, sourceNote]);
  const target = useMemo(() => (card?.kind === "certificate" ? findRenewalTarget(certificates || [], card.initial) : null), [card, certificates]);

  const reset = () => { setStage("pick"); setPdf(null); setOriginal(null); setSourceNote(""); setResult(null); setError(""); setSaved(""); setChoice(""); };

  async function read(file, as = kind) {
    setError("");
    const problem = fileProblem(file);
    if (problem) { setError(problem); return; }
    setStage("reading");
    try {
      const prepared = await prepareFile(file);
      const found = await readDocument(prepared.send, as);
      setOriginal(file);
      setPdf(recordAfterReading(prepared, found, file));
      setSourceNote(prepared.note);
      setResult(found);
      setChoice("");
      setStage(found.kind === "certificate" || found.kind === "coshh" ? "card" : "other");
    } catch (problemFound) {
      setError(problemFound?.code ? describeProblem(problemFound) : problemFound?.message || describeProblem(problemFound));
      setStage("pick");
    }
  }

  const onDrop = (event) => { event.preventDefault(); setOver(false); const file = event.dataTransfer?.files?.[0]; if (file) read(file); };
  const onPicked = (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) read(file); };

  if (stage === "reading") {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-center text-slate-100" role="status">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-300" aria-hidden="true" />
        <p className="mt-3 font-semibold">Reading the document…</p>
        <p className="text-sm text-slate-400">This takes about 10 to 30 seconds.</p>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-slate-100" role="status">
        <p className="flex items-center gap-2 font-semibold text-emerald-200"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> {saved}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={reset}><FilePlus2 className="h-4 w-4" aria-hidden="true" /> Add another document</button>
          <button type="button" className={BTN} onClick={() => navigate(phone ? "/" : "/compliance")}>{phone ? "Back home" : "Open Compliance"}</button>
        </div>
      </div>
    );
  }

  if (stage === "other") {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-slate-100">
        <p className="font-semibold text-amber-200">I could not tell what that document is.</p>
        {(result?.warnings || []).map((w) => <p key={w} className="mt-1 text-sm">{w}</p>)}
        <p className="mt-2 text-sm text-slate-300">If you know what it is, tell me and I will read it that way.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={() => read(original, "certificate")}>Read it as a certificate</button>
          <button type="button" className={BTN} onClick={() => read(original, "coshh")}>Read it as a COSHH data sheet</button>
          <button type="button" className={BTN} onClick={reset}>Start again</button>
        </div>
      </div>
    );
  }

  if (stage === "card" && card) {
    const common = { onCancel: reset, supplierNames, initialFile: pdf, evidence: card.evidence, compact: phone };
    const done = (message) => { setSaved(message); setStage("done"); };
    if (card.kind === "coshh") return <SubstanceForm key={pdf?.name} initial={card.initial} onSaved={done} {...common} />;
    if (target && !choice) {
      return (
        <div className="rounded-2xl border border-teal-300/30 bg-slate-900/80 p-5 text-slate-100">
          <p className="font-semibold">This looks like a renewal.</p>
          <p className="mt-1 text-sm text-slate-300">{certLabel(target)} at {target.site} is already on the register{target.expiryDate ? ` and runs out on ${ukDay(target.expiryDate)}` : ""}. Renewing it keeps the old one in its history, so there is not a second record.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => setChoice("renew")}>Renew that one</button>
            <button type="button" className={BTN} onClick={() => setChoice("new")}>Add as a new certificate</button>
            <button type="button" className={BTN} onClick={reset}>Cancel</button>
          </div>
        </div>
      );
    }
    if (target && choice === "renew") {
      const values = { completedOn: card.initial.completedOn, expiryDate: card.initial.expiryDate, provider: card.initial.provider, reference: card.initial.reference, engineer: card.initial.engineer, findings: card.initial.findings };
      return <RenewForm key={pdf?.name} cert={target} initialValues={values} onDone={done} {...common} />;
    }
    return <CertificateForm key={pdf?.name} initial={card.initial} onSaved={done} {...common} />;
  }

  return (
    <div className="space-y-4 text-slate-100">
      {demo && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">Demo mode: whatever you drop in, a made-up sample is read. Nothing is sent anywhere.</p>}
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">What is it?
        <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value)}>{INTAKE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
      </label>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center ${over ? "border-teal-300 bg-teal-500/10" : "border-white/20 bg-slate-900/60"}`}
      >
        <UploadCloud className="mx-auto h-10 w-10 text-teal-300" aria-hidden="true" />
        <p className="mt-2 font-semibold">{phone ? "Take a photo of the document, or choose a file" : "Drop a certificate or safety data sheet here"}</p>
        <p className="mt-1 text-sm text-slate-400">{DROP_HINT} Primovex reads it and fills in the form; you check it before anything is saved.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {phone && <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-500/90 px-5 font-bold text-slate-950" onClick={() => photoInput.current?.click()}><Camera className="h-5 w-5" aria-hidden="true" /> Take a photo</button>}
          <button type="button" className={phone ? "min-h-12 rounded-xl border border-white/20 px-5 font-bold" : BTN} onClick={() => fileInput.current?.click()}>Choose a file</button>
        </div>
        <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={onPicked} />
        <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPicked} />
      </div>
      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-200" role="alert">{error}</p>}
    </div>
  );
}
