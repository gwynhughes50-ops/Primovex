import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Mail, RefreshCw, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_TEMPLATES } from "@/core/identity/capabilities";
import { writeAuditEvent } from "@/core/identity/auditService";
import { createUserAccount, subscribeUsers, updateUserDepartment, updateUserReportsTo } from "@/services/adminUserService";
import { addDepartment, subscribeCollection } from "@/services/practiceAdminService";
import { assignableRoles, parseRoster, planImport, runImport } from "@/lib/staffImport";

const STATUS = {
  new: { label: "New account", cls: "bg-emerald-500/15 text-emerald-200" },
  existing: { label: "Already has an account", cls: "bg-sky-500/15 text-sky-200" },
  skip: { label: "Not added", cls: "bg-slate-500/20 text-slate-300" },
  error: { label: "Needs fixing", cls: "bg-rose-500/15 text-rose-200" },
};

const field = "h-9 w-full rounded-lg border border-slate-800/70 bg-slate-950/40 px-2 text-sm text-slate-100";

// Bulk-add staff from a spreadsheet: accounts, roles, departments and who reports to
// whom. Shows exactly what it will do first. It creates the accounts only - it never
// sends an email; each person's sign-in link is sent by the administrator later.
export default function ImportStaff() {
  const { user, displayName, customRoles } = useAuth();
  const actor = useMemo(() => ({ uid: user?.uid || null, displayName: displayName || user?.email || "Unknown", email: user?.email || null }), [user, displayName]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState({}); // line -> { role, displayName }
  const [state, setState] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const offUsers = subscribeUsers(setUsers, (err) => setError(err?.message || "Couldn't load the current users."));
    const offDepartments = subscribeCollection("practice_departments", (snap) => setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return () => { offUsers?.(); offDepartments?.(); };
  }, []);

  const roleNames = useMemo(() => assignableRoles(Object.keys(ROLE_TEMPLATES), customRoles), [customRoles]);
  const roster = useMemo(() => parseRoster(text), [text]);
  const plan = useMemo(() => {
    const rows = roster.rows.map((row) => ({ ...row, role: overrides[row.line]?.role ?? row.role, displayNameOverride: overrides[row.line]?.displayName }));
    return planImport({ rows, existing: users, roleNames, departments: departments.filter((d) => d.active !== false).map((d) => d.name) });
  }, [roster, overrides, users, roleNames, departments]);

  const doable = plan.summary.newAccounts + plan.summary.existing;
  const setOverride = (line, patch) => setOverride_(setOverrides, line, patch);

  async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setOverrides({});
    setOutcome(null);
    setState("idle");
    setError("");
  }

  async function start() {
    setState("running");
    setError("");
    setOutcome(null);
    try {
      const result = await runImport(plan, {
        addDepartment: (name) => addDepartment({ name, description: "" }, actor),
        // The sign-in link the account function returns is deliberately thrown away:
        // nobody is told about their account until the administrator chooses to.
        createAccount: async (account) => { const made = await createUserAccount(account); return { uid: made?.uid }; },
        setDepartment: updateUserDepartment,
        setReportsTo: updateUserReportsTo,
      }, { onProgress: setProgress });
      setOutcome(result);
      writeAuditEvent({
        action: "admin.users.import",
        module: "administration",
        targetType: "user_import",
        summary: "Staff imported from a spreadsheet",
        classification: "security",
        metadata: { created: result.results.filter((r) => r.created).length, failed: result.results.filter((r) => r.failed).length, rows: plan.summary.total },
      }).catch(() => {});
    } catch (err) {
      setError(err?.message || "The import stopped unexpectedly. Running it again is safe: accounts already created are skipped.");
    } finally {
      setState("done");
    }
  }

  const failed = outcome?.results.filter((r) => r.failed) || [];
  const created = outcome?.results.filter((r) => r.created).length || 0;

  return (
    <Card className="mx-auto max-w-6xl border border-slate-800/70 bg-slate-900/70 text-slate-100">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Import staff</CardTitle>
            <CardDescription className="text-slate-400">Create accounts, set departments and reporting lines from a spreadsheet (CSV).</CardDescription>
          </div>
          <Badge className="bg-teal-500/15 text-teal-200 hover:bg-teal-500/15">Admin only</Badge>
        </div>
        <div className="flex gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>No emails are sent.</b> This only creates the accounts. Nobody is told they have one until you send them their sign-in link yourself (Users, then Password link).</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-700 p-4 text-sm hover:border-sky-400">
          <FileUp className="h-5 w-5 text-slate-400" />
          <span>{fileName ? <>Loaded <b>{fileName}</b>. Choose another to replace it.</> : "Choose the staff spreadsheet (.csv)"}</span>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" />
        </label>
        {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}
        {roster.missing.length > 0 && text && <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">The file needs a column headed {roster.missing.join(" and ")}.</p>}

        {plan.rows.length > 0 && roster.missing.length === 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {[["New accounts", plan.summary.newAccounts, "text-emerald-200"], ["Already exist", plan.summary.existing, "text-sky-200"], ["Not added", plan.summary.skipped, "text-slate-300"], ["Need fixing", plan.summary.errors, plan.summary.errors ? "text-rose-200" : "text-slate-300"]].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><p className={`text-xs font-bold uppercase tracking-wide ${tone}`}>{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
              ))}
            </div>
            {plan.newDepartments.length > 0 && <p className="text-sm text-slate-300">Departments that will be added: <b>{plan.newDepartments.join(", ")}</b></p>}

            <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-2">Line</th><th className="p-2">Status</th><th className="p-2">Name on the account</th><th className="p-2">Email</th><th className="p-2">Role</th><th className="p-2">Department</th><th className="p-2">Reports to</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {plan.rows.map((row) => {
                    const editable = row.status === "new" || row.status === "error";
                    const manager = plan.rows.find((r) => r.key === row.managerKey);
                    return (
                      <tr key={row.key} className="align-top">
                        <td className="p-2 text-slate-500">{row.line}</td>
                        <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[row.status].cls}`}>{STATUS[row.status].label}</span></td>
                        <td className="p-2">
                          {editable && row.email ? <input value={overrides[row.line]?.displayName ?? row.displayName} onChange={(e) => setOverride(row.line, { displayName: e.target.value })} className={field} aria-label={`Name for line ${row.line}`} /> : <span>{row.displayName}</span>}
                          {row.jobTitle && <span className="block text-xs text-slate-500">{row.jobTitle}</span>}
                        </td>
                        <td className="p-2 text-slate-300">{row.email || "—"}</td>
                        <td className="p-2">
                          {editable && row.email ? (
                            <select value={row.role || ""} onChange={(e) => setOverride(row.line, { role: e.target.value })} className={field} aria-label={`Role for line ${row.line}`}>
                              <option value="">Choose a role</option>
                              {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          ) : <span>{row.role || "—"}</span>}
                        </td>
                        <td className="p-2">{row.department || "—"}</td>
                        <td className="p-2">{manager ? manager.displayName : row.managerKey ? "(existing user)" : row.reportsTo ? <span className="text-slate-500">{row.reportsTo} (not found)</span> : "—"}
                          {[...row.problems.map((p) => [p, true]), ...row.warnings.map((w) => [w, false])].map(([msg, bad]) => (
                            <span key={msg} className={`mt-1 flex items-start gap-1 text-xs ${bad ? "text-rose-300" : "text-amber-200"}`}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{msg}</span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={start} disabled={state === "running" || doable === 0} className="rounded-full bg-gradient-to-r from-teal-400 to-emerald-300 px-5 font-semibold text-slate-950">
                {state === "running" ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Working… {progress.done} of {progress.total}</> : `Create ${plan.summary.newAccounts} account${plan.summary.newAccounts === 1 ? "" : "s"} and set up ${doable} people`}
              </Button>
              <p className="text-xs text-slate-400">Rows marked "Needs fixing" or "Not added" are left out. Running it again is safe: people who already have an account are skipped.</p>
            </div>
          </>
        )}

        {outcome && (
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-300" /> {created} account{created === 1 ? "" : "s"} created. Nobody has been emailed.</p>
            {outcome.departmentFailures.length > 0 && <p className="text-sm text-rose-200">Couldn't add: {outcome.departmentFailures.map((d) => d.name).join(", ")}.</p>}
            {failed.length > 0 ? (
              <>
                <p className="text-sm text-amber-100">{failed.length} {failed.length === 1 ? "person" : "people"} not fully set up. Fix what is shown and run it again; anyone already created is skipped.</p>
                <ul className="space-y-1 text-sm">{failed.map((r) => <li key={r.key}><b>{r.name}</b>: {r.steps.map((s) => `${s.step} - ${s.error}`).join("; ")}</li>)}</ul>
              </>
            ) : <p className="text-sm text-slate-300">Everyone was set up. Their departments and reporting lines are in the organisation chart.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function setOverride_(setOverrides, line, patch) {
  setOverrides((current) => ({ ...current, [line]: { ...current[line], ...patch } }));
}
