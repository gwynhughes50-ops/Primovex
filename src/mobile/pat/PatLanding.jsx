import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { categoryOf, patStatus, readingsLine, testsOf, ukDate } from "@/modules/pat/pat";
import { subscribePatAssets, subscribePatSettings, subscribePatTests } from "@/modules/pat/patService";
import PatWizard from "./PatWizard";

// Where a PAT appliance's own QR label lands when a phone's camera reads it: that appliance's details, how it is doing (in date, due soon, overdue, out of use), its test history, and a Retest button
// for whoever may record tests (the caretaker, the practice manager, anyone given the permission). Anyone else signed in can read it. A new test is the same wizard as every other, already on this appliance.

const STATE = {
  "out-of-use": ["Out of use", "bg-rose-500/15 text-rose-700"],
  overdue: ["Overdue for a retest", "bg-rose-500/15 text-rose-700"],
  never: ["Not tested yet", "bg-amber-500/15 text-amber-700"],
  "due-soon": ["Due for a retest soon", "bg-amber-500/15 text-amber-700"],
  ok: ["In date", "bg-emerald-500/15 text-emerald-700"],
};
const CARD = "rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 text-[var(--medtrak-text)]";

function Row({ label, value }) {
  if (!value) return null;
  return <div className="flex justify-between gap-3 border-b border-[var(--medtrak-border)] py-1.5 text-sm last:border-b-0"><dt className="text-[var(--medtrak-muted)]">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>;
}

export default function PatLanding({ id }) {
  const navigate = useNavigate();
  const { can, isAdmin } = useAuth();
  const mayRetest = Boolean(isAdmin || can("compliance.recordChecks"));
  const [assets, setAssets] = useState(null);
  const [tests, setTests] = useState([]);
  const [settings, setSettings] = useState({});
  const [retest, setRetest] = useState(false);
  const [failed, setFailed] = useState("");

  useEffect(() => subscribePatAssets(setAssets, () => { setAssets([]); setFailed("The appliances could not be loaded."); }), []);
  useEffect(() => subscribePatTests(setTests, () => setTests([])), []);
  useEffect(() => subscribePatSettings(setSettings), []);

  const asset = useMemo(() => (assets || []).find((a) => a.id === id) || null, [assets, id]);
  const history = useMemo(() => (asset ? testsOf(tests, asset.id) : []), [tests, asset]);
  const status = asset ? patStatus(asset) : null;

  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <button type="button" onClick={() => navigate("/", { replace: true })} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
      <h1 className="text-xl font-black">PAT testing</h1>

      {assets === null && <p className="text-sm text-[var(--medtrak-muted)]">Opening…</p>}
      {failed && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-700" role="alert">{failed}</p>}
      {assets !== null && !asset && !failed && <p className={CARD}>This label is not on the PAT register any more. It may have been deleted. Ask whoever looks after the appliance register.</p>}

      {asset && (
        <>
          <section className={CARD} aria-label="Appliance">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-lg font-black">{asset.tag}</p>
                <p className="font-semibold">{asset.name}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATE[status.state][1]}`}>{STATE[status.state][0]}</span>
            </div>
            <dl className="mt-3">
              <Row label="Where" value={asset.location} />
              <Row label="Kind" value={`${categoryOf(asset.category).label} · Class ${asset.cls === "II" ? "II" : "I"}`} />
              <Row label="Make and model" value={asset.makeModel} />
              <Row label="Serial number" value={asset.serialNumber} />
              <Row label="Fuse" value={asset.fuseRating} />
              <Row label="Last tested" value={asset.lastTestedOn ? `${ukDate(asset.lastTestedOn)} · ${asset.lastResult === "pass" ? "pass" : "fail"}${asset.lastTestedByName ? ` · ${asset.lastTestedByName}` : ""}` : "Never"} />
              <Row label="Next due" value={asset.nextDueOn ? `${ukDate(asset.nextDueOn)}${status.days !== null ? (status.days < 0 ? ` (${-status.days} day${status.days === -1 ? "" : "s"} overdue)` : status.days === 0 ? " (today)" : ` (in ${status.days} day${status.days === 1 ? "" : "s"})`) : ""}` : ""} />
            </dl>
            {asset.outOfUse === true && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-700">This appliance failed its last test and is out of use. Do not use it until it has been put right and passed a retest.</p>}
            {mayRetest
              ? <button type="button" onClick={() => setRetest(true)} className="mt-4 w-full rounded-2xl bg-[var(--medtrak-accent)] px-4 py-3.5 text-base font-bold text-white">Retest this appliance</button>
              : <p className="mt-3 text-xs text-[var(--medtrak-muted)]">Retests are done by the caretaker.</p>}
          </section>

          <section className={CARD} aria-label="Test history">
            <h2 className="font-bold">Test history</h2>
            {history.length === 0 ? <p className="mt-1 text-sm text-[var(--medtrak-muted)]">No tests recorded on the phone yet.</p> : (
              <ul className="mt-2 divide-y divide-[var(--medtrak-border)] text-sm">
                {history.slice(0, 12).map((t) => (
                  <li key={t.id} className="py-2">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{ukDate(t.testedOn)}</span><b className={t.result === "pass" ? "text-emerald-700" : "text-rose-700"}>{t.result === "pass" ? "Pass" : "Fail"}</b></div>
                    <p className="text-xs text-[var(--medtrak-muted)]">{readingsLine(t)}</p>
                    {t.failReasons?.length ? <p className="text-xs text-rose-700">{t.failReasons.join(", ")}</p> : null}
                    {t.notes ? <p className="text-xs text-[var(--medtrak-muted)]">{t.notes}</p> : null}
                    <p className="text-xs text-[var(--medtrak-muted)]">{t.testerName || "Not recorded"}{t.nextDueOn ? ` · next due ${ukDate(t.nextDueOn)}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {retest && asset && <PatWizard assets={assets} settings={settings} startAsset={asset} onClose={() => setRetest(false)} />}
    </main>
  );
}
