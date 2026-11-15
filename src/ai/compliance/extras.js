// Equipment and compliance extras for Ask Primovex: IT laptops, certificates, COSHH reviews, clinical waste collections and the staff training matrix.
// Read only, so there are no cards. Pure (no React, no Firestore): the lookups in readOnlyTools.js read each register under the person's own permissions and hand it in.
// They name staff, rooms and equipment, never patients.

import { holderText, isLive, isOnLoan, loanState, ukDay as laptopDay, updateState } from "../../modules/laptops/laptops.js";
import { CERT_TYPES, certLabel, certStatus, expiryText, hasProblem, sortCertificates, certSummary, STATUS_LABEL as CERT_STATUS } from "../../modules/certificates/certificates.js";
import { reviewStatus, reviewSummary, reviewText, sortSubstances, searchSubstances } from "../../modules/coshh/coshh.js";
import { stats as wasteStats } from "../../modules/waste/waste.js";
import { reminderItems } from "../../modules/training/training.js";

const clean = (prompt) => String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?.!]+$/g, "");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const uk = (key) => (key ? String(key).split("-").reverse().join("/") : "");
const more = (list, shown) => (list.length > shown ? `\n…and ${list.length - shown} more.` : "");

// the course a training question names: "who is out of date on fire training" -> "fire", "who needs basic life support" -> "basic life support"; "" when it names none
function courseIn(t) {
  const body = t.replace(/\b(?:training|courses?)\b/g, " ").replace(/\s+/g, " ").trim();
  const parts = body.split(/\b(?:on|for|in|with)\b/);
  const after = parts.length > 1 ? parts[parts.length - 1].trim() : /\bneeds?\s+(.+)$/.exec(body)?.[1]?.trim() || "";
  return /^(?:the\s+)?(?:team|staff|practice|everyone|it|them|renewing|renewal|updating|doing|attention)?$/.test(after) ? "" : after;
}

// ---- what was asked ----
// null when it is not one of these. { toolId, input }
export function parseExtras(prompt) {
  const t = clean(prompt);
  if (!t) return null;
  if (/\bhow\s+(?:do|to|can|should)\b|\bwhere\s+do\s+i\b|\bwhat\s+is\s+(?:a|the)\b/.test(t)) return null;
  const mine = /\b(?:me|my|i)\b/.test(t);

  if (/\blaptops?\b|\bit\s+equipment\b/.test(t)) {
    if (/\b(?:loan|loaned|lent|borrow|borrowed|due\s+back|overdue\s+back)\b/.test(t)) return { toolId: "equipment.laptops", input: { ask: "loans" } };
    if (/\b(?:update|updates|updated|patch|patched|windows)\b/.test(t)) return { toolId: "equipment.laptops", input: { ask: "updates" } };
    const who = /\b(?:who\s+has|where\s+is|who\s+is\s+using|who\s+uses)\b.*?\b(?:laptop\s+)?([a-z]{0,4}[-\s]?\d{1,6}[a-z]?)\b/.exec(t);
    if (who) return { toolId: "equipment.laptops", input: { ask: "who", query: who[1].replace(/\s+/g, "") } };
    if (/\b(?:how\s+many|which|what|any|status|summary|overview)\b/.test(t)) return { toolId: "equipment.laptops", input: { ask: "summary" } };
    return null;
  }

  if (/\bcoshh\b/.test(t)) {
    const about = /\b(?:coshh\s+(?:sheet|entry|record)?\s*(?:for|on|about)|(?:sheet|entry|record)\s+for|is\s+there\s+(?:a\s+)?coshh\s+for)\s+(.+)$/.exec(t);
    if (about) return { toolId: "compliance.coshh", input: { query: about[1].trim() } };
    if (/\b(?:review|reviews|due|overdue|out\s+of\s+date|how\s+many|which|what|any|status)\b/.test(t)) return { toolId: "compliance.coshh", input: { query: "" } };
    return null;
  }

  if (/\bcertificates?\b|\bgas\s+safety\b|\beicr\b|\blegionella\b|\bfire\s+risk\s+assessment\b|\bloler\b|\bboiler\s+service\b|\bemergency\s+lighting\b|\bextinguishers?\b|\bfixed\s+wiring\b|\bliability\s+insurance\b/.test(t)) {
    const type = CERT_TYPES.find((c) => c.key !== "other" && (t.includes(c.label.toLowerCase().replace(/\s*\(.*\)/, "")) || (c.key === "eicr" && /\beicr\b|fixed\s+wiring/.test(t)) || (c.key === "gas_safety" && /\bgas\s+safety\b/.test(t)) || (c.key === "legionella_risk_assessment" && /\blegionella\b/.test(t)) || (c.key === "lift_loler" && /\bloler\b|\blift\b/.test(t)) || (c.key === "fire_extinguisher_service" && /\bextinguishers?\b/.test(t))));
    if (type) return { toolId: "compliance.certificates", input: { type: type.key } };
    if (/\b(?:expire|expired|expiring|expires|running\s+out|due|overdue|out\s+of\s+date|how\s+many|which|what|any|status)\b/.test(t)) return { toolId: "compliance.certificates", input: { type: "" } };
    return null;
  }

  if (/\b(?:clinical\s+)?waste\b|\bstericycle\b|\bsharps\s+(?:bin|collection)\b/.test(t) && /\b(?:collect|collected|collection|collections|last|next|when|how\s+much|how\s+many|weight|kg)\b/.test(t)) return { toolId: "waste.status", input: {} };

  // the whole practice's training (one's own is "my training")
  if (!mine && /\btraining\b|\bcourses?\b/.test(t) && /\b(?:who|which\s+(?:staff|people|members)|everyone|team|staff|practice)\b/.test(t) && /\b(?:overdue|out\s+of\s+date|expired|due|running\s+out|needs?|behind|expir)/.test(t)) {
    return { toolId: "training.overdue", input: { course: courseIn(t) } };
  }
  return null;
}

// ---- laptops ----
export function laptopsAnswer({ laptops = [], ask = "summary", query = "", today }) {
  const live = laptops.filter(isLive);
  if (!live.length) return { found: false, text: "There are no laptops on the IT equipment register yet." };
  const name = (l) => l.assetCode || "A laptop";
  if (ask === "who") {
    const q = String(query).toUpperCase().replace(/\s+/g, "");
    const hit = laptops.filter((l) => String(l.assetCode || "").toUpperCase().replace(/[\s]+/g, "") === q || String(l.assetCode || "").toUpperCase().replace(/[\s-]+/g, "").endsWith(q.replace(/-/g, "")));
    if (!hit.length) return { found: false, text: `I couldn't find a laptop with the code ${query.toUpperCase()}.` };
    if (hit.length > 1) return { found: true, text: `More than one laptop matches ${query.toUpperCase()}: ${hit.slice(0, 5).map(name).join(", ")}. Say the whole code.` };
    return { found: true, text: `${name(hit[0])}: ${holderText(hit[0])}.` };
  }
  if (ask === "loans") {
    const out = live.filter(isOnLoan);
    if (!out.length) return { found: true, count: 0, text: "No laptops are out on loan." };
    const late = out.filter((l) => loanState(l, today).state === "overdue");
    const lines = out.slice(0, 8).map((l) => `• ${name(l)}: ${holderText(l)}${loanState(l, today).state === "overdue" ? " (overdue back)" : ""}`);
    return { found: true, count: out.length, text: `${plural(out.length, "laptop")} on loan${late.length ? `, ${late.length} overdue back` : ""}:\n${lines.join("\n")}${more(out, 8)}` };
  }
  if (ask === "updates") {
    const states = live.map((l) => ({ l, s: updateState(l, today) })).filter((x) => x.s.state === "overdue" || x.s.state === "soon").sort((a, b) => a.s.days - b.s.days);
    if (!states.length) return { found: true, count: 0, text: "No laptop update is overdue or due in the next week." };
    const lines = states.slice(0, 8).map(({ l, s }) => `• ${name(l)} (${holderText(l)}): ${s.state === "overdue" ? `update was due ${Math.abs(s.days)} day${Math.abs(s.days) === 1 ? "" : "s"} ago` : s.days === 0 ? "update due today" : `update due in ${s.days} day${s.days === 1 ? "" : "s"}`}`);
    return { found: true, count: states.length, text: `${plural(states.length, "laptop")} ${states.length === 1 ? "needs" : "need"} an update soon:\n${lines.join("\n")}${more(states, 8)}` };
  }
  const late = live.filter((l) => updateState(l, today).state === "overdue").length;
  const loans = live.filter(isOnLoan).length;
  const lateLoans = live.filter((l) => loanState(l, today).state === "overdue").length;
  const spare = live.filter((l) => l.status === "spare").length;
  const parts = [`${plural(live.length, "laptop")} on the register: ${live.filter((l) => l.status === "in_use").length} in use, ${spare} spare, ${loans} on loan.`];
  if (late) parts.push(`${plural(late, "update")} overdue.`);
  if (lateLoans) parts.push(`${plural(lateLoans, "loan")} overdue back.`);
  if (!late && !lateLoans) parts.push("Nothing is overdue.");
  return { found: true, count: live.length, text: parts.join(" ") };
}

// ---- certificates ----
export function certificatesAnswer({ certificates = [], type = "", now = new Date() }) {
  const live = certificates.filter((c) => c.active !== false);
  if (!live.length) return { found: false, text: "No certificates are on the register yet." };
  if (type) {
    const rows = sortCertificates(live.filter((c) => c.type === type), now);
    const label = CERT_TYPES.find((c) => c.key === type)?.label || "That certificate";
    if (!rows.length) return { found: true, count: 0, text: `${label} isn't on the register.` };
    const lines = rows.slice(0, 6).map((c) => `• ${certLabel(c)}${c.site ? ` (${c.site})` : ""}: ${CERT_STATUS[certStatus(c, now)].toLowerCase()}${c.expiryDate ? `, ${expiryText(c, now).toLowerCase()} (${uk(c.expiryDate)})` : ""}${hasProblem(c) ? ", records a problem" : ""}`);
    return { found: true, count: rows.length, text: `${label}:\n${lines.join("\n")}${more(rows, 6)}` };
  }
  const s = certSummary(live, now);
  if (!s.needsAttention) return { found: true, count: 0, text: `All ${plural(s.total, "certificate")} on the register ${s.total === 1 ? "is" : "are"} in date.` };
  const needs = sortCertificates(live.filter((c) => certStatus(c, now) !== "ok" || hasProblem(c)), now);
  const lines = needs.slice(0, 8).map((c) => `• ${certLabel(c)}${c.site ? ` (${c.site})` : ""}: ${hasProblem(c) ? "records a problem" : expiryText(c, now).toLowerCase()}${c.expiryDate ? ` (${uk(c.expiryDate)})` : ""}`);
  return { found: true, count: needs.length, text: `${plural(s.needsAttention, "certificate")} of ${s.total} ${s.needsAttention === 1 ? "needs" : "need"} attention (${s.expired} expired or without a date, ${s.dueSoon} running out, ${s.problems} with a problem):\n${lines.join("\n")}${more(needs, 8)}` };
}

// ---- COSHH ----
export function coshhAnswer({ substances = [], query = "", now = new Date() }) {
  const active = substances.filter((s) => s.active !== false);
  if (!active.length) return { found: false, text: "The COSHH register is empty." };
  if (query) {
    const hit = sortSubstances(searchSubstances(active, query), now);
    if (!hit.length) return { found: true, count: 0, text: `I can't find “${query}” in the COSHH register. If the practice keeps it, it needs adding on the Compliance page.` };
    const lines = hit.slice(0, 6).map((s) => `• ${s.name}${s.location ? `, kept in ${s.location}${s.site ? ` (${s.site})` : ""}` : ""}: ${reviewText(s, now).toLowerCase()}${s.sdsUrl ? ", safety data sheet on file" : ", no safety data sheet uploaded"}`);
    return { found: true, count: hit.length, text: `${plural(hit.length, "match", "matches")} for “${query}”:\n${lines.join("\n")}${more(hit, 6)}` };
  }
  const s = reviewSummary(active, now);
  if (!s.needsAttention) return { found: true, count: 0, text: `All ${plural(s.total, "COSHH entry", "COSHH entries")} are in date for review.` };
  const needs = sortSubstances(active.filter((x) => reviewStatus(x, now) !== "ok"), now);
  const lines = needs.slice(0, 8).map((x) => `• ${x.name}: ${reviewText(x, now).toLowerCase()}`);
  return { found: true, count: needs.length, text: `${s.overdue} COSHH ${s.overdue === 1 ? "review is" : "reviews are"} overdue or have no date, ${s.dueSoon} due soon (of ${s.total}):\n${lines.join("\n")}${more(needs, 8)}` };
}

// ---- clinical waste ----
export function wasteAnswer({ consignments = [], now = new Date() }) {
  const s = wasteStats(consignments, now);
  if (!s.total || !s.last) return { found: false, text: "No clinical waste collections are saved yet." };
  const parts = [`The last collection was on ${uk(s.last.collectionDate)}${s.daysSinceLast === 0 ? " (today)" : `, ${plural(s.daysSinceLast, "day")} ago`}${s.last.totalKg ? `, ${s.last.totalKg} kg` : ""}.`];
  parts.push(`In the last year there ${s.collectionsLastYear === 1 ? "was" : "were"} ${plural(s.collectionsLastYear, "collection")}, ${s.kgLastYear} kg in all.`);
  if (s.longestGap > 60) parts.push(`The longest gap between collections was ${s.longestGap} days, which is worth a look.`);
  return { found: true, count: s.total, text: parts.join(" ") };
}

// ---- staff training, whole practice ----
export function trainingOverdueAnswer({ people = [], courses = [], records = [], course = "", now = new Date() }) {
  if (!people.length) return { found: false, text: "No staff training records are set up yet." };
  const live = courses.filter((c) => c.active !== false);
  let items = reminderItems({ people, courses: live, records, now });
  if (course) {
    const words = course.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    const matched = live.filter((c) => words.every((w) => c.name.toLowerCase().includes(w)));
    if (!matched.length) return { found: false, text: `I can't find a course called “${course}”. Check the name on the Staff training page.` };
    items = items.filter((i) => matched.some((c) => c.id === i.courseId));
  }
  if (!items.length) return { found: true, count: 0, text: course ? `Nobody is out of date or running out on that course.` : "Nobody is out of date or running out on any course." };
  const overdue = items.filter((i) => i.kind === "overdue");
  const soon = items.filter((i) => i.kind === "due-soon");
  const line = (i) => `• ${i.personName}: ${i.courseName}, ${i.kind === "overdue" ? "ran out" : "runs out"} ${uk(i.due)}`;
  const parts = [];
  if (overdue.length) parts.push(`Out of date (${overdue.length}):\n${overdue.slice(0, 8).map(line).join("\n")}${more(overdue, 8)}`);
  if (soon.length) parts.push(`Running out soon (${soon.length}):\n${soon.slice(0, 8).map(line).join("\n")}${more(soon, 8)}`);
  return { found: true, count: items.length, text: parts.join("\n\n") };
}

export { laptopDay };
