import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPen, Droplets, Flame, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAssetTypeConfig,
  isComplianceCheckDue,
  isFireAlarmTestDueThisWeek,
  subscribeComplianceAssets,
  subscribeRecentComplianceChecks,
} from "@/services/compliance/complianceQrService";
import ManualRecordDialog from "./ManualRecordDialog";
import { checkPerson, formatWhen, isFireType, isWaterType, toDate } from "./complianceView";

const TH = "py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const TD = "py-2 pr-3 align-top text-sm text-slate-200";

function Tile({ label, value, tone = "text-slate-100", note }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

function ResultBadge({ result }) {
  if (!result) return <span className="text-xs text-slate-500">No check yet</span>;
  return result === "pass"
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Pass</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300"><AlertTriangle className="h-3 w-3" /> Fail</span>;
}

function AssetTable({ title, icon: Icon, rows, latestCheck, showTemp, emptyText }) {
  return (
    <Card className="border border-white/10 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100"><Icon className="h-4 w-4 text-teal-300" /> {title} <span className="text-xs font-normal text-slate-500">({rows.length})</span></div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className={TH}>Asset</th>
                <th className={TH}>Location</th>
                <th className={TH}>Last check</th>
                <th className={TH}>By</th>
                <th className={TH}>Result</th>
                {showTemp && <th className={TH}>Temp</th>}
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((asset) => {
                const last = latestCheck.get(asset.id);
                const due = isComplianceCheckDue(asset);
                return (
                  <tr key={asset.id} className="border-b border-white/5">
                    <td className={TD}><div className="font-semibold text-slate-100">{asset.assetCode}</div><div className="text-xs text-slate-500">{asset.label}</div></td>
                    <td className={TD}>{asset.location || "—"}</td>
                    <td className={TD}>{asset.lastCheckAt ? formatWhen(asset.lastCheckAt) : "Never"}</td>
                    <td className={TD}>{asset.lastCheckedByName || (last ? checkPerson(last) : "—")}</td>
                    <td className={TD}><ResultBadge result={asset.lastCheckResult} /></td>
                    {showTemp && <td className={TD}>{last?.tempC != null ? `${last.tempC}°C${last.flushed ? " • flushed" : ""}` : "—"}</td>}
                    <td className={TD}>{asset.lastCheckResult === "fail" ? <span className="text-xs font-semibold text-rose-300">Needs attention</span> : due ? <span className="text-xs font-semibold text-amber-300">Due</span> : <span className="text-xs text-emerald-300">OK</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// The at-a-glance register. Everything on it comes from checks made on the
// phone (or entered by hand); nothing is typed here as a routine.
export default function ComplianceOverview() {
  const { can } = useAuth();
  const [assets, setAssets] = useState([]);
  const [checks, setChecks] = useState([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => subscribeComplianceAssets(setAssets, console.error, { siteId: "main_branch" }), []);
  useEffect(() => subscribeRecentComplianceChecks(setChecks, console.error, { siteId: "main_branch", max: 300 }), []);

  const latestCheck = useMemo(() => {
    const map = new Map();
    for (const c of checks) if (!map.has(c.assetId)) map.set(c.assetId, c);
    return map;
  }, [checks]);

  const firePoints = useMemo(() => assets.filter((a) => isFireType(a.assetType) && a.assetType === "fire_point"), [assets]);
  const otherFire = useMemo(() => assets.filter((a) => isFireType(a.assetType) && a.assetType !== "fire_point"), [assets]);
  const water = useMemo(() => assets.filter((a) => isWaterType(a.assetType)), [assets]);
  const other = useMemo(() => assets.filter((a) => !isFireType(a.assetType) && !isWaterType(a.assetType)), [assets]);

  const fireDone = !isFireAlarmTestDueThisWeek(assets);
  const waterDue = water.filter((a) => isComplianceCheckDue(a)).length;
  const failing = assets.filter((a) => a.lastCheckResult === "fail").length;
  const weekAgo = Date.now() - 7 * 86400000;
  const checksThisWeek = checks.filter((c) => (toDate(c.performedAt) || toDate(c.createdAt) || new Date(0)).getTime() >= weekAgo).length;

  const canRecord = can("compliance.recordChecks");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Fire points, water outlets and rooms are checked on the phone by tapping their tag. Primovex records who and when, and it all appears here.
        </p>
        {canRecord && (
          <Button variant="outline" className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60" onClick={() => setManualOpen(true)}>
            <ClipboardPen className="mr-2 h-4 w-4" /> Add a record by hand
          </Button>
        )}
      </div>

      {saved && <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200" role="status">{saved}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Weekly fire test" value={firePoints.length === 0 ? "No points" : fireDone ? "Done" : "Not yet"} tone={fireDone ? "text-emerald-300" : "text-amber-300"} note="One call point a week, rotating" />
        <Tile label="Water checks due" value={waterDue} tone={waterDue ? "text-amber-300" : "text-emerald-300"} />
        <Tile label="Failing" value={failing} tone={failing ? "text-rose-300" : "text-emerald-300"} />
        <Tile label="Checks in the last 7 days" value={checksThisWeek} />
      </div>

      <AssetTable title="Fire call points" icon={Flame} rows={firePoints} latestCheck={latestCheck} emptyText="No fire call points yet. Add them under Assets and tags, or bring them across from the old list." />
      <AssetTable title="Water outlets" icon={Droplets} rows={water} latestCheck={latestCheck} showTemp emptyText="No water outlets yet. Add them under Assets and tags, or bring them across from the old list." />
      {(otherFire.length > 0 || other.length > 0) && (
        <AssetTable title="Other checked items" icon={ShieldCheck} rows={[...otherFire, ...other]} latestCheck={latestCheck} showTemp={other.some((a) => a.checkMode === "temperature")} emptyText="" />
      )}

      {manualOpen && (
        <ManualRecordDialog
          assets={assets}
          onClose={() => setManualOpen(false)}
          onSaved={(asset) => {
            setSaved(`Record added for ${asset.assetCode || getAssetTypeConfig(asset.assetType).label}, marked as entered by hand.`);
            window.setTimeout(() => setSaved(""), 6000);
          }}
        />
      )}
    </div>
  );
}
