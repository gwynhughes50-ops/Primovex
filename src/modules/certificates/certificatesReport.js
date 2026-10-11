// The certificates register on paper (A4): what, where, who, when done, when it runs out. For an inspector or a
// contractor. Pure: printed with printHtmlDocument.

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");

export function certificatesRegisterHtml(rows = [], { generatedOn = "" } = {}) {
  const body = rows.map((r) => `
      <tr class="${r.status === "Expired" || r.status === "No date" ? "bad" : r.status === "Running out" ? "warn" : ""}">
        <td><strong>${esc(r.what)}</strong></td><td>${esc(r.site)}</td><td>${esc(r.provider)}</td><td>${esc(r.reference)}</td>
        <td>${esc(uk(r.done))}</td><td>${esc(uk(r.expires))}</td><td>${esc(r.status)}</td><td>${r.hasPdf ? "Held" : "Missing"}</td>
      </tr>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Certificates and servicing register</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Arial,system-ui,sans-serif;color:#0f172a;font-size:11px}
h1{font-size:18px;margin:0 0 4px}
table{border-collapse:collapse;width:100%;margin-top:8px}
th,td{border:1px solid #94a3b8;padding:5px;text-align:left;vertical-align:top}
th{background:#e2e8f0}
tr{break-inside:avoid;page-break-inside:avoid}
tr.bad td{background:#fee2e2}
tr.warn td{background:#fef3c7}
@media print{.no-print{display:none}}
</style></head><body><p class="no-print">If nothing prints automatically, press Ctrl+P and choose Save as PDF as the printer.</p>
<h1>Certificates and servicing register</h1><div>${esc(generatedOn)}</div>
${rows.length ? `<table><thead><tr><th>Certificate or service</th><th>Site</th><th>Done by</th><th>Reference</th><th>Done</th><th>Runs out</th><th>Status</th><th>Certificate PDF</th></tr></thead><tbody>${body}</tbody></table>` : "<p>No certificates are on the register yet.</p>"}
</body></html>`;
}
