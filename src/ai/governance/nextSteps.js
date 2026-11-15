// "What do I do next?" for a concern or a SAR, worked out from where the case has got to. Written rules, no AI: the same deadlines, stages, checklist and outside-party
// steps the case screens already use. Pure (no React, no Firestore): the lookups in readOnlyTools.js read the case and hand it in. It only reads, so there is no card.
// It names references and staff, never patients.

import { reviewStatus, ukDay } from "../../modules/governance/concernCase.js";

const clean = (prompt) => String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?.!]+$/g, "");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const friendly = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());

// a Firestore timestamp, a Date or a date string -> "yyyy-mm-dd", or ""
export function dayOf(value) {
  if (!value) return "";
  const d = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- what was asked ----
// null when it is not this. Otherwise { toolId: "governance.nextSteps", input: { kind: "concern" | "sar", reference, mine } }
export function parseNextSteps(prompt) {
  const t = clean(prompt);
  if (!t) return null;
  if (/\bhow\s+(?:do|to|can|should)\b|\bwhere\s+do\s+i\b/.test(t)) return null;
  // "which concern is the most urgent?", "what should I deal with first on the SARs?": the whole practice, closest deadline first
  const urgent = /\b(?:most\s+urgent|more\s+urgent|closest\s+to\s+(?:the\s+|its\s+|their\s+)?deadline|nearest\s+(?:the\s+)?deadline|deal\s+with\s+first|prioriti[sz]e|top\s+priority|needs?\s+dealing\s+with\s+first)\b/.test(t);
  const caseKind = /\bsars?\b|\bsubject\s+access\b/.test(t) ? "sar" : /\b(?:concerns?|complaints?)\b/.test(t) ? "concern" : "";
  if (urgent && caseKind && !/\b(?:cn|sar)-\d{4}-\d+\b/i.test(t)) return { toolId: "governance.nextSteps", input: { kind: caseKind, reference: "", mine: false, practice: true } };
  const asking = /\b(?:what(?:'s|\s+is|\s+do\s+i|\s+should\s+i|\s+needs?)|next\s+steps?|next\s+action|what\s+now|where\s+(?:are\s+we|am\s+i)\s+up\s+to|what\s+is\s+left|left\s+to\s+do|to\s+do)\b/.test(t) && /\b(?:next|do|left|todo|to\s+do|needs\s+doing|up\s+to)\b/.test(t);
  if (!asking) return null;
  const ref = /\b(cn|sar)-\d{4}-\d+\b/i.exec(t);
  if (ref) return { toolId: "governance.nextSteps", input: { kind: ref[1].toLowerCase() === "sar" ? "sar" : "concern", reference: ref[0].toUpperCase(), mine: false } };
  const mine = /\b(?:my|i\s+have|i\s+own|assigned\s+to\s+me|i'm\s+dealing|i\s+am\s+dealing)\b/.test(t);
  const kind = /\bsars?\b|\bsubject\s+access\b/.test(t) ? "sar" : /\b(?:concerns?|complaints?)\b/.test(t) ? "concern" : "";
  if (kind && mine) return { toolId: "governance.nextSteps", input: { kind, reference: "", mine: true } };
  return null;
}

// ---- a concern ----
const OPEN_STAGE_HELP = {
  received: "Acknowledge it, then offer a listening discussion.",
  acknowledged: "Offer the person a listening discussion and decide how to deal with it.",
  listening: "Hold the listening discussion and record what they want to happen.",
  early_resolution: "Try to settle it early, and record the outcome. If it cannot be settled, move it to investigation.",
  investigation: "Finish the investigation, then move it on to the response.",
  response: "Prepare the final response and send it once everyone involved has accepted it.",
  learning: "Record what the practice has learned, then close the case.",
};

export function concernNext({ concern = {}, steps = [], deadline = null, now = new Date() }) {
  const ref = concern.reference || "This concern";
  if (["closed", "archived"].includes(concern.status)) return { found: true, done: true, text: `${ref} is closed. There is nothing left to do on it.` };
  const todo = [];
  const owner = concern.ownerName && concern.ownerName !== "Unassigned" ? concern.ownerName : "";
  if (!concern.ownerUid && !owner) todo.push("Nobody owns it yet: pass it to someone (Update, then Pass it to someone else).");
  if (!concern.acknowledgedAt) {
    const due = dayOf(concern.acknowledgementDueAt);
    todo.push(`Acknowledge it${due ? ` (due ${ukDay(due)})` : ""}: Update, then We spoke or wrote to them.`);
  }
  if (!concern.listeningDiscussionOfferedAt) todo.push("Offer a listening discussion: it hasn't been recorded yet.");
  const review = reviewStatus(concern, steps, now);
  for (const blocker of review.blockers.slice(0, 3)) todo.push(`Outside parties, ${blocker.replace(/^(.)/, (c) => c.toLowerCase())}`);
  if (!todo.length || (concern.status === "response" && review.ready)) {
    if (concern.status === "response") todo.push(review.parties.length ? "Everyone involved has accepted it, so the final response letter can go: Update, then The final response letter is ready to send." : "Send the final response, then record it.");
    else if (OPEN_STAGE_HELP[concern.status]) todo.push(OPEN_STAGE_HELP[concern.status]);
  } else if (OPEN_STAGE_HELP[concern.status] && concern.status !== "response") todo.push(OPEN_STAGE_HELP[concern.status]);
  if (concern.learningRequired && !concern.learningRecordedAt && ["response", "learning"].includes(concern.status)) todo.push("Record the learning before closing it.");

  const head = `${ref}: ${friendly(concern.status)}${owner ? `, owned by ${owner}` : ""}.${deadline?.label ? ` ${deadline.label}.` : ""}`;
  const urgent = deadline && deadline.status === "critical" ? "It is past a deadline, so deal with that first. " : "";
  const shown = todo.slice(0, 4);
  return { found: true, done: false, status: concern.status, text: `${head}\n\n${urgent}Next:\n${shown.map((s, i) => `${i + 1}. ${s}`).join("\n")}${todo.length > shown.length ? `\n…and ${plural(todo.length - shown.length, "more step")} after those.` : ""}\n\nOpen the case and press Update to record any of this, or Close when it is finished.` };
}

// ---- a SAR ----
export function sarNext({ sar = {}, checklist = [], deadline = null }) {
  const ref = sar.reference || "This SAR";
  const label = (status) => ({ new: "New", assigned: "Assigned", in_progress: "In progress", quality_check: "Quality check", completed: "Completed", archived: "Archived" }[status] || friendly(status));
  if (["completed", "archived"].includes(sar.status)) return { found: true, done: true, text: `${ref} is ${label(sar.status).toLowerCase()}. There is nothing left to do on it.` };
  const assigned = sar.assignedToName && sar.assignedToName !== "Unassigned" ? sar.assignedToName : "";
  const ticks = sar.checklist || {};
  const left = checklist.filter((item) => !ticks[item.key]);
  const todo = [];
  if (!sar.assignedToUid && !assigned) todo.push("Assign it to someone: nobody is dealing with it yet.");
  if (left.length) {
    todo.push(`Next on the checklist: ${left[0].label.toLowerCase()}.`);
    if (left.length > 1) todo.push(`After that: ${left.slice(1).map((item) => item.label.toLowerCase()).join(", then ")}.`);
  } else if (checklist.length) todo.push("Every checklist item is done: mark the SAR as completed.");
  const head = `${ref}: ${label(sar.status)}${assigned ? `, assigned to ${assigned}` : ""}.${deadline?.label ? ` ${deadline.label}.` : ""}`;
  const urgent = deadline && ["critical", "high"].includes(deadline.status) ? "The due date is very close or has passed, so this needs doing first. " : "";
  return { found: true, done: false, status: sar.status, text: `${head}\n\n${urgent}Next:\n${todo.map((s, i) => `${i + 1}. ${s}`).join("\n")}${checklist.length ? `\n\nChecklist: ${checklist.length - left.length} of ${checklist.length} done.` : ""}` };
}

// ---- a list of cases: closest deadline first ----
//   scope "mine": the ones this person owns (or, for a concern, is named on); `closed` is how many of theirs are finished; `others` are open cases that are not theirs,
//   and any that are more urgent than their most urgent one are named after the list, so a closer deadline held by someone else is never hidden.
//   scope "practice": every open case, with who has it.
//   keyOf(c) is a number that sorts the most urgent first; ownerOf(c) is who has it, in words.
const NL = "\n";
export function myCasesNext({ kind, cases = [], deadlineOf = () => null, checklist = [], steps = {}, now = new Date(), scope = "mine", keyOf = null, ownerOf = () => "", others = [], closed = 0 }) {
  const isOpen = (c) => !["closed", "archived", "completed"].includes(c.status);
  const open = cases.filter(isOpen);
  const noun = kind === "sar" ? "SAR" : "concern";
  const holder = kind === "sar" ? "assigned to" : "owned by";
  const rank = (s) => ({ critical: 0, high: 1, warning: 2, info: 3 }[s] ?? 4);
  const key = keyOf || ((c) => rank(deadlineOf(c)?.status));
  const sorted = open.map((c) => ({ c, d: deadlineOf(c), k: key(c) })).sort((a, b) => a.k - b.k);
  const line = ({ c, d }) => {
    const first = kind === "sar" ? sarNext({ sar: c, checklist, deadline: d }) : concernNext({ concern: c, steps: steps[c.id] || [], deadline: d, now });
    const action = /Next:\n1\. (.+)/.exec(first.text)?.[1] || "Open it to see";
    const who = scope === "practice" && ownerOf(c) ? `, ${holder} ${ownerOf(c)}` : "";
    return `• ${c.reference}${d?.label ? ` (${d.label})` : ""}${who}: ${action}`;
  };
  const parts = [];
  const shown = sorted.slice(0, 8).map(line);
  const head = scope === "practice" ? `${plural(open.length, `open ${noun}`)} across the practice, most urgent first` : `${plural(open.length, `open ${noun}`)} ${open.length === 1 ? "is" : "are"} yours, most urgent first`;
  if (open.length) parts.push(`${head}:${NL}${shown.join(NL)}${open.length > 8 ? `${NL}…and ${open.length - 8} more.` : ""}`);
  else if (scope === "mine") parts.push(`You have no open ${noun}s to deal with.`);
  else parts.push(`There are no open ${noun}s.`);
  if (scope === "mine" && closed) parts.push(`${plural(closed, `${open.length ? "other " : ""}${noun}`)} of yours ${closed === 1 ? "is" : "are"} already closed.`);
  if (scope === "mine") {
    const topMine = sorted.length ? sorted[0].k : Infinity;
    const closer = others.filter(isOpen).map((c) => ({ c, d: deadlineOf(c), k: key(c) })).filter((x) => x.k < topMine).sort((a, b) => a.k - b.k).slice(0, 3);
    if (closer.length) parts.push(`${open.length ? "More urgent" : "Closest to a deadline"} across the practice, but not yours:${NL}${closer.map(({ c, d }) => `• ${c.reference}${d?.label ? ` (${d.label})` : ""}${ownerOf(c) ? `, ${holder} ${ownerOf(c)}` : ""}`).join(NL)}`);
  }
  if (sorted.length) parts.push(`Ask “what's next for ${sorted[0].c.reference}” to see all the steps on one.`);
  else if (scope === "mine" && others.some(isOpen)) parts.push(`Ask “which ${noun}s are most urgent” to see them all.`);
  return { found: true, count: open.length, text: parts.join(NL + NL) };
}
