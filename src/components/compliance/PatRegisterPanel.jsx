import { useEffect, useMemo, useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import { AlertTriangle, CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import useSiteSpaceNames from "@/hooks/useSiteSpaceNames";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAT_CATEGORIES, categoryOf, dueSummary, intervalFor, ukDate } from "@/modules/pat/pat";
import { addPatAsset, PAT_ASSETS, savePatIntervals, subscribePatAssets, subscribePatSettings, subscribePatTests } from "@/modules/pat/patService";
import { upsertEquipment } from "@/modules/equipment/services/equipmentRegistry";
import PatImportPanel from "./PatImportPanel";

// The PAT register on the desktop: every appliance with when it is next due, the practice's own retest intervals, adding appliances
// (one at a time or many at once), and what has been tested. The tests themselves are done by the caretaker on his phone.

const STATE = {
  "out-of-use": ["Out of use", "bg-rose-500/15 text-rose-200", AlertTriangle],
  overdue: ["Overdue", "bg-rose-500/15 text-rose-200", AlertTriangle],
  never: ["Not tested yet", "bg-amber-500/15 text-amber-200", Clock],
  "due-soon": ["Due soon", "bg-amber-500/15 text-amber-200", Clock],
  ok: ["In date", "bg-emerald-500/15 text-emerald-200", CheckCircle2],
};
const SELECT = "mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 [&>option]:bg-slate-900";

function Tile({ label, value, tone = "text-slate-100" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

export default function PatRegisterPanel({ siteId = "", newSiteId = "main_branch", siteName = "", view = "register" }) {
  const { user, displayName, can, isAdmin } = useAuth();
  const mayManage = can("compliance.manageAssets") || isAdmin;
  const actor = { uid: user?.uid || "", displayName: displayName || user?.email || "" };
  const { spaceNamesFor } = useSiteSpaceNames(true);
  const rooms = useMemo(() => spaceNamesFor(siteName || ""), [spaceNamesFor, siteName]);

  const [assets, setAssets] = useState([]);
  const [tests, setTests] = useState([]);
  const [settings, setSettings] = useState({});
  const [intervals, setIntervals] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ tag: "", name: "", category: "handheld", cls: "I", location: "", makeModel: "", serialNumber: "" });

  const inSite = (row) => !siteId || !row.siteId || row.siteId === siteId;
  useEffect(() => subscribePatAssets((rows) => {
    setAssets(rows);
    // the unified equipment register carries each appliance too (as it always has)
    rows.filter(inSite).forEach((a) => upsertEquipment({ equipmentId: a.equipmentId || `EQ-PAT-${a.id}`, name: a.name, assetTag: a.tag, makeModel: a.makeModel, serialNumber: a.serialNumber, compliance: { patRequired: true, patAssetId: a.id } }, "pat-firestore-sync"));
  }, (e) => console.error("pat_assets subscribe error:", e)), [siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => subscribePatTests(setTests, (e) => console.error("pat_tests subscribe error:", e)), []);
  useEffect(() => subscribePatSettings((s) => { setSettings(s); setIntervals(Object.fromEntries(PAT_CATEGORIES.map((c) => [c.key, String(intervalFor(c.key, s))]))); }), []);

  const siteAssets = useMemo(() => assets.filter(inSite), [assets, siteId]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => dueSummary(siteAssets), [siteAssets]);

  async function add() {
    setMsg("");
    if (rooms.length && !form.location) return setMsg("Choose the room it is in.");
    setBusy(true);
    try {
      await addPatAsset({ siteId: newSiteId, ...form });
      setForm({ tag: "", name: "", category: form.category, cls: form.cls, location: form.location, makeModel: "", serialNumber: "" });
      setMsg("Added. It shows as not tested yet until the caretaker tests it.");
    } catch (error) {
      setMsg(error?.message || "Could not add it. Check you have permission.");
    } finally { setBusy(false); }
  }

  async function saveIntervals() {
    setBusy(true); setMsg("");
    try { await savePatIntervals(intervals, actor); setMsg("Retest intervals saved. Each appliance's next date is worked out from its kind when it is next tested."); }
    catch (error) { setMsg(error?.message || "Could not save. Check you have permission."); }
    finally { setBusy(false); }
  }

  async function remove(asset) {
    if (!window.confirm(`Delete "${asset.tag}" from the register? Its past tests stay on record.`)) return;
    try { await deleteDoc(doc(db, PAT_ASSETS, asset.id)); } catch (error) { console.error(error); setMsg("Could not delete it."); }
  }

  if (view === "history") {
    return (
      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="font-semibold text-slate-100">Test history</div>
        <div className="mt-1 text-xs text-slate-400">Every appliance test done on the phone, newest first. They cannot be edited.</div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Appliance</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Readings</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Next due</th></tr></thead>
            <tbody>
              {tests.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-500">No tests recorded on the phone yet.</td></tr>}
              {tests.map((t) => (
                <tr key={t.id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2">{ukDate(t.testedOn)}</td>
                  <td className="px-3 py-2"><div className="font-semibold text-slate-100">{t.tag}</div><div className="text-xs text-slate-500">{t.name}{t.location ? ` · ${t.location}` : ""}</div></td>
                  <td className="px-3 py-2">{t.result === "pass" ? <span className="text-emerald-300">Pass</span> : <span className="font-semibold text-rose-300">Fail</span>}{t.failReasons?.length ? <div className="text-xs text-rose-200">{t.failReasons.join(", ")}</div> : null}{t.notes ? <div className="text-xs text-slate-400">{t.notes}</div> : null}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{t.visualOk ? "Visual ok" : "Visual damaged"} · Earth {t.earth}{t.earthOhms != null ? ` ${t.earthOhms}Ω` : ""} · Insulation {t.insulation}{t.insulationMohms != null ? ` ${t.insulationMohms}MΩ` : ""}{t.fuseRating ? ` · ${t.fuseRating}` : ""}</td>
                  <td className="px-3 py-2">{t.testerName || "—"}</td>
                  <td className="px-3 py-2">{t.nextDueOn ? ukDate(t.nextDueOn) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Appliances" value={summary.counts.total} />
        <Tile label="Overdue" value={summary.counts.overdue} tone={summary.counts.overdue ? "text-rose-300" : "text-emerald-300"} />
        <Tile label="Not tested yet" value={summary.counts.never} tone={summary.counts.never ? "text-amber-300" : "text-emerald-300"} />
        <Tile label="Due in 30 days" value={summary.counts.dueSoon} tone={summary.counts.dueSoon ? "text-amber-300" : "text-emerald-300"} />
        <Tile label="Out of use" value={summary.counts.outOfUse} tone={summary.counts.outOfUse ? "text-rose-300" : "text-emerald-300"} />
      </div>

      {msg && <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200" role="status">{msg}</div>}

      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-100">How often each kind is retested</div>
            <div className="text-xs text-slate-400">In months. The next date is worked out from this when an appliance passes. The starting figures are a guide: set them to what your risk assessment says.</div>
          </div>
          {mayManage && <Button onClick={saveIntervals} disabled={busy} className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-xs text-slate-950">Save intervals</Button>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAT_CATEGORIES.map((c) => (
            <label key={c.key} className="text-xs text-slate-300">{c.label}<span className="block text-[11px] text-slate-500">{c.examples}</span>
              <Input type="number" min="1" max="120" value={intervals[c.key] ?? ""} disabled={!mayManage} onChange={(e) => setIntervals((old) => ({ ...old, [c.key]: e.target.value }))} />
            </label>
          ))}
        </div>
      </Card>

      <Card className="border border-white/10 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-100">Equipment register</div>
            <div className="text-xs text-slate-400">Add appliances once. The caretaker tests them on his phone, one at a time.</div>
          </div>
          {mayManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAdd((v) => !v)} className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200"><Plus className="mr-1.5 h-4 w-4" />{showAdd ? "Hide the form" : "Add one"}</Button>
              <Button onClick={() => setShowImport(true)} className="rounded-full border border-teal-400/40 bg-teal-500/15 text-xs font-semibold text-teal-100 hover:bg-teal-500/25">Add many at once</Button>
            </div>
          )}
        </div>

        {showAdd && mayManage && (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-slate-300">Tag<Input value={form.tag} onChange={(e) => setForm((p) => ({ ...p, tag: e.target.value }))} placeholder="R-1" /></label>
            <label className="text-xs text-slate-300 sm:col-span-2">Name<Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Kettle" /></label>
            <label className="text-xs text-slate-300">Kind
              <select className={SELECT} value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value, cls: categoryOf(e.target.value).defaultClass }))}>{PAT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            </label>
            <label className="text-xs text-slate-300">Class
              <select className={SELECT} value={form.cls} onChange={(e) => setForm((p) => ({ ...p, cls: e.target.value }))}><option value="I">Class I (earthed)</option><option value="II">Class II (double insulated)</option></select>
            </label>
            <label className="text-xs text-slate-300">Room
              {rooms.length ? <select className={SELECT} value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}><option value="">Choose the room…</option>{rooms.map((room) => <option key={room} value={room}>{room}</option>)}</select>
                : <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Reception" />}
            </label>
            <label className="text-xs text-slate-300">Make/model (optional)<Input value={form.makeModel} onChange={(e) => setForm((p) => ({ ...p, makeModel: e.target.value }))} /></label>
            <label className="text-xs text-slate-300">Serial (optional)<Input value={form.serialNumber} onChange={(e) => setForm((p) => ({ ...p, serialNumber: e.target.value }))} /></label>
            <div className="flex items-end sm:col-span-4"><Button onClick={add} disabled={busy} className="rounded-full bg-emerald-400 text-xs text-slate-950 hover:bg-emerald-300">Add to register</Button></div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="px-3 py-2">Tag</th><th className="px-3 py-2">Appliance</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Room</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Next due</th><th className="px-3 py-2">Last tested</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {summary.rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-slate-500">No appliances yet. Add them one at a time, or paste a list.</td></tr>}
              {summary.rows.map(({ asset, state }) => {
                const [label, tone, Icon] = STATE[state];
                return (
                  <tr key={asset.id} className="border-b border-white/5 align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-100">{asset.tag}</td>
                    <td className="px-3 py-2">{asset.name}{asset.makeModel ? <div className="text-xs text-slate-500">{asset.makeModel}{asset.serialNumber ? ` · SN ${asset.serialNumber}` : ""}</div> : null}</td>
                    <td className="px-3 py-2 text-xs text-slate-300">{categoryOf(asset.category).label}<div className="text-slate-500">Class {asset.cls === "II" ? "II" : "I"}</div></td>
                    <td className="px-3 py-2">{asset.location || "—"}</td>
                    <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}><Icon className="h-3 w-3" aria-hidden="true" />{label}</span></td>
                    <td className="px-3 py-2">{asset.nextDueOn ? ukDate(asset.nextDueOn) : "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-300">{asset.lastTestedOn ? `${ukDate(asset.lastTestedOn)} · ${asset.lastResult === "pass" ? "pass" : "fail"}` : "Never"}{asset.lastTestedByName ? <div className="text-slate-500">{asset.lastTestedByName}</div> : null}</td>
                    <td className="px-3 py-2 text-right">{mayManage && <button type="button" onClick={() => remove(asset)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-white/5" aria-label={`Delete ${asset.tag}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showImport && <PatImportPanel assets={siteAssets} rooms={rooms} siteId={newSiteId} siteName={siteName} onClose={() => setShowImport(false)} />}
    </div>
  );
}
