import { useState } from "react";
import { leaveYearFor } from "@/modules/leave/leaveEntitlement";
import { useEffectiveLeaveSettings, useLeaveStaff } from "@/modules/leave/leaveService";
import { LeaveList, LeaveSummary } from "@/modules/leave/LeavePanels";
import { dateKey } from "@/modules/timesheets/workPattern";

// Annual leave on the phone (Me tab): your own entitlement for this leave year and how it was worked out, and, for a line
// manager, their team's. Setting people up and the payroll file are on the desktop.

export default function MobileLeave() {
  const year = leaveYearFor(dateKey(new Date()));
  const data = useLeaveStaff();
  const settings = useEffectiveLeaveSettings(year);
  const [tab, setTab] = useState("mine");
  if (!data.ready) return <p className="text-sm text-[var(--medtrak-muted)]">Opening…</p>;
  if (!data.mine && !data.team.length) return <p className="text-sm text-[var(--medtrak-muted)]">{data.error || "Your leave isn't set up yet. Ask the practice manager to link your account in Timesheets."}</p>;
  const showTeam = data.team.length > 0 && (tab === "team" || !data.mine);
  return (
    <div className="space-y-3">
      {data.mine && data.team.length > 0 && (
        <div className="flex gap-1" role="tablist">
          {[["mine", "My leave"], ["team", "My team"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 flex-1 rounded-2xl border px-3 text-sm font-bold ${tab === key ? "border-[var(--medtrak-accent)] bg-black/5" : "border-[var(--medtrak-border)]"}`}>{label}</button>)}
        </div>
      )}
      {showTeam ? <LeaveList people={data.team} year={year} settings={settings} skin="phone" /> : <LeaveSummary person={data.mine} year={year} settings={settings} skin="phone" />}
    </div>
  );
}
