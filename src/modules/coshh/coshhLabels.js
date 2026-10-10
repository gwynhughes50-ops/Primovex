// The label to stick on a storage cupboard: its name, a QR code that opens the list of what is kept inside (with
// the protective equipment and first aid for each) on a phone, and a reminder of the golden rule. Pure (the link
// and the QR image are passed in) so it can be tested; printed from Compliance > COSHH with printHtmlDocument.

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// places: [{ key, site, location, count }]; urlFor(place) is the link in the QR; qrFor(link) is an image src.
export function coshhLabelsHtml(places = [], { urlFor, qrFor } = {}) {
  const cards = places.map((place) => {
    const link = urlFor(place);
    return `
      <section class="label">
        <div class="brand">PRIMOVEX \u00b7 COSHH</div>
        <img alt="QR code: scan to see what is kept in ${escapeHtml(place.location)}" src="${escapeHtml(qrFor(link))}" />
        <div class="name">${escapeHtml(place.location)}</div>
        <div class="site">${escapeHtml(place.site)}</div>
        <div class="how">Scan to see what is kept here, what to wear and what to do if there is a spill or splash</div>
        <div class="count">${place.count} product${place.count === 1 ? "" : "s"} listed</div>
      </section>`;
  }).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Primovex COSHH cupboard labels</title>
<style>
body{font-family:Arial,system-ui,sans-serif;margin:16px;color:#0f172a}
.grid{display:grid;grid-template-columns:repeat(2,88mm);gap:10mm}
.label{border:1px solid #94a3b8;border-radius:12px;padding:10px;text-align:center;break-inside:avoid;page-break-inside:avoid}
.brand{font-size:10px;font-weight:700;letter-spacing:.14em;color:#475569}
.label img{width:52mm;height:52mm;margin:6px auto;display:block}
.name{font-size:18px;font-weight:800}
.site{font-size:12px;color:#475569}
.how{margin-top:4px;font-size:12px;font-weight:700}
.count{font-size:12px;color:#475569}
@media print{.no-print{display:none}body{margin:8mm}}
</style></head><body><p class="no-print">If nothing prints automatically, press Ctrl+P.</p><div class="grid">${cards}</div></body></html>`;
}

// the register itself on paper, for the inspector or a folder by the cupboard
export function coshhRegisterHtml(rows = [], { generatedOn = "" } = {}) {
  const body = rows.map((r) => `
      <tr>
        <td><strong>${escapeHtml(r.name)}</strong><br/>${escapeHtml(r.supplier)}</td>
        <td>${escapeHtml(r.hazards)}</td>
        <td>${escapeHtml(r.ppe)}</td>
        <td>${escapeHtml(r.firstAid)}</td>
        <td>${escapeHtml(r.place)}</td>
        <td>${escapeHtml(r.review)}</td>
      </tr>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>COSHH register</title>
<style>
body{font-family:Arial,system-ui,sans-serif;margin:16px;color:#0f172a;font-size:11px}
h1{font-size:18px;margin:0 0 4px}
table{border-collapse:collapse;width:100%;margin-top:8px}
th,td{border:1px solid #94a3b8;padding:5px;text-align:left;vertical-align:top}
th{background:#e2e8f0}
tr{break-inside:avoid;page-break-inside:avoid}
@media print{.no-print{display:none}body{margin:8mm}}
</style></head><body><p class="no-print">If nothing prints automatically, press Ctrl+P.</p>
<h1>COSHH register</h1><div>${escapeHtml(generatedOn)}</div>
<table><thead><tr><th>Product and supplier</th><th>Hazards</th><th>Protective equipment</th><th>First aid</th><th>Stored</th><th>Review</th></tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}
