import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MyTimesheetPanel, PeriodsPanel, SignOffPanel } from "@/modules/timesheets/TimesheetPanels";
import PayrollDesk from "@/modules/timesheets/PayrollDesk";
import { STATE } from "@/modules/timesheets/timesheet";
import { useSheets } from "@/modules/timesheets/timesheetFlowService";

// Timesheet (Operations > Timesheet): everyone sends theirs for each pay period, line managers sign off the ones that name them,
// the payroll team sends signed-off ones to payroll, and whoever manages timesheets sets up the pay periods.

export default function MyTimesheet() {
  const { user, can } = useAuth();
  const canManage = can("timesheets.manage");
  const canPayroll = can("timesheets.payroll");
  const managed = useSheets(canManage ? "all" : "managed");
  const waiting = (managed.list || []).filter((t) => t.state === STATE.submitted && t.uid !== user?.uid && (t.managerUid === user?.uid || (!t.managerUid && canManage))).length;
  const isManager = canManage || (managed.list || []).length > 0;
  const [tab, setTab] = useState("mine");
  const tabs = [["mine", "My timesheet"], ...(isManager ? [["signoff", `To sign off${waiting ? ` (${waiting})` : ""}`]] : []), ...(canPayroll ? [["payroll", "Payroll"]] : []), ...(canManage ? [["periods", "Pay periods"]] : [])];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><ClipboardCheck className="h-6 w-6 text-teal-300" aria-hidden="true" /> Timesheet</h1>
        <p className="max-w-3xl text-sm text-slate-400">At the end of each pay period, confirm your hours were as normal, or say what was different. Your line manager signs it off and the payroll team sends it on.</p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-white/10" role="tablist">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-white/10 text-slate-50" : "text-slate-400 hover:text-slate-200"}`}>{label}</button>)}</div>
      {tab === "mine" ? <MyTimesheetPanel skin="desktop" /> : tab === "signoff" ? <SignOffPanel skin="desktop" canManage={canManage} /> : tab === "payroll" ? <PayrollDesk canSend={canPayroll} /> : <PeriodsPanel skin="desktop" />}
    </div>
  );
}
