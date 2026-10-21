// How a SAR or a concern names the patient it is about: an EMIS number, the patient's initials and their date of birth. Never the
// name. Pure (no Firestore, no screens), shared by both so the rules are the same on the desktop and the phone.

export const MAX_INITIALS = 6;

// letters only, upper case: "a. b" -> "AB"
export const cleanInitials = (value) => String(value ?? "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, MAX_INITIALS);

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// a real calendar day (yyyy-mm-dd), not in the future, not before 1890
export function validDob(value, now = new Date()) {
  const m = DAY_KEY.exec(String(value || ""));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return false;
  return y >= 1890 && date.getTime() <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export const ukDob = (value) => (DAY_KEY.test(String(value || "")) ? String(value).split("-").reverse().join("/") : "");

// What is wrong with the identity as entered, as sentences to show. `emisRequired`: a SAR always has an EMIS number; a concern
// may not (the person raising it may not know it). `needed`: initials and date of birth are asked for on a new record; an older
// record that never had them can still be edited without them.
export function identityProblems({ emisNumber = "", patientInitials = "", dateOfBirth = "" } = {}, { emisRequired = false, needed = true, now = new Date() } = {}) {
  const problems = [];
  if (emisRequired && !String(emisNumber).trim()) problems.push("Give the patient's EMIS number.");
  const initials = cleanInitials(patientInitials);
  const hasDob = String(dateOfBirth || "").trim() !== "";
  if (needed && !initials) problems.push("Give the patient's initials.");
  if (needed && !hasDob) problems.push("Give the patient's date of birth.");
  if (hasDob && !validDob(dateOfBirth, now)) problems.push("The date of birth is not a real date, or is in the future.");
  return problems;
}

// the fields as saved on the record
export function identityFields({ emisNumber = "", patientInitials = "", dateOfBirth = "" } = {}) {
  return {
    emisNumber: String(emisNumber ?? "").trim(),
    patientInitials: cleanInitials(patientInitials),
    dateOfBirth: validDob(dateOfBirth) ? String(dateOfBirth) : "",
  };
}

// How the patient is shown. `withDob` is for the case page and the print, not for lists that may be on show in an office.
export function identityLabel({ emisNumber = "", patientInitials = "", dateOfBirth = "" } = {}, { withDob = false } = {}) {
  const parts = [];
  if (String(emisNumber).trim()) parts.push(`EMIS ${String(emisNumber).trim()}`);
  if (cleanInitials(patientInitials)) parts.push(cleanInitials(patientInitials));
  if (withDob && ukDob(dateOfBirth)) parts.push(`born ${ukDob(dateOfBirth)}`);
  return parts.join(" · ") || "No patient identifier";
}
