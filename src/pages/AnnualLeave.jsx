import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { leaveYear, leaveYearFor } from "@/modules/leave/leaveEntitlement";
import { useLeaveStaff, useLeaveYearSettings } from "@/modules/leave/leaveService";
import { LeaveEditDialog, LeaveList, LeaveSettings, LeaveSummary } from "@/modules/leave/LeavePanels";
import { dateKey } from "@/modules/timesheets/workPattern";

// Annual leave (Operations > Annual leave): each person's yearly entitlement worked out from their leave group, length of service
// and working hours (the practice's old spreadsheets, done for them), split automatically where hours or service level change.
//   everyone            their own, with how it was worked out
//   a line manager     their team's
//   timesheets.manage  everyone's, checked against BrightHR, with the set-up and a file for payroll
// Leave taken and what is left stay in BrightHR.

export default function AnnualLeave() {
  const { user, displayName } = useAuth();
  const actor = { displayName: displayName || user?.email || "", email: user?.email || "" };
  const data = useLeaveStaff();
  const current = leaveYearFor(dateKey(new Date()));
  const [startYear, setStartYear] = useState(current.startYear);
  const year = useMemo(() => leaveYear(startYear), [startYear]);
  const settings = useLeaveYearSettings(year.key);
  const [tab, setTab] = useState("");
  const [editing, setEditing] = useState(null);

  const tabs = [
    ...(data.mine ? [["mine", "My leave"]] : []),
    ...(data.team.length ? [["team", "My team"]] : []),
    ...(data.all ? [["all", "Everyone"], ["settings", "Settings"]] : []),
  ];
  const active = tabs.some(([key]) => key === tab) ? tab : tabs[0]?.[0] || "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><CalendarDays className="h-6 w-6 text-teal-300" aria-hidden="true" /> Annual leave</h1>
          <p className="max-w-3xl text-sm text-slate-400">The leave each person is entitled to in the leave year (1 April to 31 March), worked out from their group, length of service and working hours. Leave taken and what is left stay in BrightHR.</p>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Leave year
          <select className="mt-1 block rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100" value={startYear} onChange={(e) => setStartYear(Number(e.target.value))}>
            {[current.startYear - 1, current.startYear, current.startYear + 1].map((y) => <option key={y} value={y}>{leaveYear(y).key}{y === current.startYear ? " (this year)" : ""}</option>)}
          </select>
        </label>
      </div>
      {data.error && <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">{data.error}</p>}
      {!data.ready ? <p className="text-sm text-slate-400">Opening…</p> : !tabs.length ? (
        <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">Your leave isn't set up yet. Ask the practice manager to link your account to your staff record in Timesheets.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b border-white/10" role="tablist">
            {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={active === key} onClick={() => setTab(key)} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${active === key ? "bg-white/10 text-slate-50" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>)}
          </div>
          {active === "mine" && <div className="max-w-xl"><LeaveSummary person={data.mine} year={year} settings={settings} /></div>}
          {active === "team" && <LeaveList people={data.team} year={year} settings={settings} title="The people who name you as their line manager." />}
          {active === "all" && <LeaveList people={data.staff} year={year} settings={settings} showCheck onEdit={setEditing} />}
          {active === "settings" && <LeaveSettings key={year.key + JSON.stringify(settings)} year={year} settings={settings} actor={actor} />}
        </>
      )}
      {editing && <LeaveEditDialog person={editing} year={year} actor={actor} onClose={() => setEditing(null)} />}
    </div>
  );
}
