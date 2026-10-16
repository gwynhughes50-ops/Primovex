import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MyTimesheetPanel, SignOffPanel } from "@/modules/timesheets/TimesheetPanels";
import { STATE } from "@/modules/timesheets/timesheet";
import { useSheets } from "@/modules/timesheets/timesheetFlowService";

// The timesheet on the phone (Me tab): send your own in one tap, and, for a line manager, sign off the ones that name you.
// The payroll team and pay-period set-up are on the desktop.

export default function MobileTimesheet() {
  const { user, can } = useAuth();
  const canManage = can("timesheets.manage");
  const managed = useSheets(canManage ? "all" : "managed");
  const waiting = (managed.list || []).filter((t) => t.state === STATE.submitted && t.uid !== user?.uid && (t.managerUid === user?.uid || (!t.managerUid && canManage))).length;
  const [tab, setTab] = useState("mine");
  const isManager = canManage || (managed.list || []).length > 0;
  return (
    <div className="space-y-3 py-1">
      {isManager && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1" role="tablist">
          {[["mine", "My timesheet"], ["signoff", `To sign off${waiting ? ` (${waiting})` : ""}`]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 rounded-xl text-sm font-bold ${tab === key ? "bg-[var(--medtrak-panel)] shadow" : "text-[var(--medtrak-muted)]"}`}>{label}</button>)}
        </div>
      )}
      {tab === "mine" || !isManager ? <MyTimesheetPanel skin="phone" /> : <SignOffPanel skin="phone" canManage={canManage} />}
    </div>
  );
}
