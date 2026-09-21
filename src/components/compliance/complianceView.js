// Small display helpers shared by the desktop Compliance screens.

export function toDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWhen(value) {
  const date = toDate(value);
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// The moment a check really happened: a manual record carries the time it was
// done; a tag check was done when it was saved.
export function checkTime(check) {
  return toDate(check?.performedAt) || toDate(check?.createdAt);
}

export function checkPerson(check) {
  return check?.actor?.displayName || check?.actor?.email || "Unknown";
}

export function isWaterType(type) {
  return String(type || "").startsWith("water_");
}

export function isFireType(type) {
  return String(type || "").startsWith("fire_");
}

export function localDateInput(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTimeInput(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
