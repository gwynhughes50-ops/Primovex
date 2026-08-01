const STRENGTH_UNIT_PATTERN = /(\d)\s*(micrograms?|mcg|ug|mg|kg|g|ml|mmol|units?)(?=\b|\/)/gi;

export function formatProductStrength(value) {
  if (value == null) return "";
  return String(value).trim().replace(STRENGTH_UNIT_PATTERN, "$1 $2").replace(/\s+/g, " ");
}

export function formatProductSubtitle(item) {
  return [formatProductStrength(item?.strength), item?.form]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean)
    .join(" • ");
}