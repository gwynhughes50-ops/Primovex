// The person who raised a concern: initials, their relationship to the patient, and a phone number and email address to
// reply to. The initials and the relationship sit on the case; the phone and email live in their own record that only the
// concerns team and the case's owner can read (governance_concern_contacts), so they never show in lists, search, the
// partner view, the Orb or a printed pack. Pure, so it can be tested.

export const CONTACT_PREFERENCES = ["either", "phone", "email"];
export const CONTACT_PREFERENCE_LABELS = { either: "Either", phone: "Phone", email: "Email" };

const digitsOf = (value) => String(value || "").replace(/\D/g, "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// the details as stored: trimmed, the email in lower case, a preference that is one of the three
export function cleanContact(input = {}) {
  const preferred = CONTACT_PREFERENCES.includes(input.preferred) ? input.preferred : "either";
  return {
    phone: String(input.phone || "").replace(/\s+/g, " ").trim(),
    email: String(input.email || "").trim().toLowerCase(),
    preferred,
  };
}

export const hasContact = (contact) => Boolean(contact && (String(contact.phone || "").trim() || String(contact.email || "").trim()));

// what is wrong with the contact details, in words for the person typing them
export function validateContact(input = {}) {
  const contact = cleanContact(input);
  const errors = [];
  if (contact.phone) {
    const digits = digitsOf(contact.phone);
    if (digits.length < 10 || digits.length > 13 || /[^\d\s()+-]/.test(contact.phone)) errors.push("The phone number should be 10 to 13 digits, for example 07123 456789.");
  }
  if (contact.email && !EMAIL.test(contact.email)) errors.push("That email address does not look right.");
  if (contact.preferred === "phone" && !contact.phone && (contact.email || input.preferred === "phone")) errors.push("You chose phone as the way to reach them but there is no phone number.");
  if (contact.preferred === "email" && !contact.email) errors.push("You chose email as the way to reach them but there is no email address.");
  return errors;
}

// older cases kept one contact value on the case itself (raisedByContactMethod: email or mobile)
export function legacyContact(concern = {}) {
  const value = String(concern.raisedByContactValue || "").trim();
  if (!value || concern.raisedByContactMethod === "none") return { phone: "", email: "", preferred: "either" };
  return concern.raisedByContactMethod === "email"
    ? { phone: "", email: value.toLowerCase(), preferred: "email" }
    : { phone: value, email: "", preferred: "phone" };
}

// the form the quick capture starts from
export function quickConcernSeed(today = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    source: "patient",
    raisedByInitials: "",
    raisedByPhone: "",
    raisedByEmail: "",
    raisedByPreferred: "either",
    emisNumber: "",
    patientInitials: "",
    dateOfBirth: "",
    receivedAt: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    category: "communication",
    summary: "",
    ownerUid: "",
    ownerName: "Unassigned",
  };
}

// What must be filled in before a concern can be logged. Contact details are optional (a concern raised in passing may
// not leave any) but, when given, must be usable.
export function validateQuickConcern(form = {}) {
  const errors = [];
  const raiserIsPatient = (form.source || "patient") === "patient";
  const raiserInitials = String(form.raisedByInitials || "").replace(/[^A-Za-z]/g, "");
  if (!raiserIsPatient && raiserInitials.length < 1) errors.push("Add the initials of the person raising it.");
  if (!String(form.emisNumber || "").trim()) {
    const patientInitials = String(form.patientInitials || "").trim();
    if (!patientInitials || !form.dateOfBirth) errors.push("Give the patient's EMIS number, or their initials and date of birth.");
  }
  if (!String(form.summary || "").trim()) errors.push("Say briefly what it is about, without the patient's name.");
  errors.push(...validateContact({ phone: form.raisedByPhone, email: form.raisedByEmail, preferred: form.raisedByPreferred }));
  return errors;
}

// the contact record to save from the form's fields
export const contactFromForm = (form = {}) => cleanContact({ phone: form.raisedByPhone, email: form.raisedByEmail, preferred: form.raisedByPreferred });
