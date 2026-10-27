// "No action needed" (NFW) letters: what a person says when ClinFlow suggests one and it is wrong, which Docman folder a confirmed letter belongs in, which confirmed
// letters a clinician double-checks, and how well the suggestions are doing. Pure: nothing here reads the screen, the disk or the network.

// Why a suggested "no action needed" letter does need action. A picked reason is data ClinFlow can count; the optional note is for the person reviewing the rules.
export const NFW_WRONG_REASONS = [
  ["asks", "The letter asks something of the practice"],
  ["medicine", "A medicine needs changing or checking"],
  ["record", "A diagnosis, result or allergy needs recording"],
  ["awaited", "A result or follow-up is still awaited"],
  ["patient", "The patient needs contacting or booking in"],
  ["wrong", "It is not for this practice, or it is the wrong patient"],
  ["other", "Something else"],
];
export const NFW_REASON_WORDS = Object.fromEntries(NFW_WRONG_REASONS);

export const FOLDER_KINDS = ["nfw", "action"];
export const FOLDER_WORDS = { nfw: "NFW (no action needed)", action: "Action needed" };

// Which Docman upload folder a letter goes in. Only a letter a person has confirmed has one: a suggestion alone does not decide where it is filed.
export function folderKindFor(review) {
  if (review?.status !== "human_confirmed") return null;
  return review.confirmedDecision === "no_workflow" ? "nfw" : "action";
}

// A file name that says which folder it belongs in, for when the PDF is downloaded rather than saved straight into the folder.
export function docmanFileName(kind, fileName) {
  const base = String(fileName || "letter.pdf").replace(/[\\/:*?"<>|]+/g, "_").replace(/\.pdf$/i, "").trim() || "letter";
  return `${kind === "nfw" ? "NFW" : "ACTION"} - ${base}.pdf`;
}

// The letter's own sentences, for the person to tick the ones that need action. Short fragments and the address block are left out.
export function pickableSentences(content, limit = 14) {
  const seen = new Set();
  // a short line that does not end a sentence (the greeting, "Re: Mr Hall") stands alone; a long line is just a wrapped paragraph and is joined to the next
  const lines = String(content || "").split(/\r?\n/).map((line) => line.trim());
  const flowed = lines.map((line, i) => (i < lines.length - 1 && line.length > 0 && line.length < 50 && !/[.!?,;:]$/.test(line) ? "\u0001" : line)).join("\n");
  return flowed.replace(/\s*\n\s*/g, " ").split(/\u0001|(?<=[.!?:])\s+/).map((s) => s.trim())
    .filter((s) => s.length >= 18 && s.length <= 220 && s.split(/\s+/).length >= 4 && /[a-z]{3,}/i.test(s) && !/^(dear|yours|re:|date:)/i.test(s))
    .filter((s) => { const key = s.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, limit);
}

// One in every SPOT_CHECK_EVERY confirmed no-action letters is checked by a clinician, and always one ClinFlow itself was only "possibly" sure of. The choice is made from
// the letter's id, so it is the same every time it is asked and cannot be dodged by clicking again.
export const SPOT_CHECK_EVERY = 10;
export function needsSpotCheck({ id, category } = {}) {
  if (/^possible/i.test(String(category || ""))) return true;
  let hash = 5381;
  for (const ch of String(id || "")) hash = ((hash * 33) ^ ch.charCodeAt(0)) >>> 0;
  return hash % SPOT_CHECK_EVERY === 0;
}

// Who may do the check: a different person from the one who confirmed the letter.
export function canSpotCheck({ checkerUid, confirmedByUid } = {}) {
  return Boolean(checkerUid) && checkerUid !== confirmedByUid;
}

// How the "no action needed" suggestions are doing, from the saved confirmations and clinician checks.
export function nfwStats(teaching = []) {
  const suggested = teaching.filter((r) => r.suggestedDecision === "no_workflow" && r.source !== "spot_check");
  const right = suggested.filter((r) => r.confirmedDecision === "no_workflow");
  const wrong = suggested.filter((r) => r.confirmedDecision !== "no_workflow");
  const checks = teaching.filter((r) => r.source === "spot_check");
  const checkedAgreed = checks.filter((r) => r.confirmedDecision === "no_workflow");
  const checkedDisagreed = checks.filter((r) => r.confirmedDecision !== "no_workflow");
  const reasons = {};
  [...wrong, ...checkedDisagreed].forEach((r) => { const key = r.reasonCode || "other"; reasons[key] = (reasons[key] || 0) + 1; });
  const words = new Map();
  [...wrong, ...checkedDisagreed].forEach((r) => (r.reasonSentences || []).forEach((s) => words.set(s, (words.get(s) || 0) + 1)));
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
  return {
    suggested: suggested.length, right: right.length, wrong: wrong.length, rightPct: pct(right.length, suggested.length),
    checked: checks.length, checkedAgreed: checkedAgreed.length, checkedDisagreed: checkedDisagreed.length, checkedPct: pct(checkedAgreed.length, checks.length),
    reasons: NFW_WRONG_REASONS.map(([code, label]) => ({ code, label, count: reasons[code] || 0 })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count),
    missedWording: [...words.entries()].map(([sentence, count]) => ({ sentence, count })).sort((a, b) => b.count - a.count).slice(0, 10),
  };
}
