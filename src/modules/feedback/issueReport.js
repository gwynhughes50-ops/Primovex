// Staff telling the developer about a problem or an idea, through the Orb. Pure (no Firestore, no screens) so the rules can be tested.
//
// A report is one short message from a signed-in person, with where they were and which version they were using added for them. It is
// private: the person who sent it can see their own, and only the System Admin sees them all. It must never carry anything that
// identifies a patient, so a long number or a date that could be a date of birth is refused with a sentence saying why.

export const REPORT_KINDS = [
  { key: "problem", label: "Something isn't working", hint: "An error, a button that does nothing, something that went wrong" },
  { key: "look", label: "Something looks wrong or is confusing", hint: "Hard to read, in the wrong place, I could not work out what to do" },
  { key: "idea", label: "An idea or improvement", hint: "Something that would make Primovex better for you" },
];
export const REPORT_STATUS = [
  { key: "new", label: "Sent", note: "Waiting for the developer to look" },
  { key: "seen", label: "Seen", note: "The developer has read it" },
  { key: "planned", label: "Planned", note: "It will be done" },
  { key: "fixed", label: "Done", note: "It has been fixed or added" },
  { key: "wont", label: "Not doing", note: "It will not be changed" },
];
export const MIN_MESSAGE = 10;
export const MAX_MESSAGE = 1000;
export const MAX_DOING = 400;

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const kindLabel = (key) => REPORT_KINDS.find((k) => k.key === key)?.label || "Report";
export const statusLabel = (key) => REPORT_STATUS.find((s) => s.key === key)?.label || "Sent";

// the page they were on, as a path only: no search, no hash, nothing that could hold an identifier
export function cleanRoute(value) {
  const path = String(value ?? "").split(/[?#]/)[0].trim();
  return /^\/[A-Za-z0-9/_-]{0,118}$/.test(path) ? path : "";
}

// "windows" | "android" | "ios" | "web", from the app's own client details
export function platformOf({ client = "web", userAgent = "" } = {}) {
  const ua = String(userAgent).toLowerCase();
  if (client === "tauri") return ua.includes("android") ? "android" : "windows";
  return ua.includes("iphone") || ua.includes("ipad") ? "ios" : "web";
}

// Anything that looks like it could name a patient: six or more digits in a row (an EMIS or NHS number), or a full date. Returns the
// reason as a sentence, or "".
export function privacyProblem(...texts) {
  const text = texts.map((t) => String(t ?? "")).join(" ");
  if (/\d{6,}/.test(text.replace(/[\s-]/g, ""))) return "That looks like it has a patient number in it. Please describe the problem without it: say which screen and what happened.";
  if (/(^|[^0-9.])(\d{1,2}[/-]\d{1,2}[/-](\d{2}|\d{4})|\d{1,2}\.\d{1,2}\.\d{4})([^0-9]|$)/.test(text)) return "That has a full date in it, which could be a date of birth. Please leave dates out and describe what happened instead.";
  return "";
}

// The record to save. Throws a sentence for the person when it cannot be sent.
export function buildReport({ kind, message, doing = "", route = "", appVersion = "", client = "web", userAgent = "", role = "", reporter = {}, now = new Date() } = {}) {
  if (!REPORT_KINDS.some((k) => k.key === kind)) throw new Error("Choose what sort of report it is.");
  const text = clean(message, MAX_MESSAGE);
  if (text.length < MIN_MESSAGE) throw new Error("Tell us a little more: a sentence about what happened or what would help.");
  const context = clean(doing, MAX_DOING);
  const problem = privacyProblem(text, context);
  if (problem) throw new Error(problem);
  if (!reporter.uid) throw new Error("You need to be signed in to send a report.");
  return {
    ticket: ticketFor(now),
    kind,
    message: text,
    doing: context,
    route: cleanRoute(route),
    appVersion: clean(appVersion, 20),
    platform: platformOf({ client, userAgent }),
    role: clean(role, 60),
    reporterUid: reporter.uid,
    reporterName: clean(reporter.name, 80) || "Unnamed",
    status: "new",
  };
}

// FB-2026-LMN4Q2: the year and the time in base 36, short enough to say aloud
export const ticketFor = (now = new Date()) => `FB-${now.getFullYear()}-${now.getTime().toString(36).toUpperCase().slice(-6)}`;

// Is what they said to the Orb a wish to report something? ("report a problem", "I've found a bug", "I've got an idea", "something's broken")
export function looksLikeReportRequest(text) {
  const t = String(text ?? "").toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 140) return false;
  return /\b(report|raise|log|send)\b.*\b(problem|issue|bug|fault|error|idea|suggestion)\b/.test(t)
    || /\b(found|got|spotted|have|had)\b.*\b(bug|problem with|issue with|fault|error)\b/.test(t)
    || /\b(i have|ive got|got|i had|ive had)\b.*\b(idea|suggestion)\b/.test(t)
    || /^(i )?(want to |would like to |wish to )?(suggest|make a suggestion|tell the developer|tell the developers|message the developer)\b/.test(t)
    // "the SAR page is broken", "this keeps crashing": only when it is plainly about the app, so "the fridge isn't working" (a real
    // fridge) is left for the Orb to deal with as it would any other message
    || (t.length < 80 && !/^(is|are|why|what|how|which|where|when|does|do|can|could|has|have|did)\b/.test(t)
      && /\b(broken|crashing|crashed|not working|isnt working|wont (open|load|save)|doesnt (work|open|load|save)|keeps (crashing|freezing|failing)|stuck|wrong)\b/.test(t)
      && (/^(something|this|it|that)\b/.test(t) || /\b(primovex|app|page|screen|button|form|orb|tab|menu|login|sar|sars|concern|concerns|training|timesheet|mileage|dashboard|website)\b/.test(t)));
}

// When they describe the problem rather than just ask to report one ("the SAR page is broken"), their words start the report for them
export function reportPrefill(text) {
  const t = String(text ?? "").trim();
  return looksLikeReportRequest(t) && !/\b(report|raise|log|send|suggest|suggestion|tell|message|idea)\b/i.test(t) ? t : "";
}

// What the developer can change a report to
export const NEXT_STATUSES = { new: ["seen", "planned", "fixed", "wont"], seen: ["planned", "fixed", "wont"], planned: ["fixed", "wont"], fixed: ["planned"], wont: ["planned"] };
export const cleanReply = (value) => clean(value, 300);
export const cleanFixedIn = (value) => (/^\d+\.\d+\.\d+$/.test(String(value ?? "").trim()) ? String(value).trim() : "");
