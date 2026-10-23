// The history of a timesheet, in words, and the audit sheet that can be printed. Pure (no Firestore, no screens) so it can be tested.
//
// The server keeps one entry for every step (timesheet_audit): who, when, what state it went from and to, the reason if there was one, and
// what the timesheet said at that moment. From those entries this works out what CHANGED at each step (a line added, removed or
// changed), which is what a manager wants to read, and lays it out for paper. Nothing here is stored: it is all worked out from the
// trail, so older entries (before this existed) read the same way.

import { codeLabel } from "./timesheet.js";

// where a timesheet stands, in neutral words (the screens for the person say "your line manager"; paper is read by others)
export const STATE_WORDS = { draft: "Not sent yet", submitted: "Sent, waiting for the line manager", declined: "Declined by the line manager", approved: "Signed off, with the payroll team", returned: "Returned by the payroll team", sent: "Sent to payroll" };
export const stateWords = (state) => STATE_WORDS[state] || String(state || "");

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const uk = (key) => (key ? String(key).split("-").reverse().join("/") : "");
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (key) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || "")); if (!m) return String(key || ""); const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`; };
const hrs = (n) => `${Math.round((Number(n) || 0) * 100) / 100}h`;

// "Thu 22 Oct: Overtime, standard rate, 1h (covering the late clinic)"
export const describeLine = (l) => `${dayText(l.date)}: ${codeLabel(l.code)}, ${hrs(l.hours)}${l.comment ? ` (${l.comment})` : ""}`;

const same = (a, b) => a.date === b.date && a.code === b.code && Number(a.hours) === Number(b.hours) && String(a.comment || "") === String(b.comment || "");

// What changed from one list of lines to the next: lines added, removed, or changed (the same day and kind with a different number
// of hours or comment). Order does not matter.
export function lineChanges(before = [], after = []) {
  const remaining = [...after];
  const gone = [];
  for (const b of before) {
    const i = remaining.findIndex((a) => same(a, b));
    if (i >= 0) remaining.splice(i, 1); else gone.push(b);
  }
  const out = [];
  const added = [...remaining];
  for (const g of gone) {
    const i = added.findIndex((a) => a.date === g.date && a.code === g.code);
    if (i >= 0) { out.push({ type: "changed", from: describeLine(g), text: describeLine(added[i]) }); added.splice(i, 1); } else out.push({ type: "removed", text: describeLine(g) });
  }
  for (const a of added) out.push({ type: "added", text: describeLine(a) });
  return out;
}

const timeOf = (h) => (h?.at?.toMillis ? h.at.toMillis() : h?.at?.seconds ? h.at.seconds * 1000 : Number(h?.atMs) || 0);

// One line of totals: "Overtime, standard rate 1h; Sick leave 7.5h" (or "No changes")
export function totalsText(totals = {}, lines = []) {
  const parts = Object.entries(totals || {}).filter(([, h]) => Number(h) > 0).sort(([x], [y]) => x.localeCompare(y)).map(([code, h]) => `${codeLabel(code)} ${hrs(h)}`);
  return parts.length ? parts.join("; ") : (lines || []).length ? "" : "No changes";
}

// The steps in order, each with what changed in it. `entries` are timesheet_audit rows.
export function historySteps(entries = []) {
  const sorted = [...entries].sort((a, b) => timeOf(a) - timeOf(b));
  let previous = [];
  let previousKind = "";
  return sorted.map((e) => {
    const lines = Array.isArray(e.lines) ? e.lines : [];
    const changes = lineChanges(previous, lines);
    const kindChanged = Boolean(previousKind) && e.kind && e.kind !== previousKind;
    previous = lines;
    previousKind = e.kind || previousKind;
    return {
      id: e.id, atMs: timeOf(e), who: e.actorName || "", action: e.action || "", reason: e.reason || "", reference: e.reference || "",
      fromState: e.fromState || "", toState: e.toState || "", changes,
      kindNote: kindChanged ? (e.kind === "no-change" ? "Changed to: no changes" : "Changed to: something was different") : "",
      totals: totalsText(e.totals, lines), lineCount: lines.length,
      declaration: e.declaration?.confirmedAt ? { by: e.declaration.confirmedByName || "", at: e.declaration.confirmedAt } : null,
    };
  });
}

const stamp = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// The audit sheet on paper (A4 portrait): who, which pay period, where it stands, what it says now, then every step with what changed.
//   sheet: the timesheet ({ staffName, payrollNo, from, to, state, kind, lines, totals, managerName? }), period: { name } (optional)
export function auditHtml({ sheet, period = null, steps = [], stateLabel = "", printedBy = "", now = new Date() }) {
  const lines = Array.isArray(sheet?.lines) ? sheet.lines : [];
  const stepRows = steps.map((s) => {
    const details = [
      s.reason ? `<div><b>Reason:</b> ${esc(s.reason)}</div>` : "",
      s.reference ? `<div><b>Reference:</b> ${esc(s.reference)}</div>` : "",
      s.kindNote ? `<div>${esc(s.kindNote)}</div>` : "",
      ...s.changes.map((c) => `<div class="${c.type}">${c.type === "added" ? "Added" : c.type === "removed" ? "Removed" : "Changed"}: ${esc(c.text)}${c.type === "changed" ? ` <span class="was">(was ${esc(c.from.replace(/^[^:]*: /, ""))})</span>` : ""}</div>`),
      s.declaration ? `<div class="decl">Confirmed by ${esc(s.declaration.by)} on ${esc(stamp(Date.parse(s.declaration.at)))}</div>` : "",
      s.totals ? `<div class="tot">After this step: ${esc(s.totals)}</div>` : "",
    ].filter(Boolean).join("");
    return `<tr><td class="when">${esc(stamp(s.atMs))}</td><td>${esc(s.who || "—")}</td><td><b>${esc(s.action)}</b>${details}</td></tr>`;
  }).join("");
  const lineRows = lines.length ? lines.map((l) => `<tr><td>${esc(dayText(l.date))}</td><td>${esc(codeLabel(l.code))}</td><td class="num">${esc(hrs(l.hours))}</td><td>${esc(l.comment || "")}</td></tr>`).join("") : `<tr><td colspan="4">${sheet?.kind === "no-change" ? "No changes: the hours were as normal." : "No lines recorded."}</td></tr>`;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Timesheet audit: ${esc(sheet?.staffName)}</title><style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #14213d; }
    h1 { font-size: 16pt; margin: 0 0 2px; } h2 { font-size: 11pt; margin: 14px 0 4px; border-bottom: 1px solid #b9c6dc; padding-bottom: 2px; }
    .sub { color: #4a5a78; margin-bottom: 8px; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #b9c6dc; padding: 3px 5px; text-align: left; vertical-align: top; }
    th { background: #e6edf8; } td.num { text-align: right; white-space: nowrap; } td.when { white-space: nowrap; width: 105px; }
    .added { color: #14653c; } .removed { color: #a02525; } .changed { color: #7a5200; } .was, .decl, .tot { color: #4a5a78; font-size: 9pt; }
    .facts td { border: none; padding: 1px 12px 1px 0; } .note { margin-top: 12px; color: #4a5a78; font-size: 9pt; }
  </style></head><body>
  <h1>Timesheet audit</h1>
  <div class="sub">${esc(sheet?.staffName)}${sheet?.payrollNo ? ` · payroll no ${esc(sheet.payrollNo)}` : ""}</div>
  <table class="facts"><tr><td><b>Pay period</b></td><td>${esc(period?.name ? `${period.name}: ` : "")}${esc(uk(sheet?.from))} to ${esc(uk(sheet?.to))}</td></tr>
  <tr><td><b>Where it stands</b></td><td>${esc(stateLabel || sheet?.state || "")}</td></tr>
  ${sheet?.managerName ? `<tr><td><b>Line manager</b></td><td>${esc(sheet.managerName)}</td></tr>` : ""}</table>
  <h2>What the timesheet says now</h2>
  <table><thead><tr><th>Day</th><th>What</th><th>Hours</th><th>Comment</th></tr></thead><tbody>${lineRows}</tbody></table>
  <h2>Everything that has happened to it</h2>
  <table><thead><tr><th>When</th><th>Who</th><th>What happened</th></tr></thead><tbody>${stepRows || `<tr><td colspan="3">Nothing is recorded yet.</td></tr>`}</tbody></table>
  <div class="note">This history is written by the Primovex server each time the timesheet is changed. It cannot be edited or left out by anyone using the app. Printed ${esc(now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}${printedBy ? ` by ${esc(printedBy)}` : ""}.</div>
  </body></html>`;
}
