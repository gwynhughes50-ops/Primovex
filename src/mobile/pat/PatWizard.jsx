import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, DoorOpen, Plus, ScanLine, Search, XCircle } from "lucide-react";
import MobileBarcodeScanner from "@/components/ui/MobileBarcodeScanner";
import { useAuth } from "@/contexts/AuthContext";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import useComplianceSites from "@/modules/compliance/useComplianceSites";
import {
  FUSE_RATINGS, PAT_CATEGORIES, PAT_FAIL_REASONS, addMonthsKey, byRoom, categoryOf, dateKeyOf, dueSummary, evaluateTest, findAppliance, intervalFor, patStatus, roundSummary, searchAppliances, ukDate,
} from "@/modules/pat/pat";
import { addPatAsset, recordPatTest } from "@/modules/pat/patService";

// PAT testing, one appliance at a time, on the caretaker's phone. He tests with his own tester and tells Primovex what it said:
// find the appliance (scan its barcode, type its tag, or pick it from its room), look it over, earth, insulation, fuse, then pass
// or fail. A pass sets when it is next due from what kind of appliance it is; a fail takes it out of use and tells the people
// who need to know. The person and the time are never asked for.

const BTN = "min-h-14 rounded-2xl border px-4 text-base font-bold";
const NEUTRAL = "border-[var(--medtrak-border)] bg-[var(--medtrak-panel)]";
const INPUT = "mt-2 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 text-base outline-none focus:border-[var(--medtrak-accent)]";

const STATE_CHIP = {
  "out-of-use": ["Out of use", "border-rose-500/40 bg-rose-500/10 text-rose-700"],
  overdue: ["Overdue", "border-rose-500/40 bg-rose-500/10 text-rose-700"],
  never: ["Not tested yet", "border-amber-500/40 bg-amber-500/10 text-amber-800"],
  "due-soon": ["Due soon", "border-amber-500/40 bg-amber-500/10 text-amber-800"],
  ok: ["In date", "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"],
};

function Chip({ state }) {
  const [label, tone] = STATE_CHIP[state] || STATE_CHIP.ok;
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>;
}

function ApplianceRow({ row, onPick }) {
  const { asset, state } = row;
  return (
    <button type="button" onClick={() => onPick(asset)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left ${NEUTRAL}`}>
      <span className="min-w-0">
        <span className="block truncate font-bold">{asset.tag} · {asset.name}</span>
        <span className="block truncate text-xs text-[var(--medtrak-muted)]">{asset.location || "No room given"}{asset.nextDueOn ? ` · due ${ukDate(asset.nextDueOn)}` : ""}</span>
      </span>
      <Chip state={state} />
    </button>
  );
}

function YesNo({ yes, no, onYes, onNo, yesLabel = "Yes", noLabel = "No", picked }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button type="button" onClick={onYes} aria-pressed={picked === true} className={`${BTN} ${picked === true ? "border-emerald-500 bg-emerald-500 text-white" : "border-emerald-500/50 bg-emerald-500/10 text-emerald-800"}`}><CheckCircle2 className="mx-auto mb-1 h-7 w-7" aria-hidden="true" />{yesLabel}</button>
      <button type="button" onClick={onNo} aria-pressed={picked === false} className={`${BTN} ${picked === false ? "border-rose-600 bg-rose-600 text-white" : "border-rose-500/50 bg-rose-500/10 text-rose-800"}`}><XCircle className="mx-auto mb-1 h-7 w-7" aria-hidden="true" />{noLabel}</button>
    </div>
  );
}

export default function PatWizard({ assets = [], settings = {}, onClose }) {
  const { user, displayName, email } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || "", displayName: displayName || user?.displayName || "", email: email || user?.email || "" }), [user, displayName, email]);
  const sites = useComplianceSites();
  const { spaceNamesFor } = useSiteSpaceNames(true);
  const rooms = useMemo(() => spaceNamesFor(sites.nameOf?.(sites.newSiteId) || ""), [spaceNamesFor, sites]);

  const [step, setStep] = useState("find");
  const [trail, setTrail] = useState([]);
  const [appliance, setAppliance] = useState(null);
  const [answers, setAnswers] = useState({});
  const [typed, setTyped] = useState("");
  const [roomPick, setRoomPick] = useState("");
  const [newForm, setNewForm] = useState({ tag: "", name: "", category: "", cls: "I", location: "" });
  const [showFailing, setShowFailing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [round, setRound] = useState([]);
  const [message, setMessage] = useState("");

  const summary = useMemo(() => dueSummary(assets), [assets]);
  const matches = useMemo(() => searchAppliances(assets, typed), [assets, typed]);
  const roomsList = useMemo(() => byRoom(assets), [assets]);
  const cls = answers.cls === "II" ? "II" : "I";
  const verdict = useMemo(() => evaluateTest(answers), [answers]);
  const steps = useMemo(() => ["visual", ...(cls === "II" ? [] : ["earth"]), "insulation", "fuse", "result"], [cls]);

  const go = (next) => { setError(""); setMessage(""); setTrail((t) => [...t, step]); setStep(next); };
  const back = () => { setError(""); const prev = trail.at(-1); if (!prev) { onClose?.(round); return; } setTrail((t) => t.slice(0, -1)); setStep(prev); };
  const set = (patch) => { setError(""); setAnswers((a) => ({ ...a, ...patch })); };

  function choose(asset) {
    setAppliance(asset);
    setAnswers({ cls: asset.cls === "II" ? "II" : categoryOf(asset.category).defaultClass === "II" ? "II" : "I", fuseRating: asset.fuseRating || "", failReasons: [], notes: "" });
    setShowFailing(false);
    setSaved(null);
    setError("");
    setMessage("");
    setTrail(["find"]);
    setStep("visual");
  }

  function pickTyped(value = typed) {
    const found = findAppliance(assets, value);
    if (found) { choose(found); return true; }
    return false;
  }

  function scanned(code) {
    if (pickTyped(code)) return;
    setTyped(String(code || ""));
    setMessage(`No appliance is registered with "${String(code || "").slice(0, 40)}". Check the tag, or add it as a new one.`);
  }

  function answerVisual(ok) {
    set({ visualOk: ok });
    // a damaged item is not tested further
    if (!ok) { setTrail((t) => [...t, "visual"]); setStep("result"); setShowFailing(true); return; }
    setTrail((t) => [...t, "visual"]);
    setStep(cls === "II" ? "insulation" : "earth");
  }

  async function saveNew() {
    if (!newForm.tag.trim()) return setError("Give it the tag number on its label.");
    if (!newForm.name.trim()) return setError("Say what it is, for example Kettle.");
    if (!newForm.category) return setError("Choose what kind of appliance it is.");
    if (rooms.length && !newForm.location) return setError("Choose the room it is in.");
    setBusy(true); setError("");
    try {
      const made = await addPatAsset({ siteId: sites.newSiteId, ...newForm });
      choose({ id: made.id, siteId: sites.newSiteId, active: true, ...newForm, tag: newForm.tag.trim(), name: newForm.name.trim() });
    } catch (failure) {
      setError(failure?.message || "That could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(final) {
    setBusy(true); setError("");
    try {
      const test = await recordPatTest({ asset: appliance, answers, final, actor, settings });
      setSaved(test);
      setRound((r) => [...r, test]);
      setTrail([]);
      setStep("saved");
    } catch (failure) {
      setError(failure?.message || "That could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const finish = () => onClose?.(round);
  const reasons = answers.failReasons || [];
  const toggleReason = (key) => set({ failReasons: reasons.includes(key) ? reasons.filter((r) => r !== key) : [...reasons, key] });
  const stepNumber = steps.indexOf(step) + 1;
  const months = appliance ? intervalFor(appliance.category || "other", settings) : 0;
  const passDue = appliance ? ukDate(addMonthsKey(dateKeyOf(new Date()), months)) : "";

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-[var(--medtrak-bg)] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 text-[var(--medtrak-text)]" role="dialog" aria-modal="true" aria-label="PAT testing">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between gap-3">
          {trail.length
            ? <button type="button" onClick={back} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--medtrak-border)]" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
            : <span className="h-11 w-11" aria-hidden="true" />}
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">PAT testing{round.length ? ` · ${round.length} done` : ""}</p>
          <button type="button" onClick={finish} className="rounded-full border border-[var(--medtrak-border)] px-3 py-2 text-sm font-semibold">{round.length ? "Finish" : "Close"}</button>
        </div>

        {appliance && !["find", "room", "new", "summary"].includes(step) && (
          <div className="mt-3 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-4 py-3">
            <p className="font-bold">{appliance.tag} · {appliance.name}</p>
            <p className="text-xs text-[var(--medtrak-muted)]">{appliance.location || "No room given"} · {categoryOf(appliance.category).label} · Class {cls}</p>
          </div>
        )}
        {steps.includes(step) && (
          <div className="mt-3" aria-label={`Step ${stepNumber} of ${steps.length}`}>
            <div className="flex gap-1.5">{steps.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i < stepNumber ? "bg-[var(--medtrak-accent)]" : "bg-[var(--medtrak-border)]"}`} />)}</div>
            <p className="mt-1 text-xs text-[var(--medtrak-muted)]">Step {stepNumber} of {steps.length}</p>
          </div>
        )}

        {step === "find" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">Which appliance?</h2>
            {summary.counts.total > 0 && <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{summary.needsAttention ? `${summary.needsAttention} of ${summary.counts.total} need testing${summary.counts.overdue ? `, ${summary.counts.overdue} overdue` : ""}.` : `All ${summary.counts.total} are in date.`}</p>}
            <button type="button" onClick={() => document.querySelector("[data-pat-scan-button]")?.click()} className={`${BTN} mt-4 flex w-full items-center justify-center gap-2 border-transparent bg-[var(--medtrak-accent)] text-white`}><ScanLine className="h-6 w-6" aria-hidden="true" /> Scan its barcode or QR</button>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Or type its tag number or name
              <span className="relative mt-2 block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--medtrak-muted)]" aria-hidden="true" />
                <input value={typed} onChange={(e) => { setTyped(e.target.value); setMessage(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!pickTyped()) setMessage(`No appliance is registered with "${typed.slice(0, 40)}".`); } }} placeholder="e.g. R-12" autoComplete="off" className="min-h-14 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] pl-12 pr-4 text-base font-normal normal-case outline-none focus:border-[var(--medtrak-accent)]" />
              </span>
            </label>
            {message && <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900" role="status">{message}</p>}
            {matches.length > 0 && <div className="mt-3 space-y-2">{matches.map((a) => <ApplianceRow key={a.id} row={{ asset: a, ...patStatus(a) }} onPick={choose} />)}</div>}
            {typed.trim() && matches.length === 0 && !message && <p className="mt-3 text-sm text-[var(--medtrak-muted)]">Nothing matches that yet.</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => go("room")} className={`${BTN} ${NEUTRAL} flex flex-col items-center gap-1 text-sm`}><DoorOpen className="h-6 w-6" aria-hidden="true" /> Choose by room</button>
              <button type="button" onClick={() => { setNewForm((f) => ({ ...f, tag: typed.trim() })); go("new"); }} className={`${BTN} ${NEUTRAL} flex flex-col items-center gap-1 text-sm`}><Plus className="h-6 w-6" aria-hidden="true" /> Not on the list</button>
            </div>
          </section>
        )}

        {step === "room" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">{roomPick || "Which room?"}</h2>
            {!roomPick ? (
              <div className="mt-4 space-y-2">
                {roomsList.length === 0 && <p className="text-sm text-[var(--medtrak-muted)]">There are no appliances on the register yet. Add the first with "Not on the list".</p>}
                {roomsList.map((r) => (
                  <button key={r.room} type="button" onClick={() => setRoomPick(r.room)} className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left ${NEUTRAL}`}>
                    <span className="font-bold">{r.room}</span>
                    <span className="flex items-center gap-2 text-sm text-[var(--medtrak-muted)]">{r.attention ? <b className="text-amber-800">{r.attention} to test</b> : "All in date"}<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {(roomsList.find((r) => r.room === roomPick)?.rows || []).map((row) => <ApplianceRow key={row.asset.id} row={row} onPick={choose} />)}
                <button type="button" onClick={() => setRoomPick("")} className="mt-2 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 font-semibold">Choose a different room</button>
              </div>
            )}
          </section>
        )}

        {step === "new" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">Add this appliance</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">It goes on the register, and then you test it.</p>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Tag number on its label
              <input value={newForm.tag} onChange={(e) => setNewForm((f) => ({ ...f, tag: e.target.value }))} className={INPUT} placeholder="e.g. R-12" autoComplete="off" />
            </label>
            <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">What is it?
              <input value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} className={INPUT} placeholder="e.g. Kettle" autoComplete="off" />
            </label>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">What kind?</p>
            <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Kind of appliance">
              {PAT_CATEGORIES.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={newForm.category === c.key} onClick={() => setNewForm((f) => ({ ...f, category: c.key, cls: c.defaultClass }))} className={`rounded-2xl border px-4 py-3 text-left ${newForm.category === c.key ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : NEUTRAL}`}>
                  <span className="block font-bold">{c.label}</span><span className={`block text-xs ${newForm.category === c.key ? "text-white/85" : "text-[var(--medtrak-muted)]"}`}>{c.examples}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Class</p>
            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Class">
              {[["I", "Class I", "Earthed: three-pin plug with an earth"], ["II", "Class II", "Double insulated: a square in a square"]].map(([value, label, note]) => (
                <button key={value} type="button" role="radio" aria-checked={newForm.cls === value} onClick={() => setNewForm((f) => ({ ...f, cls: value }))} className={`rounded-2xl border px-3 py-3 text-left ${newForm.cls === value ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : NEUTRAL}`}>
                  <span className="block font-bold">{label}</span><span className={`block text-xs ${newForm.cls === value ? "text-white/85" : "text-[var(--medtrak-muted)]"}`}>{note}</span>
                </button>
              ))}
            </div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Which room?
              {rooms.length ? (
                <select value={newForm.location} onChange={(e) => setNewForm((f) => ({ ...f, location: e.target.value }))} className={INPUT}>
                  <option value="">Choose the room…</option>
                  {rooms.map((room) => <option key={room} value={room}>{room}</option>)}
                </select>
              ) : <input value={newForm.location} onChange={(e) => setNewForm((f) => ({ ...f, location: e.target.value }))} className={INPUT} placeholder="e.g. Reception" />}
            </label>
            {error && <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{error}</p>}
            <button type="button" onClick={saveNew} disabled={busy} className={`${BTN} mt-5 w-full border-transparent bg-[var(--medtrak-accent)] text-white disabled:opacity-50`}>{busy ? "Adding…" : "Add it and start testing"}</button>
          </section>
        )}

        {step === "visual" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">Look it over</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Is the plug, the flex and the body in good condition? Look for cracks, exposed wires, burn marks, loose parts, and a flex that is frayed, kinked or taped.</p>
            <YesNo picked={answers.visualOk} onYes={() => answerVisual(true)} onNo={() => answerVisual(false)} yesLabel="Good condition" noLabel="Damaged" />
          </section>
        )}

        {step === "earth" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">Earth continuity</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Run the earth test on your tester. What did it say?</p>
            <YesNo picked={answers.earth === "pass" ? true : answers.earth === "fail" ? false : undefined} onYes={() => set({ earth: "pass" })} onNo={() => set({ earth: "fail" })} yesLabel="Pass" noLabel="Fail" />
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Reading in ohms (if you want it recorded)
              <input inputMode="decimal" value={answers.earthOhms || ""} onChange={(e) => set({ earthOhms: e.target.value })} className={INPUT} placeholder="e.g. 0.12" />
            </label>
            <button type="button" onClick={() => { set({ cls: "II", earth: "na" }); setStep("insulation"); setTrail((t) => [...t, "earth"]); }} className="mt-4 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 text-sm font-semibold">It is Class II (double insulated), so there is no earth test</button>
            {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
            <button type="button" disabled={!answers.earth} onClick={() => go("insulation")} className={`${BTN} mt-5 w-full border-transparent bg-[var(--medtrak-accent)] text-white disabled:opacity-40`}>Next</button>
          </section>
        )}

        {step === "insulation" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">Insulation resistance</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Run the insulation test. What did it say?</p>
            <YesNo picked={answers.insulation === "pass" ? true : answers.insulation === "fail" ? false : undefined} onYes={() => set({ insulation: "pass" })} onNo={() => set({ insulation: "fail" })} yesLabel="Pass" noLabel="Fail" />
            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[var(--medtrak-muted)]">Reading in megohms (if you want it recorded)
              <input inputMode="decimal" value={answers.insulationMohms || ""} onChange={(e) => set({ insulationMohms: e.target.value })} className={INPUT} placeholder="e.g. 20" />
            </label>
            <button type="button" disabled={!answers.insulation} onClick={() => go("fuse")} className={`${BTN} mt-5 w-full border-transparent bg-[var(--medtrak-accent)] text-white disabled:opacity-40`}>Next</button>
          </section>
        )}

        {step === "fuse" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">The fuse</h2>
            <p className="mt-1 text-sm text-[var(--medtrak-muted)]">What rating is the fuse in the plug?</p>
            <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Fuse rating">
              {FUSE_RATINGS.map((rating) => (
                <button key={rating} type="button" role="radio" aria-checked={answers.fuseRating === rating} onClick={() => set({ fuseRating: rating })} className={`rounded-2xl border px-3 py-4 font-bold ${rating.length > 5 ? "col-span-2 text-sm" : ""} ${answers.fuseRating === rating ? "border-[var(--medtrak-accent)] bg-[var(--medtrak-accent)] text-white" : NEUTRAL}`}>{rating}</button>
              ))}
            </div>
            <button type="button" onClick={() => go("result")} className={`${BTN} mt-5 w-full border-transparent bg-[var(--medtrak-accent)] text-white`}>{answers.fuseRating ? "Next" : "Skip this"}</button>
          </section>
        )}

        {step === "result" && (
          <section className="mt-5">
            <h2 className="text-2xl font-black">{verdict.result === "fail" || showFailing ? "It has failed" : "All good?"}</h2>
            <ul className="mt-3 space-y-1.5 rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-3 text-sm">
              <li className="flex justify-between"><span>Plug, flex and body</span><b className={answers.visualOk ? "text-emerald-700" : "text-rose-700"}>{answers.visualOk === false ? "Damaged" : "Good"}</b></li>
              {cls === "I" && answers.visualOk !== false && <li className="flex justify-between"><span>Earth continuity</span><b className={answers.earth === "pass" ? "text-emerald-700" : "text-rose-700"}>{answers.earth === "pass" ? "Pass" : "Fail"}{answers.earthOhms ? ` · ${answers.earthOhms} Ω` : ""}</b></li>}
              {answers.visualOk !== false && <li className="flex justify-between"><span>Insulation</span><b className={answers.insulation === "pass" ? "text-emerald-700" : "text-rose-700"}>{answers.insulation === "pass" ? "Pass" : "Fail"}{answers.insulationMohms ? ` · ${answers.insulationMohms} MΩ` : ""}</b></li>}
              {answers.visualOk !== false && answers.fuseRating && <li className="flex justify-between"><span>Fuse</span><b>{answers.fuseRating}</b></li>}
            </ul>

            {verdict.result === "pass" && !showFailing && (
              <>
                <p className="mt-3 text-sm text-[var(--medtrak-muted)]">Next test due about <b className="text-[var(--medtrak-text)]">{passDue}</b> ({months} months, {categoryOf(appliance?.category).label.toLowerCase()}).</p>
                <button type="button" onClick={() => save("pass")} disabled={busy} className={`${BTN} mt-4 w-full border-transparent bg-emerald-500 text-white disabled:opacity-50`}>{busy ? "Saving…" : "PASS. Save it"}</button>
                <button type="button" onClick={() => setShowFailing(true)} className="mt-3 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 text-sm font-semibold">Something else is wrong. Fail it instead</button>
              </>
            )}

            {(verdict.result === "fail" || showFailing) && (
              <>
                <p className="mt-3 text-sm text-[var(--medtrak-muted)]">Why did it fail? Tick everything that applies.</p>
                <div className="mt-2 space-y-1.5">
                  {PAT_FAIL_REASONS.map((r) => {
                    const forced = verdict.reasons.includes(r.key);
                    const on = forced || reasons.includes(r.key);
                    return <button key={r.key} type="button" disabled={forced} onClick={() => toggleReason(r.key)} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold ${on ? "border-rose-500/50 bg-rose-500/10" : NEUTRAL}`}><span className={`grid h-6 w-6 place-items-center rounded-full ${on ? "bg-rose-600 text-white" : "border border-[var(--medtrak-border)]"}`}>{on && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}</span>{r.label}</button>;
                  })}
                </div>
                <textarea value={answers.notes || ""} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder={reasons.includes("other") ? "What was wrong?" : "Notes (optional)"} className={`${INPUT} min-h-0 py-3`} />
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Failing it takes it out of use and tells the Practice Manager. Put a FAILED label on it and unplug it.</p>
                <button type="button" onClick={() => save("fail")} disabled={busy} className={`${BTN} mt-4 w-full border-transparent bg-rose-600 text-white disabled:opacity-50`}>{busy ? "Saving…" : "FAIL. Take it out of use"}</button>
                {verdict.result === "pass" && <button type="button" onClick={() => setShowFailing(false)} className="mt-3 w-full rounded-2xl border border-[var(--medtrak-border)] px-4 py-3 text-sm font-semibold">Go back: it passed</button>}
              </>
            )}
            {verdict.result === "" && !showFailing && <p className="mt-3 text-sm text-amber-800">Still to answer: {verdict.missing.join(", ")}. Go back and answer it.</p>}
            {error && <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{error}</p>}
          </section>
        )}

        {step === "saved" && saved && (
          <section className="mt-5" role="status">
            <div className={`rounded-[1.5rem] border p-5 ${saved.result === "pass" ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"}`}>
              <p className={`flex items-center gap-2 text-xl font-black ${saved.result === "pass" ? "text-emerald-700" : "text-rose-700"}`}>{saved.result === "pass" ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : <XCircle className="h-6 w-6" aria-hidden="true" />}{saved.result === "pass" ? "Passed" : "Failed"}</p>
              <p className="mt-1 text-sm">{saved.tag} · {saved.name}</p>
              {saved.result === "pass"
                ? <p className="mt-3 text-sm font-semibold">Put a PASS label on it dated {ukDate(saved.testedOn)}. It is next due {ukDate(saved.nextDueOn)}.</p>
                : <p className="mt-3 text-sm font-semibold">Put a FAILED label on it and unplug it. It is marked out of use and the Practice Manager has been told.</p>}
            </div>
            <button type="button" onClick={() => { setAppliance(null); setTyped(""); setRoomPick(""); setTrail([]); setStep("find"); }} className={`${BTN} mt-5 w-full border-transparent bg-[var(--medtrak-accent)] text-white`}>Test the next one</button>
            <button type="button" onClick={() => setStep("summary")} className={`${BTN} ${NEUTRAL} mt-3 w-full`}>I have finished</button>
          </section>
        )}

        {step === "summary" && (
          <section className="mt-5">
            {(() => { const s = roundSummary(round); return (
              <>
                <h2 className="text-2xl font-black">Round done</h2>
                <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{s.tested} {s.tested === 1 ? "appliance" : "appliances"} tested: {s.passed} passed{s.failed ? `, ${s.failed} failed` : ""}.</p>
                <ul className="mt-4 space-y-1.5">
                  {round.map((t, i) => <li key={`${t.assetId}-${i}`} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${NEUTRAL}`}><span className="truncate">{t.tag} · {t.name}</span><b className={t.result === "pass" ? "text-emerald-700" : "text-rose-700"}>{t.result === "pass" ? "Pass" : "Fail"}</b></li>)}
                </ul>
                <button type="button" onClick={finish} className={`${BTN} mt-5 w-full border-transparent bg-[var(--medtrak-accent)] text-white`}>Close</button>
              </>
            ); })()}
          </section>
        )}
      </div>

      <MobileBarcodeScanner onScan={scanned} triggerAttribute="data-pat-scan-button" title="Scan the appliance's label" helper="Point the camera at the barcode or QR on its PAT label. You can also type the tag number." />
    </div>
  );
}
