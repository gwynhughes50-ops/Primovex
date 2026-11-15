// Manager sign-offs for Ask Primovex: what is waiting for a line manager to sign off (timesheets), approve (mileage claims) or answer (payroll queries), and a card
// that signs off or approves them. Pure (no React, no Firestore): the lookups in readOnlyTools.js read what this login may see and hand it in. Nothing is changed until the
// person presses the button on the card, and the executor re-reads each one first, so a timesheet that was taken back in the meantime is left alone.
// Declining needs a reason the person will read, so it stays on the page.

import { CODES, STATE, periodLabel } from "../../modules/timesheets/timesheet.js";
import { STATUS as CLAIM, totalMiles } from "../../modules/mileage/mileage.js";
import { createProposal } from "../../orb/actionProposals.js";

const clean = (prompt) => String(prompt || "").toLowerCase().replace(/[’‘]/g, "'").trim().replace(/[?.!]+$/g, "");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const uk = (key) => (key ? String(key).split("-").reverse().join("/") : "");
const MAX_ITEMS = 40;
const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const miles1 = (n) => Math.round(Number(n || 0) * 10) / 10;

// ---- what was asked ----
// null when it is not about signing off. { toolId: "signoff.waiting" | "signoff.draft", input: { what: "timesheets" | "mileage" | "both", name, all } }
export function parseSignoff(prompt) {
  const raw = String(prompt || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().replace(/[?.!]+$/g, "");
  const t = clean(prompt);
  if (!t) return null;
  if (/\bhow\s+(?:do|to|can|should)\b|\bwhere\s+do\s+i\b|\bwhat\s+does\b/.test(t)) return null;
  if (/\b(?:reorder|stock|sar|concern|significant|leave|certificate|training|rota|swap)\b/.test(t)) return null;
  const about = /\b(?:timesheets?|time\s+sheets?)\b/.test(t) ? "timesheets" : /\b(?:mileage|claims?|journeys?|expenses?)\b/.test(t) ? "mileage" : "";
  const verb = /\b(?:sign\s*off|signoff|approv(?:e|al|ing))\b/.test(t);

  // doing it: "sign off all the timesheets", "approve Sarah's mileage", "sign off everything"
  const doing = /^(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:sign\s*off|approve)\b/.test(t);
  if (doing && (about || /\b(?:everything|all|them)\b/.test(t))) {
    const possessive = /\b(?:sign\s*off|approve)\s+(?:the\s+)?(.+?)'s\s+(?:timesheets?|time\s+sheets?|mileage|claims?|journeys?)\b/i.exec(raw);
    const forName = /\b(?:timesheets?|time\s+sheets?|mileage|claims?|journeys?)\s+(?:for|from|of)\s+(.+)$/i.exec(raw);
    const name = (possessive?.[1] || forName?.[1] || "").replace(/\b(?:please|today|now|too)\b/gi, "").trim();
    return { toolId: "signoff.draft", input: { what: about || "both", name, all: !name } };
  }
  // asking: "what is waiting for me to sign off?", "any timesheets to approve?", "who has sent me a timesheet?"
  if (verb && /\b(?:what|which|any(?:thing)?|how\s+many|who|do\s+i\s+have|have\s+i\s+got|is\s+there|are\s+there|waiting|outstanding|need|to\s+(?:sign|approve))\b/.test(t)) return { toolId: "signoff.waiting", input: { what: about || "both" } };
  if (/\b(?:waiting|outstanding|pending)\b.*\b(?:for\s+me|my\s+approval|my\s+sign\s*off)\b/.test(t) || /\b(?:for\s+me\s+to\s+(?:sign|approve)|needs?\s+my\s+(?:approval|sign\s*off))\b/.test(t)) return { toolId: "signoff.waiting", input: { what: about || "both" } };
  if (/\bwho\s+has\s+(?:sent|submitted)\s+(?:me\s+)?(?:a\s+)?(?:timesheet|mileage|claim)/.test(t)) return { toolId: "signoff.waiting", input: { what: about || "both" } };
  return null;
}

// ---- who it is waiting for ----
const mineToDecide = (row, uid, canManage) => row && row.uid !== uid && (row.managerUid === uid || (!row.managerUid && canManage));

export function waitingSheets({ sheets = [], uid = "", canManage = false }) {
  return sheets.filter((t) => t.state === STATE.submitted && mineToDecide(t, uid, canManage));
}
export function waitingClaims({ claims = [], uid = "", canManage = false }) {
  return claims.filter((c) => c.status === CLAIM.submitted && mineToDecide(c, uid, canManage));
}

const changedWords = (sheet) => {
  const parts = CODES.filter((c) => sheet.totals?.[c.code]).map((c) => `${c.label.toLowerCase()} ${sheet.totals[c.code]}h`);
  return parts.length ? parts.join(", ") : "something different from usual";
};
const periodName = (periods, sheet) => {
  const period = periods.find((p) => p.id === sheet.periodId) || (sheet.from && sheet.to ? { from: sheet.from, to: sheet.to, name: "" } : null);
  return period ? periodLabel(period) : "this pay period";
};

// ---- the answer to "what is waiting?" ----
export function signoffAnswer({ sheets = [], claims = [], periods = [], queries = [], uid = "", canManage = false, what = "both" }) {
  const waitS = what === "mileage" ? [] : waitingSheets({ sheets, uid, canManage });
  const waitC = what === "timesheets" ? [] : waitingClaims({ claims, uid, canManage });
  const open = what === "both" ? queries.filter((q) => q.status === "open") : [];
  const parts = [];
  const asManager = (sheets.some((t) => t.managerUid === uid) || claims.some((c) => c.managerUid === uid)) || canManage;

  if (waitS.length) {
    const same = waitS.filter((t) => t.kind === "no-change");
    const changed = waitS.filter((t) => t.kind !== "no-change");
    const lines = [`Timesheets to sign off (${waitS.length}):`];
    if (same.length) lines.push(`• ${plural(same.length, "person", "people")} said their hours were as normal: ${same.slice(0, 8).map((t) => t.staffName).join(", ")}${same.length > 8 ? ` and ${same.length - 8} more` : ""}`);
    for (const t of changed.slice(0, 8)) lines.push(`• ${t.staffName}: ${changedWords(t)} (${periodName(periods, t)})`);
    if (changed.length > 8) lines.push(`• and ${changed.length - 8} more with changes`);
    parts.push(lines.join("\n"));
  }
  if (waitC.length) {
    const miles = miles1(waitC.reduce((n, c) => n + totalMiles(c), 0));
    const lines = [`Mileage claims to approve (${waitC.length}, ${miles} ${miles === 1 ? "mile" : "miles"} in all):`];
    for (const c of waitC.slice(0, 8)) lines.push(`• ${c.staffName}: ${uk(c.date)}, ${c.fromName || "?"} to ${c.toName || "?"}${c.returnTrip ? " and back" : ""}, ${miles1(totalMiles(c))} miles`);
    if (waitC.length > 8) lines.push(`• and ${waitC.length - 8} more`);
    parts.push(lines.join("\n"));
  }
  if (open.length) parts.push(`Payroll queries waiting for your answer: ${open.length}. Open them under To sign off on the Timesheet page.`);

  if (!parts.length) {
    const nothing = what === "timesheets" ? "No timesheets are waiting for you to sign off." : what === "mileage" ? "No mileage claims are waiting for you to approve." : "Nothing is waiting for you to sign off or approve.";
    return { found: true, count: 0, text: asManager ? nothing : `${nothing} Nobody has you down as their line manager, so nothing comes to you.` };
  }
  const tips = [];
  if (waitS.length) tips.push(`say “sign off the timesheets” and I'll prepare a card for the ${waitS.filter((t) => t.kind === "no-change").length ? "ones with usual hours" : "them"}`);
  if (waitC.length) tips.push("say “approve the mileage” for a card");
  return { found: true, count: waitS.length + waitC.length + open.length, sheets: waitS.length, claims: waitC.length, queries: open.length, text: `${parts.join("\n\n")}${tips.length ? `\n\nTo deal with them: ${tips.join(", or ")}. Nothing changes until you press the button on the card.` : ""}` };
}

// ---- finding a named person among those waiting ----
function matchPeople(name, rows) {
  const n = norm(name);
  if (!n) return [];
  const words = n.split(" ").filter(Boolean);
  const people = new Map();
  for (const r of rows) people.set(r.staffName, r);
  const names = [...people.keys()];
  const exact = names.filter((p) => norm(p) === n);
  if (exact.length) return exact;
  return names.filter((p) => { const pw = norm(p).split(" "); return words.every((w) => pw.includes(w) || pw.some((x) => x.startsWith(w) && w.length > 2)); });
}

// ---- the card that signs off or approves ----
export function signoffReply({ what = "both", name = "", all = true, sheets = [], claims = [], periods = [], uid = "", canManage = false }) {
  if (what === "both") {
    const s = waitingSheets({ sheets, uid, canManage }).length;
    const c = waitingClaims({ claims, uid, canManage }).length;
    if (!s && !c) return { text: "Nothing is waiting for you to sign off or approve." };
    return { text: `Which do you mean? ${s ? `${plural(s, "timesheet")} waiting` : ""}${s && c ? " and " : ""}${c ? `${plural(c, "mileage claim")} waiting` : ""}. Say “sign off the timesheets” or “approve the mileage”.`, followUps: [...(s ? [{ label: "Sign off the timesheets", ask: "sign off the timesheets", color: "#0ea5e9" }] : []), ...(c ? [{ label: "Approve the mileage", ask: "approve the mileage", color: "#0ea5e9" }] : [])] };
  }

  if (what === "timesheets") {
    let rows = waitingSheets({ sheets, uid, canManage });
    if (!rows.length) return { text: "No timesheets are waiting for you to sign off." };
    let leftForPage = 0;
    if (name) {
      const found = matchPeople(name, rows);
      if (!found.length) return { text: `I can't see a timesheet from “${name}” waiting for you. ${plural(rows.length, "timesheet")} ${rows.length === 1 ? "is" : "are"} waiting, from ${[...new Set(rows.map((t) => t.staffName))].slice(0, 6).join(", ")}.` };
      if (found.length > 1) return { text: `More than one person matches “${name}”: ${found.slice(0, 5).join(", ")}. Say the full name.` };
      rows = rows.filter((t) => t.staffName === found[0]);
    } else {
      // "all" signs off only those who said their hours were as normal. Anything that was different is looked at on the page, as it is there.
      const same = rows.filter((t) => t.kind === "no-change");
      leftForPage = rows.length - same.length;
      rows = same;
      if (!rows.length) return { text: `${plural(leftForPage, "timesheet")} ${leftForPage === 1 ? "has" : "have"} something different from usual, so I won't sign ${leftForPage === 1 ? "it" : "them"} off in one go. Check ${leftForPage === 1 ? "it" : "them"} under To sign off on the Timesheet page, or name the person (“sign off Sarah's timesheet”).` };
    }
    const items = rows.slice(0, MAX_ITEMS).map((t) => ({ id: t.id, staffName: t.staffName, period: periodName(periods, t) }));
    const lines = items.map((i) => {
      const sheet = rows.find((t) => t.id === i.id);
      return `${i.staffName}, ${i.period}: ${sheet.kind === "no-change" ? "hours as normal" : `different from usual (${changedWords(sheet)})`}`;
    });
    if (rows.length > items.length) lines.push(`…and ${rows.length - items.length} more, which I'll leave for the next time`);
    const proposal = createProposal({
      kind: "timesheet-signoff", title: `Sign off ${plural(items.length, "timesheet")}`, lines,
      requiredCapability: null, confirmLabel: `Sign off ${items.length}`, params: { items },
    });
    return { proposal, text: `I'll sign off ${plural(items.length, "timesheet")} once you confirm. Nothing has been signed off yet.${leftForPage ? ` ${plural(leftForPage, "other")} had something different from usual, so ${leftForPage === 1 ? "that one is" : "those are"} left for you to check on the Timesheet page.` : ""}` };
  }

  // mileage
  let rows = waitingClaims({ claims, uid, canManage });
  if (!rows.length) return { text: "No mileage claims are waiting for you to approve." };
  if (name) {
    const found = matchPeople(name, rows);
    if (!found.length) return { text: `I can't see a mileage claim from “${name}” waiting for you. ${plural(rows.length, "claim")} ${rows.length === 1 ? "is" : "are"} waiting, from ${[...new Set(rows.map((c) => c.staffName))].slice(0, 6).join(", ")}.` };
    if (found.length > 1) return { text: `More than one person matches “${name}”: ${found.slice(0, 5).join(", ")}. Say the full name.` };
    rows = rows.filter((c) => c.staffName === found[0]);
  }
  const items = rows.slice(0, MAX_ITEMS).map((c) => ({ id: c.id, staffName: c.staffName, date: c.date, miles: miles1(totalMiles(c)), route: `${c.fromName || "?"} to ${c.toName || "?"}${c.returnTrip ? " and back" : ""}` }));
  const lines = items.map((i) => `${i.staffName}, ${uk(i.date)}: ${i.route}, ${i.miles} miles`);
  if (rows.length > items.length) lines.push(`…and ${rows.length - items.length} more, which I'll leave for the next time`);
  const proposal = createProposal({
    kind: "mileage-approve", title: `Approve ${plural(items.length, "mileage claim")}`, lines,
    requiredCapability: null, confirmLabel: `Approve ${items.length}`, params: { items },
  });
  return { proposal, text: `I'll approve ${plural(items.length, "mileage claim")} once you confirm. Nothing has been approved yet. To turn one down, do it on the Mileage page, where you can give a reason.` };
}

// What one confirm does, one at a time: re-read it, leave alone anything that is no longer waiting, and say what happened.
export async function runDecisions(items, { read, decide, waiting }) {
  const done = []; const skipped = []; const failed = [];
  for (const item of items) {
    try {
      const now = await read(item);
      if (!now || !waiting(now)) { skipped.push(item); continue; }
      await decide(item, now);
      done.push(item);
    } catch (error) { failed.push({ item, message: error?.message || "That did not save." }); }
  }
  return { done, skipped, failed };
}

export function decisionSummary({ done, skipped, failed }, { one, many, did }) {
  const parts = [];
  if (done.length) parts.push(`${did} ${done.length} ${done.length === 1 ? one : many}.`);
  if (skipped.length) parts.push(`${skipped.length} ${skipped.length === 1 ? "was" : "were"} no longer waiting (taken back or already dealt with), so I left ${skipped.length === 1 ? "it" : "them"} alone.`);
  if (failed.length) parts.push(`${failed.length} didn't save: ${failed[0].message}`);
  return parts.join(" ") || "Nothing was waiting.";
}
