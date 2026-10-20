// "What needs doing": one list across everything the Compliance page looks after, most urgent first. Pure: the screen
// hands in the records.

import { FREQUENCY_MS, getNextFirePointToTest, isComplianceCheckDue, isFireAlarmTestDueThisWeek, toDateValue } from "../../services/compliance/complianceRules.js";
import { isOpen as incidentOpen, ageText, isPanelFault } from "./complianceIncidents.js";
import { issueSummary } from "../maintenance/maintenance.js";
import { reviewSummary } from "../coshh/coshh.js";
import { certLabel, certStatus, daysUntilExpiry } from "../certificates/certificates.js";

const DAY = 86400000;
// which part of the Overview an asset is listed under, so "Open" can take the person to it
const sectionOf = (asset) => (asset?.assetType === "fire_point" ? "fire" : /^water/.test(String(asset?.assetType || "")) ? "water" : "other");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ORDER = { critical: 0, warning: 1 };
const label = (asset) => asset?.label || asset?.assetCode || "An asset";

// Late, but not alarming yet, is amber; properly overdue is red. A check is red a week past the day it fell due; the
// weekly fire alarm test, a fortnight after the last one (or never done).
export const RED_AFTER_DAYS = 7;
export const FIRE_RED_AFTER_DAYS = 14;

// whole days past the day this asset's check fell due (0 when never checked: a new asset is amber, not red)
export function overdueDays(asset, now = new Date()) {
  const last = toDateValue(asset?.lastCheckAt);
  if (!last) return 0;
  const interval = FREQUENCY_MS[asset.frequency] ?? FREQUENCY_MS.monthly;
  return Math.max(0, Math.floor((now.getTime() - last.getTime() - interval) / DAY));
}

// days since any call point was last tested (Infinity when none ever has)
export function daysSinceFireTest(assets = [], now = new Date()) {
  const times = assets.filter((a) => a.assetType === "fire_point" && a.active !== false).map((a) => toDateValue(a.lastCheckAt)?.getTime()).filter(Boolean);
  return times.length ? Math.floor((now.getTime() - Math.max(...times)) / DAY) : Infinity;
}

// A PAT session records when the next test is due; the most recent session's date is the one that counts.
export function patRetest(sessions = [], now = new Date()) {
  const dated = sessions
    .map((s) => ({ tested: toDateValue(s.testDate) || toDateValue(s.createdAt), retest: toDateValue(s.retestDate) }))
    .filter((s) => s.tested)
    .sort((a, b) => b.tested - a.tested);
  const latest = dated[0];
  if (!latest?.retest) return null;
  const days = Math.round((latest.retest.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
  return { date: latest.retest, days };
}

export function dueList({ assets = [], incidents = [], patSessions = [], issues = [], coshh = null, certificates = null, now = new Date() } = {}) {
  const items = [];
  const open = incidents.filter(incidentOpen);
  for (const incident of open) {
    const fault = isPanelFault(incident);
    items.push({
      key: `incident-${incident.id}`,
      tone: "critical",
      label: fault ? "The fire alarm panel is showing a fault" : `${label({ label: incident.assetLabel, assetCode: incident.assetCode })} failed its check`,
      detail: `Open for ${ageText(incident, now)}. ${(incident.actions || []).length ? (fault ? "Action recorded; needs closing once it is put right." : "Action recorded; needs a passing recheck.") : "Nothing recorded yet."}`,
      action: { type: "incident", id: incident.id },
    });
  }
  const withIncident = new Set(open.map((i) => i.assetId));

  const live = assets.filter((a) => a.active !== false);
  if (isFireAlarmTestDueThisWeek(live, now)) {
    const next = getNextFirePointToTest(live);
    items.push({ key: "fire-weekly", tone: daysSinceFireTest(live, now) > FIRE_RED_AFTER_DAYS ? "critical" : "warning", label: "The weekly fire alarm test hasn't been done", detail: next ? `Test ${label(next)} next.` : "", action: { type: "section", section: "fire" } });
  }

  const due = live.filter((a) => isComplianceCheckDue(a, now) && !withIncident.has(a.id));
  const failingNoIncident = due.filter((a) => a.lastCheckResult === "fail");
  const overdue = due.filter((a) => a.lastCheckResult !== "fail");
  if (failingNoIncident.length) items.push({ key: "failing", tone: "critical", label: `${plural(failingNoIncident.length, "asset")} last failed its check`, detail: failingNoIncident.slice(0, 4).map(label).join(", "), action: { type: "section", section: sectionOf(failingNoIncident[0]) } });
  if (overdue.length) items.push({ key: "overdue", tone: Math.max(...overdue.map((a) => overdueDays(a, now))) >= RED_AFTER_DAYS ? "critical" : "warning", label: `${plural(overdue.length, "check")} overdue`, detail: `${overdue.slice(0, 4).map((a) => a.assetCode || label(a)).join(", ")}${overdue.length > 4 ? ` and ${overdue.length - 4} more` : ""}`, action: { type: "section", section: sectionOf(overdue[0]) } });

  const pat = patRetest(patSessions, now);
  if (pat && pat.days <= 30) items.push({ key: "pat", tone: pat.days < 0 ? "critical" : "warning", label: pat.days < 0 ? "PAT retesting is overdue" : "PAT retesting is due soon", detail: `Retest ${pat.days < 0 ? `was due ${Math.abs(pat.days)} day${Math.abs(pat.days) === 1 ? "" : "s"} ago` : pat.days === 0 ? "is due today" : `due in ${pat.days} day${pat.days === 1 ? "" : "s"}`}.`, action: { type: "tab", tab: "pat" } });

  const maintenance = issueSummary(issues, now);
  if (maintenance.open) items.push({ key: "maintenance", tone: maintenance.urgent ? "critical" : "warning", label: `${plural(maintenance.open, "maintenance issue")} open${maintenance.urgent ? `, ${maintenance.urgent} urgent` : ""}`, detail: maintenance.oldestDays ? `The oldest is ${plural(maintenance.oldestDays, "day")} old.` : "", action: { type: "tab", tab: "maintenance" } });

  if (certificates) {
    const live = certificates.filter((c) => c.active !== false);
    const expired = live.filter((c) => ["expired", "missing"].includes(certStatus(c, now)));
    const soon = live.filter((c) => certStatus(c, now) === "due-soon").sort((a, b) => daysUntilExpiry(a, now) - daysUntilExpiry(b, now));
    const names = (list) => `${list.slice(0, 3).map(certLabel).join(", ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}`;
    if (expired.length) items.push({ key: "certs-expired", tone: "critical", label: `${plural(expired.length, "certificate")} expired`, detail: names(expired), action: { type: "tab", tab: "certificates" } });
    if (soon.length) items.push({ key: "certs-soon", tone: "warning", label: `${plural(soon.length, "certificate")} running out soon`, detail: `${names(soon)}. The first runs out in ${plural(daysUntilExpiry(soon[0], now), "day")}.`, action: { type: "tab", tab: "certificates" } });
  }

  if (coshh) {
    const review = reviewSummary(coshh, now);
    if (review.overdue) items.push({ key: "coshh-overdue", tone: "critical", label: `${plural(review.overdue, "COSHH review")} overdue`, detail: "", action: { type: "tab", tab: "coshh" } });
    else if (review.dueSoon) items.push({ key: "coshh-soon", tone: "warning", label: `${plural(review.dueSoon, "COSHH review")} due in the next 30 days`, detail: "", action: { type: "tab", tab: "coshh" } });
  }

  return items.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
}
