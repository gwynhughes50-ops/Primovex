const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { hasCapability } = require("./roleCapabilities");

// A quality or register opportunity found in a letter (for example "asthma diagnosis and monitoring prompt") passed from one member of staff to
// another person, or to everyone with a role such as the business team, to follow up. Written here, on the server, because clients can never create
// these records or notifications: one record per recipient, so each person's progress (seen, actioned, declined) is their own and the sender can see it.
//
// The record carries the opportunity and, because the person following it up has to find the patient, the patient's initials, date of birth and NHS
// number when the letter has them. That is kept in the record only. The NOTIFICATION that goes to a phone or the desktop never carries it: it names the
// opportunity and nothing else. The audit trail records who sent what kind of opportunity to whom (by role and count), never the patient.

const KINDS = ["quality", "triage"];
const STATUSES = ["new", "seen", "actioned", "declined"];
const RECIPIENT_MAX = 25;
const HOURLY_LIMIT = 40;
const MAX = { title: 140, domain: 80, rationale: 400, nextStep: 400, note: 300, statusNote: 300, source: 80, letterRef: 80, initials: 6 };

const tidy = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// An NHS number is ten digits whose last is a check digit (MOD 11 of the first nine)
function nhsNumberValid(value) {
  const digits = String(value ?? "").replace(/\s+/g, "");
  if (!/^\d{10}$/.test(digits)) return false;
  const sum = digits.slice(0, 9).split("").reduce((total, d, i) => total + Number(d) * (10 - i), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  return check !== 10 && check === Number(digits[9]);
}

const realDay = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

// The patient details that are allowed in: initials (letters only), a real date of birth, a valid NHS number. Anything else is left out, never kept.
function cleanPatient(input) {
  if (!input || typeof input !== "object") return null;
  const initials = String(input.initials ?? "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, MAX.initials);
  const birthDate = realDay(input.birthDate) ? String(input.birthDate) : "";
  const nhsNumber = nhsNumberValid(input.nhsNumber) ? String(input.nhsNumber).replace(/\s+/g, "") : "";
  if (!initials && !birthDate && !nhsNumber) return null;
  return { initials, birthDate, nhsNumber };
}

// The opportunity as it will be kept, or an error saying what is wrong
function cleanOpportunity(data = {}) {
  const title = tidy(data.title, MAX.title);
  if (!title) throw new HttpsError("invalid-argument", "Say what the opportunity is.");
  return {
    title,
    domain: tidy(data.domain, MAX.domain),
    rationale: tidy(data.rationale, MAX.rationale),
    nextStep: tidy(data.nextStep, MAX.nextStep),
    source: tidy(data.source, MAX.source) || "ClinFlow letter",
    letterRef: tidy(data.letterRef, MAX.letterRef),
    note: tidy(data.note, MAX.note),
    patient: cleanPatient(data.patient),
    kind: KINDS.includes(data.kind) ? data.kind : "quality",
    urgent: data.urgent === true,
  };
}

// The record for one recipient
function buildOpportunityRecord({ groupId, sender, recipient, opportunity }) {
  return {
    groupId,
    senderUid: sender.uid,
    senderName: tidy(sender.name, 80) || "A colleague",
    recipientUid: recipient.uid,
    recipientName: tidy(recipient.name, 80),
    recipientRole: tidy(recipient.role, 60),
    ...opportunity,
    status: "new",
    statusNote: "",
    statusByUid: "",
  };
}

// What goes to the person's notifications: what kind of thing it is and who sent it. No patient details, ever.
function buildOpportunityNotification({ sender, recipientUid, opportunity }) {
  const triage = opportunity.kind === "triage";
  return {
    recipientUid,
    module: triage ? "clinflow" : "quality",
    kind: triage ? "triage-item" : "quality-opportunity",
    title: `${tidy(sender.name, 80) || "A colleague"} ${triage ? "sent you a letter to look at" : "sent you a quality opportunity"}`,
    message: !triage && opportunity.domain ? `${opportunity.title} (${opportunity.domain})` : opportunity.title,
    priority: opportunity.urgent ? "high" : "normal",
    read: false,
    status: "open",
    actionUrl: "/quality-opportunities",
    automated: false,
    createdByUid: sender.uid,
    createdByName: tidy(sender.name, 80) || "A colleague",
  };
}

async function limitSends({ db, uid, now }) {
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}${String(now.getUTCHours()).padStart(2, "0")}`;
  const ref = db.collection("quality_opportunity_limits").doc(`${uid}_${stamp}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data().count) || 0 : 0;
    if (count >= HOURLY_LIMIT) throw new HttpsError("resource-exhausted", "You have sent a lot this hour. Try again later.");
    tx.set(ref, { count: count + 1, uid, updatedAtMs: now.getTime() });
  });
}

// Who an opportunity can go to: active colleagues (id, name and role only, never an email address), and the roles they hold
async function listRecipients({ db, callerUid, capabilities }) {
  if (!hasCapability(capabilities, "clinflow.workflow")) throw new HttpsError("permission-denied", "You need ClinFlow workflow access to send an opportunity.");
  const snapshot = await db.collection("users").get();
  const staff = snapshot.docs
    .filter((doc) => doc.id !== callerUid && doc.data()?.active !== false)
    .map((doc) => ({ id: doc.id, label: tidy(doc.data()?.displayName, 80) || "Unnamed user", role: tidy(doc.data()?.role, 60) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  const roles = Object.entries(staff.reduce((tally, person) => { if (person.role) tally[person.role] = (tally[person.role] || 0) + 1; return tally; }, {}))
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => a.role.localeCompare(b.role));
  return { staff, roles };
}

// Sends one opportunity to a named person (toUid) or to everyone with a role. Returns { sent, role | toName, groupId }.
async function sendQualityOpportunity({ db, callerUid, callerName, capabilities, data = {}, now = new Date() }) {
  if (!hasCapability(capabilities, "clinflow.workflow")) throw new HttpsError("permission-denied", "You need ClinFlow workflow access to send an opportunity.");
  const opportunity = cleanOpportunity(data);
  const toUid = tidy(data.toUid, 128);
  const role = toUid ? "" : tidy(data.role, 60);
  if (!toUid && !role) throw new HttpsError("invalid-argument", "Choose who to send it to.");
  await limitSends({ db, uid: callerUid, now });

  let recipients;
  if (toUid) {
    if (toUid === callerUid) throw new HttpsError("invalid-argument", "That is you.");
    const person = await db.collection("users").doc(toUid).get();
    if (!person.exists || person.data()?.active === false) throw new HttpsError("failed-precondition", "That person can't be sent this.");
    recipients = [{ id: toUid, data: () => person.data() }];
  } else {
    const snapshot = await db.collection("users").where("role", "==", role).get();
    recipients = snapshot.docs.filter((doc) => doc.id !== callerUid && doc.data()?.active !== false);
  }
  if (!recipients.length) throw new HttpsError("failed-precondition", role ? `No one else has the role "${role}".` : "Nobody to send it to.");
  if (recipients.length > RECIPIENT_MAX) throw new HttpsError("failed-precondition", `That role has more than ${RECIPIENT_MAX} people: send it to one person.`);

  const sender = { uid: callerUid, name: callerName };
  const groupId = db.collection("quality_opportunities").doc().id || `group-${now.getTime()}`;
  const batch = db.batch();
  recipients.forEach((doc) => {
    const person = { uid: doc.id, name: doc.data()?.displayName, role: doc.data()?.role };
    batch.set(db.collection("quality_opportunities").doc(), { ...buildOpportunityRecord({ groupId, sender, recipient: person, opportunity }), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    batch.set(db.collection("users").doc(doc.id).collection("notifications").doc(), { ...buildOpportunityNotification({ sender, recipientUid: doc.id, opportunity }), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();
  return toUid
    ? { sent: recipients.length, role: null, toName: tidy(recipients[0].data()?.displayName, 80), groupId, domain: opportunity.domain, kind: opportunity.kind, hadPatient: Boolean(opportunity.patient) }
    : { sent: recipients.length, role, groupId, domain: opportunity.domain, kind: opportunity.kind, hadPatient: Boolean(opportunity.patient) };
}

// The person it was sent to says what happened: seen, actioned, or declined (with a note). Nobody else can, and the patient details are not touched.
async function updateQualityOpportunity({ db, callerUid, data = {}, now = new Date() }) {
  const id = tidy(data.id, 128);
  const status = tidy(data.status, 20);
  if (!id) throw new HttpsError("invalid-argument", "Which opportunity?");
  if (!STATUSES.includes(status) || status === "new") throw new HttpsError("invalid-argument", "Choose seen, actioned or declined.");
  const ref = db.collection("quality_opportunities").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That opportunity could not be found.");
  const record = snap.data() || {};
  if (record.recipientUid !== callerUid) throw new HttpsError("permission-denied", "Only the person it was sent to can update it.");
  const statusNote = tidy(data.note, MAX.statusNote);
  if (status === "declined" && !statusNote) throw new HttpsError("invalid-argument", "Say briefly why it is being declined.");
  await ref.update({ status, statusNote, statusByUid: callerUid, statusAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), statusAtMs: now.getTime() });
  return { id, status, senderUid: record.senderUid, domain: record.domain || "", kind: record.kind || "quality" };
}

module.exports = { KINDS, STATUSES, RECIPIENT_MAX, HOURLY_LIMIT, MAX, nhsNumberValid, cleanPatient, cleanOpportunity, buildOpportunityRecord, buildOpportunityNotification, listRecipients, sendQualityOpportunity, updateQualityOpportunity };
