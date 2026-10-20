// The events Primovex writes to the governed audit ledger for compliance, PAT and concern work: who did what, when, to which
// record. Pure (no Firestore, no screens) so the same shapes can be tested, and so the server's cleaner can be shown to keep
// every field. Nothing typed by a person goes in (notes, fault descriptions, reasons): only choices, counts, dates and ids,
// because the ledger is read by people who do not need the detail, and the server drops fields whose names look personal.

const text = (value, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const iso = (value) => {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
};

const event = (action, module, targetType, targetId, summary, metadata = {}, classification = "operational") => ({
  action, module, targetType, targetId: targetId ? text(targetId, 160) : null, summary: text(summary, 300), metadata, classification,
});

const assetWords = (asset) => text(asset?.label || asset?.assetCode || asset?.tag || "an asset", 80);

// ---- compliance (fire, water, emergency equipment) ----

export function complianceCheckEvent({ asset = {}, check = {} } = {}) {
  const result = text(check.result || "", 20) || "recorded";
  const steps = Array.isArray(check.checklist) ? check.checklist : [];
  const meta = {
    assetType: text(asset.assetType || check.assetType, 60),
    result,
    mode: text(check.checkMode || asset.checkMode, 30),
    source: text(check.source, 30),
    savedOffline: check.savedOffline === true,
    manualEntry: check.manualEntry === true,
    performedAt: iso(check.performedAt),
  };
  if (steps.length) {
    meta.stepsDone = steps.filter((s) => s?.ok === true).length;
    meta.stepsTotal = steps.length;
  }
  if (typeof check.faultDetected === "boolean") meta.panelFault = check.faultDetected;
  const how = check.savedOffline === true ? " (done without a signal, filed afterwards)" : check.manualEntry === true ? " (entered by hand)" : "";
  return event("compliance.check.recorded", "compliance", "compliance_check", check.id, `${assetWords(asset)} checked: ${result}${how}`, meta);
}

export function complianceIncidentEvent(step, { incident = {}, choice = "", outcome = "" } = {}) {
  const what = { opened: "opened", action: "action recorded on", resolved: "closed" }[step] || step;
  const meta = { kind: text(incident.kind || "failed_check", 30), assetType: text(incident.assetType, 60) };
  if (choice) meta.choice = text(choice, 40);
  if (outcome) meta.outcome = text(outcome, 40);
  return event(`compliance.incident.${step}`, "compliance", "compliance_incident", incident.id, `Incident ${what}: ${text(incident.assetLabel || "an asset", 80)}`, meta);
}

export function complianceAssetEvent(step, { asset = {}, count = 0, reason = "" } = {}) {
  if (step === "imported") return event("compliance.asset.imported", "compliance", "compliance_asset", null, `${count} ${count === 1 ? "asset" : "assets"} added from a list`, { count });
  const verb = { created: "added", updated: "changed", retired: "retired", restored: "brought back" }[step] || step;
  const meta = { assetType: text(asset.assetType, 60) };
  if (reason) meta.reason = text(reason, 40);
  return event(`compliance.asset.${step}`, "compliance", "compliance_asset", asset.id, `${assetWords(asset)} ${verb}`, meta);
}

// ---- PAT ----

export function patTestEvent({ asset = {}, test = {} } = {}) {
  const result = text(test.result, 20) || "recorded";
  const meta = { result, category: text(asset.category || test.category, 30), outOfUse: result === "fail", nextDueOn: text(test.nextDueOn, 12) };
  return event("pat.test.recorded", "pat", "pat_test", test.id, `${assetWords(asset)} PAT tested: ${result}`, meta);
}

export function patAssetEvent(step, { asset = {}, count = 0 } = {}) {
  if (step === "imported") return event("pat.asset.imported", "pat", "pat_asset", null, `${count} ${count === 1 ? "appliance" : "appliances"} added from a list`, { count });
  const verb = { created: "added", returned: "put back in use" }[step] || step;
  return event(`pat.asset.${step}`, "pat", "pat_asset", asset.id, `${assetWords(asset)} ${verb}`, { category: text(asset.category, 30) });
}

export function patIntervalsEvent(intervals = {}) {
  const kinds = Object.keys(intervals).map((k) => text(k, 30)).filter(Boolean).sort();
  return event("pat.intervals.changed", "pat", "pat_settings", "main", "How often each kind of appliance is retested was changed", { kinds, months: kinds.map((k) => `${k}:${Number(intervals[k]) || 0}`) });
}

// ---- concerns (counts and choices only: the person it is about is never named here) ----

export function concernEvent(step, { concern = {}, party = "", action = "", round = 0, outcome = "", sentBeforeAccepted = false } = {}) {
  const ref = text(concern.reference || concern.id, 40);
  const labelled = ref ? `Concern ${ref}` : "A concern";
  const gov = (name, summary, meta = {}) => event(`governance.concern.${name}`, "governance", "concern", concern.id, summary, meta, "governance");
  switch (step) {
    case "created": return gov("created", `${labelled} logged`, { source: text(concern.source, 30) });
    case "step": return gov("step", `${labelled}: ${text(party, 20)} ${text(action, 20)}${round > 1 ? ` (round ${round})` : ""}`, { party: text(party, 20), action: text(action, 20), round: Number(round) || 0 });
    case "closed": return gov("closed", `${labelled} closed${sentBeforeAccepted ? " (final response sent before everyone had accepted it)" : ""}`, { outcome: text(outcome, 40), sentBeforeAccepted: sentBeforeAccepted === true });
    case "extended": return gov("deadline_extended", `${labelled}: response deadline extended`);
    case "deleted": return gov("deleted", `${labelled} deleted`);
    default: return gov(step, `${labelled}: ${step}`);
  }
}
