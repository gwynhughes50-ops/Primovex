import { getQrImageUrl } from "@/lib/qrCode";
import { buildLaptopLink } from "@/modules/laptops/laptops";

// The printable QR labels: one per laptop, holding a link that opens that laptop in Primovex when the phone's camera or the app's scanner reads it. Every value is escaped before it goes
// into the print document, because an asset code is typed by a person.
//
// The sticker sheets it can print on (all A4). Measurements are in millimetres: the label's size, the margin from the paper's top and left edge to the first label, and the gap
// between labels. Print at 100% ("actual size"), not "fit to page", or the labels drift off the stickers.
//   l7162  Avery L7162 (also Herma/other "99.1 x 33.9" sheets): 16 labels, 2 across x 8 down, 99.1 x 33.9 mm, 12.9 mm top, 4.65 mm sides, 2.5 mm between the columns, none between rows.
//   wide14 the first 14-up sheet tried: 14 labels, 2 across x 7 down, 100 x 40.4 mm, 7 mm top and bottom, 5 mm sides, no gaps.
export const SHEETS = {
  l7162: { name: "Avery L7162 (16 per sheet, 99.1 x 33.9 mm)", columns: 2, rows: 8, widthMm: 99.1, heightMm: 33.9, marginTopMm: 12.9, marginLeftMm: 4.65, columnGapMm: 2.5, rowGapMm: 0 },
  wide14: { name: "14 per sheet, 100 x 40.4 mm, no gaps", columns: 2, rows: 7, widthMm: 100, heightMm: 40.4, marginTopMm: 7, marginLeftMm: 5, columnGapMm: 0, rowGapMm: 0 },
};
export const DEFAULT_SHEET = "l7162";
export const perSheet = (key = DEFAULT_SHEET) => (SHEETS[key] || SHEETS[DEFAULT_SHEET]).columns * (SHEETS[key] || SHEETS[DEFAULT_SHEET]).rows;
export const NUDGE_LIMIT_MM = 5;

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// a nudge is a small number of millimetres, kept to a sensible range (a typed value never reaches the style unchecked)
const nudge = (value) => { const n = Number(value); return Number.isFinite(n) ? Math.max(-NUDGE_LIMIT_MM, Math.min(NUDGE_LIMIT_MM, Math.round(n * 10) / 10)) : 0; };

// guides: draw each sticker's outline, for a trial print on plain paper held up to a sheet of stickers. Leave off for the real sheet (an outline would print on the sticker's edge).
// nudgeXMm / nudgeYMm: move everything right / down by that much, to cancel the printer's own offset.
export function buildLabelsHtml(laptops = [], { origin, guides = false, sheet = DEFAULT_SHEET, nudgeXMm = 0, nudgeYMm = 0 } = {}) {
  const s = SHEETS[sheet] || SHEETS[DEFAULT_SHEET];
  const per = s.columns * s.rows;
  const qr = Math.round((s.heightMm - 5) * 10) / 10;
  const left = Math.round((s.marginLeftMm + nudge(nudgeXMm)) * 100) / 100;
  const top = Math.round((s.marginTopMm + nudge(nudgeYMm)) * 100) / 100;
  const label = (laptop) => `<div class="label"><img src="${getQrImageUrl(buildLaptopLink(laptop, origin), 300)}" alt=""/><div class="words"><b>${esc(laptop.assetCode)}</b><span>Primovex IT equipment</span><small>Scan to loan out, return or record an update</small></div></div>`;
  const pages = [];
  for (let i = 0; i < laptops.length; i += per) pages.push(laptops.slice(i, i + per));
  const body = pages.map((page) => `<section class="page"><div class="grid">${page.map(label).join("")}</div></section>`).join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"/><title>Laptop QR labels</title><style>
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;width:210mm;height:296.8mm;overflow:hidden;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
.grid{position:absolute;left:${left}mm;top:${top}mm;display:grid;grid-template-columns:repeat(${s.columns},${s.widthMm}mm);grid-auto-rows:${s.heightMm}mm;column-gap:${s.columnGapMm}mm;row-gap:${s.rowGapMm}mm}
.label{width:${s.widthMm}mm;height:${s.heightMm}mm;display:flex;align-items:center;gap:3mm;padding:2mm 3mm;overflow:hidden${guides ? ";outline:0.2mm dashed #666;outline-offset:-0.2mm" : ""}}
.label img{width:${qr}mm;height:${qr}mm;flex:none}.words{min-width:0}.words b{display:block;font:700 12pt Consolas,"Courier New",monospace;word-break:break-all}.words span{display:block;font-size:8pt;margin-top:1mm}.words small{display:block;font-size:7pt;color:#222;margin-top:.8mm}
</style></head><body>${body}</body></html>`;
}
