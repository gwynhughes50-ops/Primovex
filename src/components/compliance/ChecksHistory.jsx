import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { getAssetTypeConfig, subscribeRecentComplianceChecks } from "@/services/compliance/complianceQrService";
import { checkPerson, checkTime, formatWhen, isFireType, isWaterType } from "./complianceView";

const TH = "py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const TD = "py-2 pr-3 align-top text-sm text-slate-200";
const FILTER = "rounded-full border px-3 py-1 text-xs";

function typeGroup(type) {
  if (isFireType(type)) return "fire";
  if (isWaterType(type)) return "water";
  return "other";
}

// Every check in date order, newest first, with the earlier records from the
// old manual forms underneath (read only; they are still in the printed report).
export default function ChecksHistory({ legacyFire = [], legacyWater = [] }) {
  const [checks, setChecks] = useState([]);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [showOld, setShowOld] = useState(false);

  useEffect(() => subscribeRecentComplianceChecks(setChecks, console.error, { siteId: "main_branch", max: 400 }), []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return checks
      .filter((c) => group === "all" || typeGroup(c.assetType) === group)
      .filter((c) => !term || [c.assetCode, c.assetLabel, c.location, checkPerson(c), c.notes].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)))
      .sort((a, b) => (checkTime(b)?.getTime() || 0) - (checkTime(a)?.getTime() || 0))
      .slice(0, 300);
  }, [checks, group, search]);

  return (
    <div className="space-y-4">
      <Card className="border border-white/10 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {[["all", "All"], ["fire", "Fire"], ["water", "Water"], ["other", "Other"]].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setGroup(key)} className={`${FILTER} ${group === key ? "border-teal-400/60 bg-teal-500/15 text-teal-100" : "border-white/10 text-slate-300"}`}>{label}</button>
          ))}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset, person or note" aria-label="Search checks" className="ml-auto w-64 rounded-full border border-white/10 bg-slate-950/50 px-3 py-1.5 text-xs text-slate-100 outline-none" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className={TH}>When</th><th className={TH}>Asset</th><th className={TH}>Result</th><th className={TH}>By</th><th className={TH}>Notes / issues</th><th className={TH}>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-white/5">
                  <td className={TD}>{formatWhen(checkTime(c))}</td>
                  <td className={TD}><div className="font-semibold text-slate-100">{c.assetCode}</div><div className="text-xs text-slate-500">{c.assetLabel || getAssetTypeConfig(c.assetType).label}{c.location ? ` • ${c.location}` : ""}</div></td>
                  <td className={TD}>
                    <span className={c.result === "pass" ? "text-emerald-300" : "font-semibold text-rose-300"}>{c.result === "pass" ? "Pass" : "Fail"}</span>
                    {c.tempC != null && <span className="ml-2 text-slate-400">{c.tempC}°C</span>}
                    {c.flushed && <span className="ml-2 text-xs text-slate-500">flushed</span>}
                  </td>
                  <td className={TD}>{checkPerson(c)}</td>
                  <td className={TD}>{c.notes || "—"}</td>
                  <td className={TD}>
                    {c.manualEntry
                      ? <span title={c.manualReason || ""} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">By hand{c.manualReason ? `: ${c.manualReason}` : ""}</span>
                      : <span className="text-xs text-slate-500">Phone</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-500">No checks match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="border border-white/10 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
        <button type="button" onClick={() => setShowOld((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-slate-100">
          <span>Earlier records from the old forms <span className="font-normal text-slate-500">({legacyFire.length} fire, {legacyWater.length} water rounds)</span></span>
          <span className="text-xs text-slate-400">{showOld ? "Hide" : "Show"}</span>
        </button>
        {showOld && (
          <div className="mt-4 space-y-5">
            <p className="text-xs text-slate-500">Read only. These were typed in on the desktop before checks moved to the phone. They are still included when you export or print.</p>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Fire checks</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead><tr className="border-b border-white/10"><th className={TH}>Date</th><th className={TH}>Time</th><th className={TH}>Initials</th><th className={TH}>Call point</th><th className={TH}>Status</th><th className={TH}>Notes</th></tr></thead>
                  <tbody>
                    {legacyFire.slice(0, 100).map((r) => (
                      <tr key={r.id} className="border-b border-white/5"><td className={TD}>{r.dateKey}</td><td className={TD}>{r.time}</td><td className={TD}>{r.initials}</td><td className={TD}>{r.callPointNameSnapshot || ""}</td><td className={TD}>{String(r.status || "").toUpperCase()}</td><td className={TD}>{r.notes || "—"}</td></tr>
                    ))}
                    {legacyFire.length === 0 && <tr><td colSpan={6} className="py-3 text-sm text-slate-500">None.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Water rounds</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead><tr className="border-b border-white/10"><th className={TH}>Date</th><th className={TH}>Time</th><th className={TH}>Initials</th><th className={TH}>Outlets</th><th className={TH}>Notes</th></tr></thead>
                  <tbody>
                    {legacyWater.slice(0, 100).map((r) => (
                      <tr key={r.id} className="border-b border-white/5"><td className={TD}>{r.dateKey}</td><td className={TD}>{r.time}</td><td className={TD}>{r.initials}</td><td className={TD}>{Array.isArray(r.entries) ? r.entries.length : 0}</td><td className={TD}>{r.roundNotes || "—"}</td></tr>
                    ))}
                    {legacyWater.length === 0 && <tr><td colSpan={5} className="py-3 text-sm text-slate-500">None.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
