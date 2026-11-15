import { buildComputerLink } from "@/modules/computers/computers";
import { buildLabelsHtml, DEFAULT_SHEET, NUDGE_LIMIT_MM, SHEETS, perSheet } from "@/components/laptops/laptopLabels";

// The QR labels for PCs: one per PC, holding a link that opens that PC in Primovex when a phone's camera or the app's scanner reads it, so the IT team can scan each PC as they go round and
// record a check. Printed the same way as the laptop labels (same sticker sheets, same nudge), so one setting serves both.
export { DEFAULT_SHEET, NUDGE_LIMIT_MM, SHEETS, perSheet };

export const COMPUTER_LABEL = {
  docTitle: "PC QR labels",
  linkOf: buildComputerLink,
  titleOf: (pc) => `PC ${pc.assetNumber}`,
  subtitleOf: (pc) => [pc.department, pc.label].filter(Boolean).join(" · ") || "Primovex IT equipment",
  hint: "Scan to check this PC",
};

export const buildComputerLabelsHtml = (computers = [], options = {}) => buildLabelsHtml(computers, { ...options, kind: COMPUTER_LABEL });
