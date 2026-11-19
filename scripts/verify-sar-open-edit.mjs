// Opening a SAR shows its details as the form, so the SAR team read and change everything in one place (no separate Edit step); people who may only read it see the details as plain text.
// Rendered here with a made-up SAR (no database, no sign-in).
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SarDetailPanel, SarFormPanel } from "../src/pages/GovernanceSARs.jsx";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const stamp = (iso) => ({ toDate: () => new Date(`${iso}T12:00:00`) });
const sar = {
  id: "s1", reference: "SAR-2026-1118", status: "in_progress", emisNumber: "123456", patientInitials: "AB", dateOfBirth: "1960-04-02",
  receivedDate: stamp("2026-11-01"), dueDate: stamp("2026-11-29"), requestedBy: "company", requestedByOther: "Smith & Co", receivedVia: "email", solicitorReference: "SC-77",
  requestType: "summary", requestTypeLabel: "Medical Summary", requestOptions: ["Standard summary"], informationRequired: "Include the last two letters.", deliveryMethod: "email", emailAddress: "x@example.com",
  consentToEmail: true, urgent: false, assignedToUid: "u1", assignedToName: "Sam", managerUid: "", managerName: "", notes: "Waiting for ID", checklist: {},
};
const actor = { uid: "t1", displayName: "Team" };
const html = (el) => renderToStaticMarkup(el);
const detail = (props) => html(React.createElement(SarDetailPanel, { sar, actor, canDelete: true, users: [{ id: "u1", label: "Sam" }], onClose() {}, onDelete() {}, ...props }));

t("the SAR team see every detail as a field they can change, with Save beside it, and no Edit button", () => {
  const out = detail({ isTeam: true });
  assert.match(out, /Details \(change anything here and save\)/);
  for (const text of ["EMIS Number", "Date Received", "Due Date", "Date Completed", "Requested By", "Received Via", "Solicitor Reference", "Information Requested", "Additional Details", "Assigned To", "Manager for Escalation", "Delivery Method", "Email Address", "Internal Notes", "Mark as urgent", "Consent to email recorded"]) assert.ok(out.includes(text), `${text} should be a field`);
  assert.ok(out.includes('value="123456"'), "the EMIS number is filled in");
  assert.ok(out.includes("Smith &amp; Co"), "the company name is filled in");
  assert.ok(out.includes("Include the last two letters."), "the additional details are filled in");
  assert.match(out, /Save changes/);
  assert.match(out, /Everything here is saved\./);
  assert.doesNotMatch(out, />\s*Edit\s*</, "there is no separate Edit button");
  assert.doesNotMatch(out, /Edit SAR-2026-1118/, "no window title for a separate edit step");
});

t("the status buttons, checklist and timeline are still there beside the details", () => {
  const out = detail({ isTeam: true });
  for (const text of ["Workflow", "Quality Check", "Completion Checklist", "Identity / authority checked", "Timeline", "Add internal note"]) assert.ok(out.includes(text), `${text} should still be on the page`);
});

t("nothing is changed or shown as unsaved when it has only just been opened, and Save waits until something has changed", () => {
  const out = detail({ isTeam: true });
  assert.doesNotMatch(out, /You have changes that are not saved yet\./);
  assert.match(out, /<button[^>]*disabled=""[^>]*>Save changes<\/button>|<button[^>]*>Save changes<\/button>/);
  assert.match(out, /disabled=""[^>]*><[^>]*>?Save changes|Save changes/);
});

t("someone who may only read a SAR sees the details as plain text, with no form and no Save", () => {
  const out = detail({ isTeam: false, canDelete: false });
  assert.match(out, /Request Summary/);
  assert.doesNotMatch(out, /<input[^>]*value="123456"/, "no input holds the EMIS number");
  assert.ok(out.includes("123456"), "the EMIS number is shown as text");
  assert.doesNotMatch(out, /Save changes/);
  assert.doesNotMatch(out, /Date Completed/);
  assert.ok(out.includes("Waiting for ID"), "the notes are shown");
});

t("a new SAR is still a window of its own with its header, a Create button and a Cancel", () => {
  const out = html(React.createElement(SarFormPanel, { open: true, users: [], actor, rows: [], onClose() {} }));
  assert.match(out, /New Subject Access Request/);
  assert.match(out, /Create SAR/);
  assert.match(out, />Cancel</);
  assert.match(out, /fixed inset-0/);
});

t("in the SAR's own page the form has no window, header, close button or Cancel of its own", () => {
  const out = html(React.createElement(SarFormPanel, { embedded: true, open: true, sar, users: [], actor, onClose() {} }));
  assert.doesNotMatch(out, /fixed inset-0/);
  assert.doesNotMatch(out, /New Subject Access Request/);
  assert.doesNotMatch(out, /Edit SAR-/);
  assert.doesNotMatch(out, />Close</);
  assert.doesNotMatch(out, />Cancel</);
  assert.doesNotMatch(out, /Create SAR/);
});

console.log(`\n${n} checks passed`);
