// How often a space needs cleaning, in hours. 0 means "never": the space isn't on a cleaning
// schedule, so it is never shown as overdue or due. A missing or invalid value is the usual
// daily (24). Careful: 0 is a real choice here, so don't write `value || 24`.

export const NEVER = 0;
export const DEFAULT_CLEANING_HOURS = 24;

export function cleaningFrequencyHours(value) {
  if (value === 0 || value === "0") return NEVER;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CLEANING_HOURS;
}

// Whether this space is on a cleaning schedule at all.
export function needsCleaning(space) {
  return cleaningFrequencyHours(space?.cleaningFrequencyHours) !== NEVER;
}

// When the next clean is due, or null when there is no schedule or it has never been cleaned.
export function nextCleanDue(space, lastCleaned) {
  const hours = cleaningFrequencyHours(space?.cleaningFrequencyHours);
  if (hours === NEVER || !lastCleaned) return null;
  const when = lastCleaned instanceof Date ? lastCleaned : new Date(lastCleaned);
  return Number.isNaN(when.getTime()) ? null : new Date(when.getTime() + hours * 3600000);
}

// Overdue = on a schedule and (never cleaned yet, or the next clean is past).
export function isCleaningOverdue(space, lastCleaned, now = Date.now()) {
  if (!needsCleaning(space)) return false;
  const next = nextCleanDue(space, lastCleaned);
  return !next || next.getTime() < now;
}

export const CLEANING_FREQUENCY_OPTIONS = [
  { hours: 0, label: "Never" },
  { hours: 8, label: "Every 8 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Daily" },
  { hours: 168, label: "Weekly" },
  { hours: 720, label: "Monthly" },
  { hours: 4320, label: "Every 6 months" },
  { hours: 8760, label: "Yearly" },
];

export function cleaningFrequencyLabel(hours) {
  const value = cleaningFrequencyHours(hours);
  return CLEANING_FREQUENCY_OPTIONS.find((o) => o.hours === value)?.label || `Every ${value} hours`;
}
