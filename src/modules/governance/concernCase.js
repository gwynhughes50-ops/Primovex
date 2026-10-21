// A concern between "received" and "closed": the steps that go back and forth with other people, and what has to be true before
// a case can be closed. Pure (no Firestore, no screens), so it can be tested. The screens are the two wizards in
// components/ConcernWizards.jsx: "Update this case", usable at any time, and "Close this case".
//
// A case often goes to our indemnity insurer, and to GMPI (or NHS Resolution in England), more than once: we send the draft, they
// come back wanting changes, we send it again, until they accept. Each of those is a step with a date and a note. What state each
// party is in is worked out from its steps, never typed.

export const PARTIES = [
  { key: "indemnity", label: "Our indemnity insurer", short: "Indemnity insurer" },
  { key: "gmpi", label: "GMPI (NHS Resolution in England)", short: "GMPI" },
  { key: "solicitor", label: "The solicitor", short: "Solicitor" },
];
export const partyOf = (key) => PARTIES.find((p) => p.key === key) || null;

// what happened with a party
export const STEP_ACTIONS = {
  sent: "We sent it to them",
  changes: "They want changes",
  info: "They need more information",
  accepted: "They accepted it",
  instructed: "They instructed a solicitor",
};
// what was sent
export const SENT_WHAT = [
  { key: "draft_response", label: "The draft final response letter" },
  { key: "our_reply", label: "Our reply to what they asked for" },
  { key: "documents", label: "Records or documents" },
  { key: "other", label: "Something else" },
];
// who asked for a meeting, and what else the patient may ask for
export const ASKED_BY = [
  { key: "patient", label: "The patient" },
  { key: "representative", label: "Their relative or representative" },
  { key: "solicitor", label: "Their solicitor" },
];
export const ASKED_FOR = [
  { key: "more_time", label: "More time" },
  { key: "records", label: "A copy of their records" },
  { key: "someone_else", label: "Someone else to deal with it" },
  { key: "other", label: "Something else" },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const ukDay = (key) => (DATE.test(String(key || "")) ? key.split("-").reverse().join("/") : "");
const dayNumber = (key) => { const [y, m, d] = String(key).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const daysBetween = (fromKey, toKey) => dayNumber(toKey) - dayNumber(fromKey);

// ---- the steps ----

const text = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// The record of one step. Throws a sentence for the person when it cannot be recorded.
export function buildStep({ party, action, occurredOn, what = "", note = "", round, now = new Date() } = {}) {
  if (!partyOf(party)) throw new Error("Choose who it was with.");
  if (!STEP_ACTIONS[action]) throw new Error("Say what happened.");
  if (action === "instructed" && party !== "gmpi") throw new Error("Only GMPI instructs a solicitor.");
  if (!DATE.test(String(occurredOn || ""))) throw new Error("Give the date it happened.");
  if (occurredOn > dayKey(now)) throw new Error("That date is in the future.");
  if (action === "sent" && what && !SENT_WHAT.some((w) => w.key === what)) throw new Error("Choose what was sent.");
  if ((action === "changes" || action === "info") && !text(note, 600)) throw new Error(action === "changes" ? "Say what changes they want." : "Say what more information they need.");
  return { party, action, occurredOn, what: action === "sent" ? what : "", note: text(note, 600), round: Number.isFinite(round) ? round : null };
}

// oldest first (steps made the same day keep the order they were recorded in)
export function orderedSteps(steps = []) {
  const created = (s) => (s.createdAt?.toDate ? s.createdAt.toDate().getTime() : Number(s.createdAtMs) || 0);
  return [...steps].sort((a, b) => String(a.occurredOn || "").localeCompare(String(b.occurredOn || "")) || created(a) - created(b));
}

// how many times it has been sent to this party so far
export const sentCount = (steps = [], party) => steps.filter((s) => s.party === party && s.action === "sent").length;

// Where one party has got to. state: "none" (nothing yet), "with-them" (we sent it, waiting for a reply), "back-to-us" (they came
// back wanting changes or more information), "accepted".
export function partyState(steps = [], party, now = new Date()) {
  const mine = orderedSteps(steps.filter((s) => s.party === party));
  const instructed = mine.some((s) => s.action === "instructed");
  const flow = mine.filter((s) => s.action !== "instructed");
  const last = flow.at(-1) || null;
  const rounds = flow.filter((s) => s.action === "sent").length;
  const state = !last ? "none" : last.action === "sent" ? "with-them" : last.action === "accepted" ? "accepted" : "back-to-us";
  return {
    party, state, rounds, instructed,
    lastOn: last?.occurredOn || "",
    lastAction: last?.action || "",
    lastNote: last?.note || "",
    waitingDays: state === "with-them" ? Math.max(0, daysBetween(last.occurredOn, dayKey(now))) : 0,
  };
}

// Is a party part of this case: it has steps, or the case says it is (the indemnity flag, a GMPI reference). The solicitor is
// part of it once GMPI has instructed one, or it has steps of its own.
export function involvedParties(concern = {}, steps = []) {
  const has = (key) => steps.some((s) => s.party === key);
  return PARTIES.filter((p) => has(p.key)
    || (p.key === "indemnity" && concern.mddusRequired === true)
    || (p.key === "gmpi" && Boolean(text(concern.gmpiReference, 80)))
    || (p.key === "solicitor" && steps.some((s) => s.party === "gmpi" && s.action === "instructed"))).map((p) => p.key);
}

// What the case looks like to someone about to send the final response.
//   parties:  each involved party with its state
//   ready:    every involved party has accepted (or none is involved)
//   blockers: in words, what is still outstanding
export function reviewStatus(concern = {}, steps = [], now = new Date()) {
  const parties = involvedParties(concern, steps).map((key) => ({ ...partyState(steps, key, now), ...partyOf(key) }));
  const blockers = [];
  for (const p of parties) {
    if (p.state === "accepted") continue;
    if (p.state === "none") blockers.push(`${p.short}: nothing sent yet.`);
    else if (p.state === "with-them") blockers.push(`${p.short}: waiting for a reply since ${ukDay(p.lastOn)}${p.rounds > 1 ? ` (sent ${p.rounds} times)` : ""}.`);
    else blockers.push(`${p.short}: they came back${p.lastAction === "changes" ? " wanting changes" : " needing more information"}, so it is back with us.`);
  }
  return { parties, ready: blockers.length === 0, blockers };
}

// ---- what to offer ----

// The things a person may want to do, most useful first, given where the case is.
//   key: "asked_meeting" | "asked_other" | "contacted" | "sent:<party>" | "reply:<party>" | "gmpi_instructed" | "letter_ready"
//        | "extend" | "owner" | "share" | "note" | "stage"
export function updateChoices(concern = {}, steps = [], now = new Date()) {
  const review = reviewStatus(concern, steps, now);
  const state = (key) => review.parties.find((p) => p.key === key)?.state || "none";
  const choices = [];
  for (const p of PARTIES) {
    const involved = review.parties.some((x) => x.key === p.key) || p.key !== "solicitor";
    if (!involved) continue;
    const s = state(p.key);
    if (s === "with-them") choices.push({ key: `reply:${p.key}`, group: p.short, label: `${p.short} replied`, hint: "They accepted it, want changes, or need more information", urgent: true });
    choices.push({ key: `sent:${p.key}`, group: p.short, label: s === "none" ? `We sent it to ${p.short}` : `We sent it to ${p.short} again`, hint: s === "back-to-us" ? "After making the changes they asked for" : "The letter, a reply or documents", urgent: s === "back-to-us" });
    if (p.key === "gmpi" && !review.parties.find((x) => x.key === "gmpi")?.instructed) choices.push({ key: "gmpi_instructed", group: p.short, label: "GMPI instructed a solicitor", hint: "Or the equivalent in England" });
  }
  choices.push(
    { key: "asked_meeting", group: "The patient", label: "They asked for a face-to-face meeting", hint: "Records the request on the case" },
    { key: "asked_other", group: "The patient", label: "They asked for something else", hint: "More time, their records, someone else to deal with it" },
    { key: "contacted", group: "The patient", label: "We spoke or wrote to them", hint: "A letter, email, phone call or meeting" },
    { key: "letter_ready", group: "The case", label: "The final response letter is ready to send", hint: review.ready ? "Everyone involved has accepted it" : "Outside parties have not all accepted yet" },
    { key: "extend", group: "The case", label: "We need more time", hint: "Move the final response deadline" },
    { key: "owner", group: "The case", label: "Pass it to someone else", hint: "Change who deals with it" },
    { key: "share", group: "The case", label: "Share it with a colleague", hint: "So they can see it" },
    isStatementOnly(concern)
      ? { key: "statement_toggle", group: "The case", label: "It needs a full response, not just a statement", hint: "Switches the case back to the full process" }
      : { key: "statement_toggle", group: "The case", label: "They only want a statement", hint: "Once it has been sent the case can be closed, with no learning or Duty of Candour steps" },
    { key: "note", group: "The case", label: "Add a note", hint: "Anything to remember" },
    { key: "stage", group: "The case", label: "Move it to the next stage", hint: "Acknowledged, investigation, response, learning…" },
  );
  // what needs doing first: replies we are waiting for, then what is back with us
  return choices.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
}

// ---- closing a case ----

export const CLOSE_STEPS = ["response", "learning", "lfe", "candour", "outcome", "check"];

// Some cases only ask the practice for a statement (the Health Board asking for one, for example). Those are not investigated
// and answered: once the statement has been sent the case can be closed, with no learning, Welsh Risk Pool or Duty of Candour
// steps, and the outcome is "statement provided".
export const STATEMENT_OUTCOME = "statement_provided";
export const isStatementOnly = (concern) => concern?.statementOnly === true;
export const closeStepsFor = (concern) => (isStatementOnly(concern) ? ["response", "check"] : CLOSE_STEPS);
export const RESPONSE_HOW = [
  { key: "letter", label: "By letter" },
  { key: "email", label: "By email" },
  { key: "meeting", label: "At a face-to-face meeting" },
];
export const LEARNING = [
  { key: "yes", label: "Yes, there is something to learn" },
  { key: "none", label: "No, nothing to learn" },
];
export const LFE_STATUSES = [
  { key: "not_required", label: "Not needed for this case" },
  { key: "in_progress", label: "Being prepared" },
  { key: "sent", label: "Sent to the Welsh Risk Pool" },
];
export const OUTCOMES = [
  { key: "upheld", label: "Upheld" },
  { key: "partially_upheld", label: "Partially upheld" },
  { key: "not_upheld", label: "Not upheld" },
  { key: "no_case_to_answer", label: "No case to answer" },
];

// The problems with one step of the closing wizard, in words for the person ([] when it is fine). `learningCount` is how many
// learning actions the case already has.
export function closeStepProblems(step, { closing = {}, concern = {}, steps = [], learningCount = 0, now = new Date() } = {}) {
  const problems = [];
  switch (step) {
    case "response": {
      const what = isStatementOnly(concern) ? "statement" : "final response";
      if (!DATE.test(String(closing.responseSentOn || ""))) problems.push(`Give the date the ${what} was sent.`);
      else if (closing.responseSentOn > dayKey(now)) problems.push(`That date is in the future. The ${what} has to have been sent.`);
      if (!RESPONSE_HOW.some((h) => h.key === closing.responseHow)) problems.push("Say how it was sent.");
      if (!isStatementOnly(concern)) {
        const { ready, blockers } = reviewStatus(concern, steps, now);
        if (!ready && !text(closing.overrideReason, 300)) problems.push(`It went before everyone involved had accepted it (${blockers.join(" ")}). Say why it was sent.`);
      }
      break;
    }
    case "learning":
      if (!LEARNING.some((l) => l.key === closing.learning)) problems.push("Say whether there is anything to learn from this case.");
      else if (closing.learning === "yes" && learningCount + (closing.newLearning || []).filter((t) => text(t, 160)).length < 1) problems.push("Add at least one thing that will change or be looked at.");
      else if (closing.learning === "none" && text(closing.learningNote, 300).length < 3) problems.push("Say briefly why there is nothing to learn.");
      break;
    case "lfe":
      if (!LFE_STATUSES.some((s) => s.key === closing.lfe)) problems.push("Say whether a Welsh Risk Pool report is needed.");
      break;
    case "candour":
      if (closing.candourConsidered !== true) problems.push("Confirm that the Duty of Candour was considered.");
      else if (typeof closing.candourTriggered !== "boolean") problems.push("Say whether the Duty of Candour was triggered.");
      else if (closing.candourTriggered && text(closing.candourNote, 300).length < 3) problems.push("Say how the patient was told.");
      break;
    case "outcome":
      if (!OUTCOMES.some((o) => o.key === closing.outcome)) problems.push("Choose the outcome.");
      break;
    default:
  }
  return problems;
}

// every problem across the whole closing wizard, which is what stands between the case and being closed
export function closeProblems(args) {
  return closeStepsFor(args?.concern).filter((s) => s !== "check").flatMap((s) => closeStepProblems(s, args));
}

// what closing the case writes (plain values; the service turns days into dates and writes them)
export function buildClosePatch({ closing = {}, concern = {}, steps = [], learningCount = 0, now = new Date() } = {}) {
  const problems = closeProblems({ closing, concern, steps, learningCount, now });
  if (problems.length) throw new Error(problems[0]);
  if (isStatementOnly(concern)) {
    return {
      outcome: STATEMENT_OUTCOME,
      finalResponseSentOn: closing.responseSentOn,
      finalResponseSentVia: closing.responseHow,
      sentBeforeAccepted: false,
      sentBeforeAcceptedReason: "",
      learningRequired: false,
      learningNote: "Only a statement was requested; there was no investigation.",
      lfeReportStatus: "not_required",
      dutyOfCandourConsidered: false,
      dutyOfCandourTriggered: false,
      dutyOfCandourNote: "",
      statementOnly: true,
    };
  }
  const review = reviewStatus(concern, steps, now);
  return {
    outcome: closing.outcome,
    finalResponseSentOn: closing.responseSentOn,
    finalResponseSentVia: closing.responseHow,
    sentBeforeAccepted: !review.ready,
    sentBeforeAcceptedReason: review.ready ? "" : text(closing.overrideReason, 300),
    learningRequired: closing.learning === "yes",
    learningNote: closing.learning === "none" ? text(closing.learningNote, 300) : "",
    lfeReportStatus: closing.lfe,
    dutyOfCandourConsidered: true,
    dutyOfCandourTriggered: closing.candourTriggered === true,
    dutyOfCandourNote: closing.candourTriggered ? text(closing.candourNote, 300) : "",
  };
}
