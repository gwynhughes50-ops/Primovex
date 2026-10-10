// The label to stick on a fridge: its name, a QR code that opens that fridge's temperature check on the phone,
// and the safe range. Pure (the link and the QR image are passed in), so it can be tested; printed from
// Temperature > Fridges with printHtmlDocument.

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const temp = (n) => (Number.isFinite(Number(n)) ? `${Number(n)}\u00b0C` : "");

// units: [{ id, name, siteId, type, range: { min, max } }]; urlFor(unit) is the link in the QR; qrFor(link) is an image src.
export function fridgeLabelsHtml(units = [], { sites = [], urlFor, qrFor } = {}) {
  const cards = units.map((unit) => {
    const link = urlFor(unit);
    const site = sites.find((s) => s.id === unit.siteId)?.name || "";
    return `
      <section class="label">
        <div class="brand">PRIMOVEX \u00b7 FRIDGE CHECK</div>
        <img alt="QR code: scan to record the temperature of ${escapeHtml(unit.name)}" src="${escapeHtml(qrFor(link))}" />
        <div class="name">${escapeHtml(unit.name)}</div>
        <div class="site">${escapeHtml(site)}</div>
        <div class="how">Scan to record the temperature</div>
        <div class="range">Safe range ${escapeHtml(temp(unit.range?.min))} to ${escapeHtml(temp(unit.range?.max))}</div>
      </section>`;
  }).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Primovex fridge labels</title>
<style>
body{font-family:Arial,system-ui,sans-serif;margin:16px;color:#0f172a}
.grid{display:grid;grid-template-columns:repeat(2,88mm);gap:10mm}
.label{border:1px solid #94a3b8;border-radius:12px;padding:10px;text-align:center;break-inside:avoid;page-break-inside:avoid}
.brand{font-size:10px;font-weight:700;letter-spacing:.14em;color:#475569}
.label img{width:52mm;height:52mm;margin:6px auto;display:block}
.name{font-size:18px;font-weight:800}
.site{font-size:12px;color:#475569}
.how{margin-top:4px;font-size:13px;font-weight:700}
.range{font-size:12px;color:#475569}
@media print{.no-print{display:none}body{margin:8mm}}
</style></head><body><p class="no-print">If nothing prints automatically, press Ctrl+P.</p><div class="grid">${cards}</div></body></html>`;
}
