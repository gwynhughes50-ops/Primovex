// Made-up pay periods and timesheets for Demo and Training mode (no real people or hours).

const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (k, n) => { const [y, m, d] = k.split("-").map(Number); const x = new Date(y, m - 1, d + n); return key(x); };
const monday = (date) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return key(d); };

export function demoTimesheetFlow() {
  const thisFrom = addDays(monday(new Date()), -14);
  const periods = [
    { id: "dp-2", name: "Current payroll", from: thisFrom, to: addDays(thisFrom, 27), due: addDays(thisFrom, 28) },
    { id: "dp-1", name: "Previous payroll", from: addDays(thisFrom, -28), to: addDays(thisFrom, -1), due: thisFrom },
  ];
  const sheet = (id, name, state, kind, lines, extra = {}) => ({
    id: `dp-1_${id}`, periodId: "dp-1", staffId: id, uid: `u-${id}`, staffName: name, payrollNo: "100", managerUid: null, state, kind, from: periods[1].from, to: periods[1].to,
    expected: { hours: 150 }, lines, totals: lines.reduce((t, l) => ({ ...t, [l.code]: (t[l.code] || 0) + l.hours }), { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }),
    declaration: { text: "I confirm", confirmedAt: "2026-10-05T09:00:00Z", confirmedByName: name }, submissions: 1, ...extra,
  });
  const managed = [
    sheet("t1", "Rita Reception", "submitted", "no-change", []),
    sheet("t2", "Sam Secretary", "submitted", "no-change", []),
    sheet("t3", "Dev Dispenser", "submitted", "changes", [{ date: addDays(periods[1].from, 10), code: "B", hours: 2, comment: "Covered the late dispensing" }, { date: addDays(periods[1].from, 15), code: "D", hours: 7.5, comment: "" }]),
  ];
  const payroll = [
    sheet("t4", "Nina Nurse", "approved", "no-change", [], { decision: { outcome: "approved", by: "Demo Manager", at: "2026-10-06T09:00:00Z" } }),
    sheet("t5", "Omar Optician", "approved", "changes", [{ date: addDays(periods[1].from, 3), code: "A", hours: 7.5, comment: "" }], { decision: { outcome: "approved", by: "Demo Manager", at: "2026-10-06T09:00:00Z" } }),
    sheet("t6", "Pia Pharmacist", "sent", "no-change", [], { payroll: { outcome: "sent", by: "Payroll", at: "2026-10-07T09:00:00Z", reference: "OCT-26" } }),
  ];
  const mine = [];
  const history = [
    { id: "h1", action: "created and submitted", actorName: "Demo User", fromState: "", toState: "submitted", reason: "", at: { seconds: 1791187200 } },
    { id: "h2", action: "declined by the line manager", actorName: "Demo Manager", fromState: "submitted", toState: "declined", reason: "Overtime on the 12th was not agreed", at: { seconds: 1791273600 } },
    { id: "h3", action: "resubmitted after a decline", actorName: "Demo User", fromState: "declined", toState: "submitted", reason: "", at: { seconds: 1791360000 } },
  ];
  return { periods, mine, managed, payroll, history };
}
