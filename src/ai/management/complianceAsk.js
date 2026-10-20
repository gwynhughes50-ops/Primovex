// What the Orb can say about the caretaker's side of Compliance: what is due, what is open, and where the PAT testing is up
// to. Pure (no Firestore, no screens): the tools read the records and hand them in. Appliance names and tags are shown;
// anything a person typed on an incident (notes, what the panel showed) never is.

import { dueList } from "../../modules/compliance/complianceDue.js";
import { isOpen, isPanelFault, isPatFail, ageText, closesWithoutRecheck } from "../../modules/compliance/complianceIncidents.js";
import { dueSummary, findAppliance, searchAppliances, ukDate } from "../../modules/pat/pat.js";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const norm = (text) => String(text || "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

// ---- what was asked ----

const FRIDGE = /\b(?:fridges?|freezers?)\b/;
// questions about SARs, concerns, significant events or sign-ins are theirs, even when a word like "outstanding" or "Pat" appears
const OTHER_AREA = /\b(?:sars?|subject access|concerns?|complaints?|significant events?|log(?:ged)? in|sign(?:ed)? in)\b/;
const PAT_WORD = /\bpat\b|\bportable appliance|\bappliance test|\belectrical (?:safety|test|testing)\b/;
const PAT_CONTEXT = /\b(?:test|tests|tested|testing|retest|retests|appliances?|tags?|register|overdue|due|out of use|failed|fail|passed|status|certificates?)\b/;

// the words that are not the appliance, so what is left can be searched for
const PAT_FILLER = /\b(?:when|what|which|is|are|the|a|an|was|were|has|have|had|been|did|does|do|it|its|last|latest|next|due|overdue|pat|portable|appliance|appliances|test|tests|tested|testing|retest|retested|status|of|for|on|in|to|be|tag|number|no|please|tell|me|about|show|any|all|anything|failed|fail|passed|out|use|with|and|that|this|there|how|many|much|we|our|us|i|my|electrical|safety|register|certificate|certificates|date|check|checked|still|yet|now|today|need|needs|needing|done|by|at|going|go|goes|get|getting|got|doing|progress|far|along|up|coming|looking|look|looks|so|week|month|year|soon|late|behind|left|remaining|outstanding|compliance|caretaker|anyone|anything|something|everything|ok|okay|fine|good|well|then|just|not|yes|if|or|but|as|from|into|than|too|very|really)\b/g;

function applianceQuery(text) {
  const tag = text.match(/\b(?:tag|appliance|number|no\.?|#)\s*([a-z]{0,4}-?\s?\d[a-z0-9-]*)\b/);
  if (tag) return tag[1].replace(/\s+/g, "");
  const code = text.match(/\b([a-z]{1,4}-\d{1,6})\b/);
  if (code) return code[1];
  const rest = text.replace(PAT_FILLER, " ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  return rest && rest.split(" ").length <= 3 ? rest : "";
}

// null when it is not about this. Otherwise { toolId, input }.
export function parseComplianceQuestion(prompt, { stage = "before-last-check" } = {}) {
  const text = norm(prompt);
  if (!text) return null;
  const howTo = /\b(?:how (?:do|can|would) (?:i|we|you)|how to|where (?:do|can) i|steps? to)\b/.test(text);
  if (howTo) return null;

  if (stage === "before-last-check") {
    // a fault the alarm panel showed, or the open incidents across Compliance
    const panel = /\b(?:panel faults?|fault on the (?:fire )?(?:alarm|panel)|alarm panel|fire panel|panel is showing a fault)\b/.test(text);
    const incidents = /\b(?:incidents?|failed (?:checks?|appliances?|tests?)|failing)\b/.test(text)
      && /\b(?:open|any|outstanding|current|unresolved|live|still|how many|are there)\b/.test(text)
      && /\b(?:compliance|caretaker|fire|water|legionella|check|checks|appliances?|pat|alarm|panel|asset|assets|tag|tags|door|doors|aed|defib)\b/.test(text)
      && !FRIDGE.test(text) && !OTHER_AREA.test(text);
    if (panel || incidents) return { toolId: "compliance.incidents", input: {} };

    // PAT testing
    if (PAT_WORD.test(text) && PAT_CONTEXT.test(text)) {
      const query = applianceQuery(text);
      return { toolId: "pat.status", input: query ? { query } : {} };
    }
  }

  if (stage === "after-last-check") {
    // what is due or overdue across Compliance, or what the caretaker has to do
    const asking = /\b(?:what(?:'s| is| are)?|which|anything|any|show|list|tell me|how much|how many)\b/.test(text);
    const due = /\b(?:due|overdue|outstanding|needs? doing|need to be done|to do|not been done|not done|missed|late|behind|left to do)\b/.test(text);
    const area = /\b(?:compliance|caretaker|checks?|fire|water|legionella|appliances?|tags?|assets?)\b/.test(text);
    if (asking && due && area && !FRIDGE.test(text) && !OTHER_AREA.test(text)) return { toolId: "compliance.dueNow", input: {} };
  }
  return null;
}

// ---- what is due ----

// items: the list dueList gives. Urgent (red) first, as the Compliance page shows them.
export function dueNowAnswer({ assets = [], incidents = [], patAssets = [], patSessions = [], now = new Date() } = {}) {
  const items = dueList({ assets, incidents, patAssets, patSessions, now });
  if (!items.length) return { text: "Nothing needs doing in Compliance right now: no check is overdue, no incident is open and the PAT testing is up to date.", count: 0, urgent: 0 };
  const urgent = items.filter((i) => i.tone === "critical");
  const lines = [`${plural(items.length, "thing")} in Compliance ${items.length === 1 ? "needs" : "need"} attention${urgent.length ? `, ${urgent.length} urgent` : ""}:`];
  for (const item of items.slice(0, 8)) lines.push(`• ${item.tone === "critical" ? "Urgent: " : ""}${item.label}${item.detail ? `. ${item.detail}` : ""}`);
  if (items.length > 8) lines.push(`…and ${items.length - 8} more. Open Compliance to see them all.`);
  return { text: lines.join("\n"), count: items.length, urgent: urgent.length };
}

// ---- open incidents ----

const kindWords = (incident) => (isPanelFault(incident) ? "Fire alarm panel fault" : isPatFail(incident) ? `${incident.assetLabel || "An appliance"} failed its PAT test` : `${incident.assetLabel || incident.assetCode || "An asset"} failed its check${incident.location ? ` (${incident.location})` : ""}`);

export function incidentsAnswer({ incidents = [], now = new Date() } = {}) {
  const open = incidents.filter(isOpen);
  if (!open.length) return { text: "There are no open incidents in Compliance. Nothing has failed that is waiting to be put right.", count: 0 };
  const faults = open.filter(isPanelFault).length;
  const appliances = open.filter(isPatFail).length;
  const checks = open.length - faults - appliances;
  const parts = [];
  if (checks) parts.push(plural(checks, "failed check"));
  if (faults) parts.push(plural(faults, "alarm panel fault"));
  if (appliances) parts.push(plural(appliances, "failed appliance"));
  const lines = [`${plural(open.length, "open incident")}: ${parts.join(", ")}.`];
  const oldest = [...open].sort((a, b) => (a.openedAtMs || 0) - (b.openedAtMs || 0));
  for (const incident of oldest.slice(0, 5)) {
    const acted = (incident.actions || []).length;
    const next = closesWithoutRecheck(incident) ? "close it once it is put right" : "needs a passing recheck";
    lines.push(`• ${kindWords(incident)}, open ${ageText(incident, now)}. ${acted ? `${plural(acted, "action")} recorded; ${next}.` : "Nothing recorded yet."}`);
  }
  if (open.length > 5) lines.push(`…and ${open.length - 5} more.`);
  return { text: lines.join("\n"), count: open.length };
}

// ---- PAT ----

const STATE_WORDS = {
  "out-of-use": () => "failed its last test and is out of use",
  never: () => "has not been PAT tested yet",
  overdue: (days) => `is overdue for testing by ${plural(Math.abs(days), "day")}`,
  "due-soon": (days) => `is due for testing in ${plural(days, "day")}`,
  ok: (days) => `is up to date, next test due in ${plural(days, "day")}`,
};

const describeAppliance = (asset, now) => {
  const { rows } = dueSummary([asset], now);
  const row = rows[0];
  const what = [asset.tag ? `Tag ${asset.tag}` : "", asset.name].filter(Boolean).join(", ");
  const where = asset.location ? ` (${asset.location})` : "";
  const last = asset.lastTestedOn ? ` Last tested ${ukDate(asset.lastTestedOn)}${asset.lastResult ? `: ${asset.lastResult === "fail" ? "failed" : "passed"}` : ""}.` : "";
  const due = asset.nextDueOn && row.state !== "out-of-use" ? ` Next due ${ukDate(asset.nextDueOn)}.` : "";
  return `${what}${where} ${STATE_WORDS[row.state](row.days)}.${last}${due}`;
};

export function patStatusAnswer({ patAssets = [], patTests = [], query = "", now = new Date() } = {}) {
  const live = patAssets.filter((a) => a && a.active !== false);
  if (!live.length) return { text: "No appliances are on the PAT register yet. They can be added one at a time, or many at once from a list, under Compliance, then PAT.", found: false };
  const q = String(query || "").trim();
  if (q) {
    const exact = findAppliance(live, q);
    const matches = exact ? [exact] : searchAppliances(live, q, 6);
    if (matches.length === 1) return { text: describeAppliance(matches[0], now), found: true };
    if (matches.length > 1) {
      return { text: `${matches.length} appliances match "${q}":\n${matches.map((a) => `• ${describeAppliance(a, now)}`).join("\n")}`, found: true };
    }
    // nothing by that name: say so and still give the overall position
    const overall = patStatusAnswer({ patAssets, patTests, now });
    return { text: `I can't find an appliance matching "${q}" on the PAT register. ${overall.text}`, found: false, counts: overall.counts };
  }
  const { rows, counts } = dueSummary(live, now);
  const tested = live.filter((a) => a.lastTestedOn).length;
  const lines = [`${plural(counts.total, "appliance")} on the PAT register, ${tested} tested so far.`];
  const issues = [];
  if (counts.outOfUse) issues.push(`${counts.outOfUse} out of use after a failed test`);
  if (counts.overdue) issues.push(`${counts.overdue} overdue`);
  if (counts.never) issues.push(`${counts.never} not tested yet`);
  if (counts.dueSoon) issues.push(`${counts.dueSoon} due in the next 30 days`);
  lines.push(issues.length ? `${issues.join(", ")}.` : "Every appliance is up to date.");
  const worst = rows.filter((r) => r.state !== "ok").slice(0, 4);
  for (const row of worst) lines.push(`• ${row.asset.tag ? `${row.asset.tag}, ` : ""}${row.asset.name}${row.asset.location ? ` (${row.asset.location})` : ""}: ${STATE_WORDS[row.state](row.days)}`);
  const year = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
  const recent = patTests.filter((t) => { const d = new Date(`${t.testedOn}T12:00:00`).getTime(); return Number.isFinite(d) && d >= year; }).length;
  if (patTests.length) lines.push(`${plural(recent, "test")} recorded in the last 12 months.`);
  return { text: lines.join("\n"), found: true, counts };
}
