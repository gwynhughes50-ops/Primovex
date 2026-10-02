// Option lists for the stock item forms (Add item / Edit item), so Form, Site
// and Location are picked from what the practice already has rather than typed.

// Common UK primary-care presentations. The list a practice actually uses grows
// from this: any form already on a stock item is added to the dropdown too.
export const STOCK_FORMS = [
  "Tablets",
  "Capsules",
  "Oral solution",
  "Oral suspension",
  "Injection",
  "Ampoule",
  "Pre-filled syringe",
  "Auto-injector",
  "Vial",
  "Inhaler",
  "Nebuliser solution",
  "Cream",
  "Ointment",
  "Gel",
  "Eye drops",
  "Ear drops",
  "Nasal spray",
  "Patch",
  "Suppository",
  "Pessary",
  "Sachet",
  "Powder",
  "Dressing",
  "Device",
  "Pack",
  "Each",
];

// The standard forms, plus any already used on existing stock items, plus the
// current value if it matches neither (an older typed value) so opening a form
// can never silently wipe it. Matching is case-insensitive; the first spelling
// seen wins so "tablets" on an old item doesn't duplicate "Tablets".
export function buildFormOptions(existingForms = [], current = "") {
  const seen = new Map();
  const add = (raw) => {
    const value = String(raw || "").trim();
    if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  };
  STOCK_FORMS.forEach(add);
  existingForms.forEach(add);
  add(current);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// Value to select for `current` - the option that matches it ignoring case.
export function matchOption(options, current) {
  const target = String(current || "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === target) || "";
}

// Names for a Site / Location dropdown: the real names, plus the current value
// if it isn't one of them (kept rather than wiped).
export function namesWithCurrent(names = [], current = "") {
  const clean = names.filter(Boolean);
  const value = String(current || "").trim();
  return value && !clean.includes(value) ? [value, ...clean] : clean;
}
