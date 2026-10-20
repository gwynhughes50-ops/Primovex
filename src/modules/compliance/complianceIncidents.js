// A failed compliance check (a water outlet outside its temperature range, a fire door that doesn't close) is not just
// a red mark: someone has to deal with it, say what they did, and show it passing again. This is the pure side of that
// (no Firestore, no screens), the same shape as the fridge incidents.

import { getAssetTypeConfig, toDateValue } from "../../services/compliance/complianceRules.js";

export const INCIDENT_STATUS = { open: "open", resolved: "resolved" };

// Who is told straight away when a check fails (the Cloud Function applies the same list)
export const ALERT_ROLES = ["Caretaker", "Practice Manager"];

export function assetGroup(type) {
  const t = String(type || "");
  if (t.startsWith("water_")) return "water";
  if (t.startsWith("fire_") || t === "aed") return "fire";
  return "other";
}

// What was done about it, picked from a list (a note can be added to any of them)
const CHOICES = [
  { key: "flushed", label: "Ran or flushed the outlet", groups: ["water"] },
  { key: "descaled", label: "Cleaned or descaled the outlet", groups: ["water"] },
  { key: "adjusted", label: "Adjusted the thermostat, valve or boiler", groups: ["water"] },
  { key: "repaired", label: "Repaired or replaced it", groups: ["fire", "other"] },
  { key: "contractor", label: "Reported to the contractor", groups: ["water", "fire", "other"] },
  { key: "isolated", label: "Taken out of use until it is fixed", groups: ["water", "fire", "other"] },
  { key: "sign", label: "Warning sign put up", groups: ["water", "fire", "other"] },
  { key: "other", label: "Something else (add a note)", groups: ["water", "fire", "other"] },
];
// A fault the fire alarm panel showed during the weekly test (an earth fault, say). The test itself passed; the fault is the
// incident, and is dealt with by the fire alarm engineer rather than by checking the call point again.
export const PANEL_FAULT = "panel_fault";
export const isPanelFault = (incident) => incident?.kind === PANEL_FAULT;

// An appliance that failed its PAT test and was taken out of use. Put right (repaired and retested, or replaced) by the caretaker;
// it is closed once that is recorded, not by checking a compliance asset again.
export const PAT_FAIL = "pat_fail";
export const isPatFail = (incident) => incident?.kind === PAT_FAIL;
// the kinds of incident that are closed once something has been done, without a passing recheck
export const closesWithoutRecheck = (incident) => isPanelFault(incident) || isPatFail(incident);

const PANEL_CHOICES = [
  { key: "engineer", label: "Fire alarm engineer called" },
  { key: "monitoring", label: "Alarm receiving centre told about the fault" },
  { key: "fixed", label: "Fault cleared or repaired" },
  { key: "other", label: "Something else (add a note)" },
];

const PAT_CHOICES = [
  { key: "labelled", label: "Labelled as failed and taken out of use" },
  { key: "pat_repaired", label: "Repaired and retested" },
  { key: "pat_replaced", label: "Replaced or disposed of" },
  { key: "contractor", label: "Reported to the contractor" },
  { key: "other", label: "Something else (add a note)" },
];

export const actionChoicesFor = (type) => CHOICES.filter((c) => c.groups.includes(assetGroup(type)));
// the choices for one incident: a panel fault has its own
export const incidentChoices = (incident) => (isPanelFault(incident) ? PANEL_CHOICES : isPatFail(incident) ? PAT_CHOICES : actionChoicesFor(incident?.assetType));
export const choiceLabel = (key) => CHOICES.find((c) => c.key === key)?.label || PANEL_CHOICES.find((c) => c.key === key)?.label || PAT_CHOICES.find((c) => c.key === key)?.label || key;

const trim = (value, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const degrees = (value) => (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? `${Number(value)}°C` : "");

export function describeFailure(asset, check) {
  const name = trim(asset?.label || asset?.assetCode || "An asset", 80);
  if ((check?.checkMode || asset?.checkMode) === "temperature") {
    const reading = degrees(check?.tempC);
    const min = degrees(check?.minTempC ?? asset?.minTempC);
    const max = degrees(check?.maxTempC ?? asset?.maxTempC);
    return `${name} read ${reading || "no usable reading"}, outside its safe range${min && max ? ` (${min} to ${max})` : ""}.`;
  }
  return `${name} was marked as not working or failed its check.`;
}

// The document written when a check fails
export function buildIncident({ asset, check, actor = {} }) {
  return {
    siteId: asset?.siteId || check?.siteId || "main_branch",
    assetId: asset?.id || check?.assetId || "",
    assetCode: trim(asset?.assetCode || check?.assetCode, 40),
    assetLabel: trim(asset?.label || check?.assetLabel || getAssetTypeConfig(asset?.assetType).label, 120),
    assetType: asset?.assetType || check?.assetType || "general",
    location: trim(asset?.location || check?.location, 120),
    checkId: check?.id || "",
    severity: check?.severity || "medium",
    summary: describeFailure(asset, check),
    observedTemp: Number.isFinite(Number(check?.tempC)) && check?.tempC !== "" && check?.tempC !== null ? Number(check.tempC) : null,
    expectedRange: asset?.minTempC != null && asset?.maxTempC != null ? { min: Number(asset.minTempC), max: Number(asset.maxTempC) } : null,
    status: INCIDENT_STATUS.open,
    openedAtMs: Date.now(),
    openedByUid: actor.uid || "",
    openedBy: trim(actor.displayName || actor.name || actor.email, 80) || "A colleague",
    actions: [],
  };
}

// The document written when the alarm panel shows a fault during a fire alarm test. What the person typed about it is kept
// on the incident (faultNote) and never in the summary, because the summary goes into the alert on people's lock screens.
export function buildPanelFaultIncident({ asset, check, actor = {}, note = "" }) {
  const name = trim(asset?.label || asset?.assetCode || "a call point", 80);
  return {
    kind: PANEL_FAULT,
    siteId: asset?.siteId || check?.siteId || "main_branch",
    assetId: asset?.id || check?.assetId || "",
    assetCode: trim(asset?.assetCode || check?.assetCode, 40),
    assetLabel: "Fire alarm panel fault",
    assetType: "fire_alarm_panel",
    location: trim(asset?.location || check?.location, 120),
    checkId: check?.id || "",
    severity: "high",
    summary: `The fire alarm panel showed a fault during the test of ${name}.`,
    faultNote: trim(note, 200),
    observedTemp: null,
    expectedRange: null,
    status: INCIDENT_STATUS.open,
    openedAtMs: Date.now(),
    openedByUid: actor.uid || "",
    openedBy: trim(actor.displayName || actor.name || actor.email, 80) || "A colleague",
    actions: [],
  };
}

// The document written when an appliance fails its PAT test. Only its tag, name and place are in the summary (it goes into the
// alert on people's lock screens); what the person typed is kept on the incident as faultNote.
export function buildPatFailIncident({ asset, test, actor = {} }) {
  const name = trim(asset?.name || test?.name || "An appliance", 80);
  const tag = trim(asset?.tag || test?.tag, 40);
  const label = name + (tag ? " (" + tag + ")" : "");
  return {
    kind: PAT_FAIL,
    siteId: asset?.siteId || test?.siteId || "main_branch",
    assetId: asset?.id || test?.assetId || "",
    assetCode: tag,
    assetLabel: label,
    assetType: "pat_appliance",
    location: trim(asset?.location || test?.location, 120),
    checkId: test?.id || "",
    severity: "high",
    summary: label + " failed its PAT test and has been taken out of use.",
    faultNote: trim(test?.notes, 200),
    observedTemp: null,
    expectedRange: null,
    status: INCIDENT_STATUS.open,
    openedAtMs: Date.now(),
    openedByUid: actor.uid || "",
    openedBy: trim(actor.displayName || actor.name || actor.email, 80) || "A colleague",
    actions: [],
  };
}

export const isOpen = (incident) => incident?.status !== INCIDENT_STATUS.resolved;

export const openedMs = (incident) => toDateValue(incident?.openedAt)?.getTime() || Number(incident?.openedAtMs) || 0;

export function ageText(incident, now = new Date()) {
  const start = openedMs(incident);
  if (!start) return "just now";
  const hours = Math.floor((now.getTime() - start) / 3600000);
  if (hours < 1) return "less than an hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function actionEntry({ choice, note = "", actor = {}, at = Date.now() }) {
  return { key: choice, label: choiceLabel(choice), note: trim(note, 200), by: trim(actor.displayName || actor.name || actor.email, 80) || "A colleague", byUid: actor.uid || "", atMs: at };
}

const checkMs = (check) => (toDateValue(check?.performedAt) || toDateValue(check?.createdAt))?.getTime() || 0;

// Has the asset been checked again since the failure, and did it pass? checks: any checks, this asset's are picked out.
//   { state: "none" | "failed" | "passed", check }
export function recheckState(incident, checks = []) {
  const since = openedMs(incident);
  const mine = checks.filter((c) => c.assetId === incident?.assetId && checkMs(c) > since).sort((a, b) => checkMs(b) - checkMs(a));
  if (!mine.length) return { state: "none", check: null };
  const latest = mine[0];
  return { state: String(latest.result || "").toLowerCase() === "pass" ? "passed" : "failed", check: latest };
}

// "" when it can be closed. A retired asset needs no recheck.
export function closeBlockedReason(incident, checks = [], asset = null) {
  if (!(incident?.actions || []).length) return "Record what was done about it first.";
  // a panel fault is put right by the engineer, not by checking a call point again
  if (closesWithoutRecheck(incident)) return "";
  if (asset && asset.active === false) return "";
  const { state } = recheckState(incident, checks);
  if (state === "none") return "Check it again by scanning its tag. It has to pass before this can be closed.";
  if (state === "failed") return "The latest check on it failed too. Deal with that, then check it again.";
  return "";
}

export function resolutionPatch({ incident, checks = [], asset = null, actor = {}, note = "" }) {
  const blocked = closeBlockedReason(incident, checks, asset);
  if (blocked) throw new Error(blocked);
  const recheck = recheckState(incident, checks).check;
  return {
    status: INCIDENT_STATUS.resolved,
    resolvedBy: trim(actor.displayName || actor.name || actor.email, 80) || "A colleague",
    resolvedByUid: actor.uid || "",
    resolvedAtMs: Date.now(),
    resolutionNote: trim(note, 200),
    recheckCheckId: recheck?.id || "",
  };
}

// open incidents first (oldest first), then the most recently closed
export function sortIncidents(list = []) {
  return [...list].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || (isOpen(a) ? openedMs(a) - openedMs(b) : openedMs(b) - openedMs(a)));
}
