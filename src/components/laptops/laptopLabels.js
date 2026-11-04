import { getQrImageUrl } from "@/lib/qrCode";
import { buildLaptopLink } from "@/modules/laptops/laptops";

// The printable QR labels: one per laptop, holding a link that opens that laptop in Primovex when the phone's camera or the app's scanner reads it. Every value is escaped before it goes
// into the print document, because an asset code is typed by a person.
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function buildLabelsHtml(laptops = [], { origin } = {}) {
  const labels = laptops.map((laptop) => `<div class="label"><img src="${getQrImageUrl(buildLaptopLink(laptop, origin), 200)}" alt=""/><div><b>${esc(laptop.assetCode)}</b><small>Scan to loan or return</small></div></div>`).join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"/><title>Laptop QR labels</title><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#000}
.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.label{display:flex;align-items:center;gap:3mm;border:1px dashed #666;padding:3mm;height:34mm;page-break-inside:avoid}
.label img{width:26mm;height:26mm}.label b{display:block;font:700 11pt Consolas,monospace;word-break:break-all}.label small{display:block;font-size:7pt;color:#333;margin-top:1mm}
</style></head><body><div class="sheet">${labels}</div></body></html>`;
}
