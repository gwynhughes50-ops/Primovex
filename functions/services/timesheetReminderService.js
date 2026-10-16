// Timesheet reminders. Timesheets are due by the date set for each pay period. This sends, each morning:
//   to staff who have not sent theirs        5 days before, 2 days before, on the day, then every day it is overdue (up to 14 days)
//   to a person's line manager               a daily "waiting for you to sign off" count, and from 3 days overdue the names of their team who have not sent
//   to whoever manages timesheets            daily from the day after the due date: who is overdue (and who has no account to be reminded on)
//   to the payroll team                      a daily count of signed-off timesheets still to send to payroll
// and straight away (from the audit trigger) tells a person when their timesheet is declined or returned, with the reason.
// Each notification has a fixed id made from what it is, who it is for and the day, so a second run on the same day sends nothing twice.

const DAY = 86400000;
const REMIND_BEFORE = [5, 2, 0];
const OVERDUE_DAYS = 14;
const ESCALATE_AFTER = 3;
const MAX_NAMES = 8;

const parts = (key) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || "")); return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
const daysBetween = (fromKey, toKey) => Math.round((parts(toKey) - parts(fromKey)) / DAY);
const ukDate = (key) => String(key || "").split("-").reverse().join("/");
const needsStaff = (state) => state === "draft" || state === "declined" || state === "returned";
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const names = (list) => `${list.slice(0, MAX_NAMES).join(", ")}${list.length > MAX_NAMES ? ` and ${list.length - MAX_NAMES} more` : ""}`;

// today's date in London as YYYY-MM-DD
function londonDay(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type) => p.find((x) => x.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Every notification to send today. Pure: given the data, returns [{ uid, id, kind, title, message, priority }].
//   periods [{ id, name, from, to, due }], staff [{ id, uid, name, active, startDate, managerUid }],
//   sheets [{ id, periodId, staffId, state, managerUid, kind }], managerUids (timesheets.manage), payrollUids (timesheets.payroll)
function planReminders({ today, periods = [], staff = [], sheets = [], managerUids = [], payrollUids = [] }) {
  const out = [];
  const push = (uid, kind, key, title, message, priority = "routine") => { if (uid) out.push({ uid, id: `ts-${kind}-${key}-${uid}-${today}`, kind, title, message, priority }); };

  for (const period of periods) {
    const toDue = daysBetween(today, period.due);
    if (toDue === null || toDue > Math.max(...REMIND_BEFORE) || toDue < -OVERDUE_DAYS) continue;
    const people = staff.filter((s) => s.active !== false && (!s.startDate || s.startDate <= period.to));
    const pending = people.filter((s) => { const sheet = sheets.find((t) => t.periodId === period.id && t.staffId === s.id); return !sheet || needsStaff(sheet.state); });
    const sheetOf = (s) => sheets.find((t) => t.periodId === period.id && t.staffId === s.id);

    // the people themselves
    for (const s of pending) {
      const sheet = sheetOf(s);
      const back = sheet?.state === "declined" ? "declined" : sheet?.state === "returned" ? "returned" : "";
      if (toDue >= 0 && !REMIND_BEFORE.includes(toDue)) continue;
      const when = toDue > 0 ? `due in ${plural(toDue, "day", "days")} (${ukDate(period.due)})` : toDue === 0 ? "due today" : `${plural(-toDue, "day", "days")} overdue`;
      const what = back ? `Your timesheet for ${period.name} was ${back} and needs correcting and sending again: it is ${when}.` : `Your timesheet for ${period.name} is ${when}. It only takes a moment: confirm your hours were as normal, or say what was different.`;
      push(s.uid, "remind", period.id, toDue < 0 ? "Timesheet overdue" : toDue === 0 ? "Timesheet due today" : "Timesheet due soon", what, toDue <= 0 ? "high" : "routine");
    }

    // when it is overdue, who has to chase
    if (toDue < 0) {
      const late = pending.map((s) => ({ s, name: s.name || "Someone" }));
      const noAccount = late.filter((l) => !l.s.uid).map((l) => l.name);
      for (const uid of managerUids) {
        push(uid, "overdue", period.id, "Timesheets overdue", `${plural(late.length, "timesheet is", "timesheets are")} overdue for ${period.name} (${-toDue} ${-toDue === 1 ? "day" : "days"}): ${names(late.map((l) => l.name))}.${noAccount.length ? ` ${plural(noAccount.length, "person has", "people have")} no Primovex account linked, so can't be reminded: ${names(noAccount)}.` : ""}`, "high");
      }
      if (-toDue >= ESCALATE_AFTER) {
        const byManager = new Map();
        for (const l of late) if (l.s.managerUid) byManager.set(l.s.managerUid, [...(byManager.get(l.s.managerUid) || []), l.name]);
        for (const [uid, list] of byManager) push(uid, "team-overdue", period.id, "Your team's timesheets are overdue", `${plural(list.length, "person in your team has", "people in your team have")} not sent their timesheet for ${period.name}: ${names(list)}.`, "high");
      }
    }
  }

  // waiting for a line manager to sign off (whichever period)
  const waiting = sheets.filter((t) => t.state === "submitted");
  const byManager = new Map();
  for (const t of waiting) byManager.set(t.managerUid || "none", [...(byManager.get(t.managerUid || "none") || []), t]);
  for (const [uid, list] of byManager) {
    const changed = list.filter((t) => t.kind !== "no-change").length;
    const text = `${plural(list.length, "timesheet is", "timesheets are")} waiting for you to sign off${changed ? ` (${changed} with changes)` : ""}.`;
    if (uid === "none") for (const m of managerUids) push(m, "signoff", "all", "Timesheets to sign off", `${text.replace("for you", "with no line manager set, for you")}`);
    else push(uid, "signoff", "all", "Timesheets to sign off", text);
  }

  // signed off, waiting for the payroll team
  const approved = sheets.filter((t) => t.state === "approved").length;
  if (approved) for (const uid of payrollUids) push(uid, "payroll", "all", "Timesheets for payroll", `${plural(approved, "signed-off timesheet is", "signed-off timesheets are")} waiting to be sent to payroll.`);
  return out;
}

// the notification a person gets at once when their timesheet is declined or returned (from the audit trigger)
function statusNotice(entry, after) {
  if (!entry || !after?.uid || (entry.toState !== "declined" && entry.toState !== "returned")) return null;
  const by = entry.toState === "declined" ? after.decision?.by : after.payroll?.by;
  const period = after.from && after.to ? `${ukDate(after.from)} to ${ukDate(after.to)}` : "this pay period";
  return {
    uid: after.uid, id: `ts-${entry.toState}-${entry.timesheetId}-${Number(after.submissions) || 0}`, kind: `timesheet-${entry.toState}`,
    title: entry.toState === "declined" ? "Timesheet declined" : "Timesheet returned",
    message: `${by || (entry.toState === "declined" ? "Your line manager" : "The payroll team")} ${entry.toState === "declined" ? "declined" : "returned"} your timesheet for ${period}${entry.reason ? `: “${entry.reason}”` : "."} Please correct it and send it again.`,
    priority: "high",
  };
}

const noteBase = { module: "operations", read: false, status: "open", automated: true, createdByName: "Primovex", actionUrl: "/my-timesheet" };

// Writes each notification once: an id already used today is left alone
async function deliver(db, FieldValue, notes) {
  let sent = 0;
  for (const n of notes) {
    try {
      await db.collection("users").doc(n.uid).collection("notifications").doc(n.id).create({ ...noteBase, kind: n.kind.startsWith("timesheet") ? n.kind : `timesheet-${n.kind}`, recipientUid: n.uid, title: n.title, message: n.message, priority: n.priority, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      sent += 1;
    } catch (error) {
      if (!(error?.code === 6 || /already exists/i.test(String(error?.message)))) throw error;
    }
  }
  return sent;
}

async function runTimesheetReminders({ db, FieldValue, now = new Date(), managerUids = [], payrollUids = [] }) {
  const [periodsSnap, staffSnap, sheetsSnap] = await Promise.all([db.collection("timesheet_periods").get(), db.collection("timesheet_staff").get(), db.collection("timesheets").get()]);
  const today = londonDay(now);
  const notes = planReminders({
    today, managerUids, payrollUids,
    periods: periodsSnap.docs.map((d) => ({ id: d.id, ...d.data() })), staff: staffSnap.docs.map((d) => ({ id: d.id, ...d.data() })), sheets: sheetsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  });
  return { planned: notes.length, sent: await deliver(db, FieldValue, notes) };
}

module.exports = { planReminders, statusNotice, deliver, runTimesheetReminders, londonDay, daysBetween };
