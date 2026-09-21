import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import {
  CONCERN_MEETINGS_COLLECTION,
  CONCERN_OUTCOME_LABELS,
  CONCERN_STAGES,
  CONCERN_TIMELINE_COLLECTION,
  MEETING_FURTHER_REQUESTS,
  formatMeetingDate,
  friendly,
  getMeetingStatus,
  toDate,
} from "@/modules/governance/services/concernService";

// Every value that comes from a case is escaped before it goes into the print
// document — case text is typed in by staff and must never be able to run as
// markup in the print frame.
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function day(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-GB") : "";
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function row(label, value) {
  const text = value === "" || value === null || value === undefined ? "—" : value;
  return `<tr><th>${esc(label)}</th><td>${esc(text)}</td></tr>`;
}

function section(title, body) {
  return `<section><h2>${esc(title)}</h2>${body}</section>`;
}

export function buildConcernSummaryHtml({ concern = {}, meetings = null, timeline = null, printedBy = "", printedAt = new Date() } = {}) {
  const stage = CONCERN_STAGES.find((item) => item.key === concern.status)?.label || friendly(concern.status);
  const identifier = concern.emisNumber ? `EMIS ${concern.emisNumber}` : `${concern.patientInitials || "Initials missing"} | DOB ${concern.dateOfBirth || "missing"}`;
  const raisedBy = [friendly(concern.source || "patient"), concern.raisedByInitials].filter(Boolean).join(" — ");

  const caseTable = `<table>
    ${row("Reference", concern.reference)}
    ${row("Patient identifier", identifier)}
    ${row("Raised by", raisedBy)}
    ${row("Category", friendly(concern.category))}
    ${row("Priority", String(concern.priority || "low").toUpperCase())}
    ${row("Stage", stage)}
    ${concern.outcome ? row("Outcome", CONCERN_OUTCOME_LABELS[concern.outcome] || friendly(concern.outcome)) : ""}
    ${row("Case owner", concern.ownerName)}
    ${row("Named contact", concern.namedContactName)}
    ${concern.externalReference ? row("External reference", concern.externalReference) : ""}
    ${concern.mddusRequired ? row("GMPI / solicitor reference", concern.gmpiReference || "Not yet recorded") : ""}
  </table>`;

  const datesTable = `<table>
    ${row("Received", day(concern.receivedAt))}
    ${row("Acknowledgement due", day(concern.acknowledgementDueAt))}
    ${row("Early resolution due", day(concern.earlyResolutionDueAt))}
    ${row("Final response due", day(concern.finalResponseDueAt))}
    ${row("Listening discussion offered", day(concern.listeningDiscussionOfferedAt))}
    ${row("Listening discussion completed", day(concern.listeningDiscussionCompletedAt))}
  </table>`;

  const summaryBlock = `<p class="prose">${esc(concern.summary || "No summary recorded.")}</p>${
    concern.desiredOutcome ? `<p class="label">Outcome sought</p><p class="prose">${esc(concern.desiredOutcome)}</p>` : ""
  }`;

  const flagsTable = `<table class="flags">
    ${row("Early resolution suitable", yesNo(concern.earlyResolutionSuitable))}
    ${row("Duty of Candour considered", yesNo(concern.dutyOfCandourConsidered))}
    ${row("Duty of Candour triggered", yesNo(concern.dutyOfCandourTriggered))}
    ${row("Clinical review required", yesNo(concern.clinicalReviewRequired))}
    ${row("MDDUS involved", yesNo(concern.mddusRequired))}
    ${row("Learning from Events report", friendly(concern.lfeReportStatus || "not_required"))}
  </table>`;

  let meetingsBlock;
  if (meetings === null) {
    meetingsBlock = `<p class="muted">Meeting records could not be loaded for this print.</p>`;
  } else if (meetings.length === 0) {
    meetingsBlock = `<p class="muted">No face-to-face meetings recorded.</p>`;
  } else {
    meetingsBlock = meetings.map((meeting) => {
      const status = getMeetingStatus(meeting);
      const requests = MEETING_FURTHER_REQUESTS.filter((item) => (meeting.furtherRequests || []).includes(item.key)).map((item) => item.label);
      const booked = meeting.bookedDate ? `${formatMeetingDate(meeting.bookedDate)}${meeting.bookedTime ? ` at ${meeting.bookedTime}` : ""}` : "Not yet booked";
      return `<div class="meeting">
        <p><strong>${esc(status.label)}</strong> &middot; ${esc(booked)}</p>
        <p>Requested ${esc(formatMeetingDate(meeting.requestedDate))} by ${esc(meeting.requestedBy || "not recorded")}</p>
        ${meeting.attendees ? `<p>Attending: ${esc(meeting.attendees)}</p>` : ""}
        ${meeting.outcome ? `<p>Outcome: ${esc(meeting.outcome)}</p>` : ""}
        ${requests.length ? `<p>Patient or representative has requested: ${esc(requests.join("; "))}</p>` : ""}
      </div>`;
    }).join("");
  }

  let timelineBlock;
  if (timeline === null) {
    timelineBlock = `<p class="muted">Recent activity could not be loaded for this print.</p>`;
  } else if (timeline.length === 0) {
    timelineBlock = `<p class="muted">No activity recorded.</p>`;
  } else {
    timelineBlock = `<table class="timeline">${timeline.map((event) => `<tr><th>${esc(day(event.createdAt))}</th><td><strong>${esc(event.title)}</strong>${event.message ? ` — ${esc(event.message)}` : ""}</td></tr>`).join("")}</table>`;
  }

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8" />
<title>Concern summary ${esc(concern.reference)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; line-height: 1.45; color: #0f172a; margin: 0; }
  .banner { border: 1px solid #94a3b8; border-radius: 4px; padding: 5px 9px; font-size: 10px; color: #475569; letter-spacing: .04em; text-transform: uppercase; }
  h1 { font-size: 19px; margin: 10px 0 2px; }
  .sub { color: #475569; margin: 0 0 8px; }
  h2 { font-size: 12.5px; margin: 13px 0 4px; padding-bottom: 2px; border-bottom: 1.5px solid #0f766e; color: #0f766e; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; }
  th { width: 34%; text-align: left; font-weight: 600; color: #475569; padding: 2.5px 8px 2.5px 0; vertical-align: top; }
  td { padding: 2.5px 0; vertical-align: top; }
  .cols th { width: 50%; }
  .timeline th { width: 16%; font-weight: 500; }
  .prose { margin: 3px 0 6px; white-space: pre-wrap; }
  .label { margin: 6px 0 0; font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: .04em; }
  .muted { color: #64748b; margin: 3px 0; }
  .meeting { border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 9px; margin: 4px 0; page-break-inside: avoid; }
  .meeting p { margin: 1px 0; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; }
  section { page-break-inside: avoid; }
  footer { margin-top: 14px; padding-top: 5px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; }
</style></head>
<body>
  <div class="banner">Confidential &middot; case summary &middot; contains no patient names</div>
  <h1>${esc(concern.reference || "Concern")}</h1>
  <p class="sub">Listening to People case summary</p>
  <div class="cols">
    <div>${section("Case", caseTable)}</div>
    <div>${section("Key dates", datesTable)}${section("Case flags", flagsTable)}</div>
  </div>
  ${section("Summary", summaryBlock)}
  ${section("Face-to-face meetings", meetingsBlock)}
  ${section("Recent activity", timelineBlock)}
  <footer>Printed ${esc(printedAt.toLocaleString("en-GB"))}${printedBy ? ` by ${esc(printedBy)}` : ""} from Primovex. This is a summary — the full case record is in Primovex.</footer>
</body></html>`;
}

// Meetings and the last few timeline entries, fetched on demand so a summary
// can be printed straight from the register without opening the case first.
// Either can fail independently (returns null) without stopping the print.
export async function fetchConcernPrintData(concernId) {
  if (isSafeSyntheticMode() || !concernId) return { meetings: [], timeline: [] };
  const [meetings, timeline] = await Promise.allSettled([
    getDocs(query(collection(db, CONCERN_MEETINGS_COLLECTION), where("concernId", "==", concernId))),
    getDocs(query(collection(db, CONCERN_TIMELINE_COLLECTION), where("concernId", "==", concernId), orderBy("createdAt", "desc"), limit(6))),
  ]);
  const toRows = (result) => (result.status === "fulfilled" ? result.value.docs.map((d) => ({ id: d.id, ...d.data() })) : null);
  const meetingRows = toRows(meetings);
  if (meetingRows) {
    meetingRows.sort((a, b) => String(b.requestedDate || "").localeCompare(String(a.requestedDate || "")));
  }
  return { meetings: meetingRows, timeline: toRows(timeline) };
}

// Prints through a hidden frame rather than a pop-up window: no pop-up
// blocker to trip over, and nothing left open behind the app afterwards.
export function printHtmlDocument(html) {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      frame.remove();
      resolve();
    };
    frame.onload = () => {
      const win = frame.contentWindow;
      win.onafterprint = finish;
      win.focus();
      win.print();
      window.setTimeout(finish, 120000);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

export async function printConcernSummary(concern, actor = {}) {
  const data = await fetchConcernPrintData(concern?.id);
  const html = buildConcernSummaryHtml({
    concern,
    meetings: data.meetings,
    timeline: data.timeline,
    printedBy: actor.displayName || actor.email || "",
  });
  await printHtmlDocument(html);
}
