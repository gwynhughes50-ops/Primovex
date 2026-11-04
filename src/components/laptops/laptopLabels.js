import { getQrImageUrl } from "@/lib/qrCode";
import { buildLaptopLink } from "@/modules/laptops/laptops";

// The printable QR labels: one per laptop, holding a link that opens that laptop in Primovex when the phone's camera or the app's scanner reads it. Every value is escaped before it goes
// into the print document, because an asset code is typed by a person.
//
// The sticker sheet: A4, 14 stickers of 100 mm x 40.4 mm, two across and seven down, with no gaps between them, 7 mm of margin at the top and bottom and 5 mm at each side
// (7 + 7 x 40.4 + 7 = 296.8 mm of the 297 mm; 5 + 2 x 100 + 5 = 210 mm). Print at 100% ("actual size"), not "fit to page", or the labels drift off the stickers.
export const SHEET = { columns: 2, rows: 7, widthMm: 100, heightMm: 40.4, marginTopMm: 7, marginSideMm: 5 };
export const PER_SHEET = SHEET.columns * SHEET.rows;

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// guides: draw each sticker's outline, for a trial print on plain paper held up to a sheet of stickers. Leave off for the real sheet (an outline would print on the sticker's edge).
export function buildLabelsHtml(laptops = [], { origin, guides = false } = {}) {
  const label = (laptop) => `<div class="label"><img src="${getQrImageUrl(buildLaptopLink(laptop, origin), 300)}" alt=""/><div class="words"><b>${esc(laptop.assetCode)}</b><span>Primovex IT equipment</span><small>Scan to loan out, return or record an update</small></div></div>`;
  const pages = [];
  for (let i = 0; i < laptops.length; i += PER_SHEET) pages.push(laptops.slice(i, i + PER_SHEET));
  const body = pages.map((page) => `<section class="page">${page.map(label).join("")}</section>`).join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"/><title>Laptop QR labels</title><style>
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:296.8mm;padding:${SHEET.marginTopMm}mm ${SHEET.marginSideMm}mm;display:grid;grid-template-columns:repeat(${SHEET.columns},${SHEET.widthMm}mm);grid-auto-rows:${SHEET.heightMm}mm;overflow:hidden;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
.label{width:${SHEET.widthMm}mm;height:${SHEET.heightMm}mm;display:flex;align-items:center;gap:4mm;padding:3mm 4mm;overflow:hidden${guides ? ";outline:0.2mm dashed #666;outline-offset:-0.2mm" : ""}}
.label img{width:32mm;height:32mm;flex:none}.words{min-width:0}.words b{display:block;font:700 13pt Consolas,"Courier New",monospace;word-break:break-all}.words span{display:block;font-size:8pt;margin-top:1.5mm}.words small{display:block;font-size:7pt;color:#222;margin-top:1mm}
</style></head><body>${body}</body></html>`;
}
