import { buildPatLink } from "@/modules/pat/pat";
import { buildLabelsHtml, DEFAULT_SHEET, NUDGE_LIMIT_MM, SHEETS, perSheet } from "@/components/laptops/laptopLabels";

// The QR labels for PAT appliances: one per appliance, holding a link that opens that appliance in Primovex when a phone's camera or the app's scanner reads it, with its details, its test history
// and a Retest button. Printed the same way as the laptop and PC labels (same sticker sheets, same nudge), so one setting serves all three.
export { DEFAULT_SHEET, NUDGE_LIMIT_MM, SHEETS, perSheet };

export const PAT_LABEL = {
  docTitle: "PAT QR labels",
  linkOf: buildPatLink,
  titleOf: (asset) => asset.tag,
  subtitleOf: (asset) => [asset.name, asset.location].filter(Boolean).join(" · ") || "Primovex PAT testing",
  hint: "Scan for its test history and to retest",
};

export const buildPatLabelsHtml = (assets = [], options = {}) => buildLabelsHtml(assets, { ...options, kind: PAT_LABEL });
