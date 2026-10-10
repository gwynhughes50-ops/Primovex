// The printable inspection summary (A4). Pure: takes the report from buildReport and returns an HTML document, which
// printHtmlDocument prints; the print dialog's "Save as PDF" gives the PDF.

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export const STATUS_LABEL = { ok: "Evidence in place", attention: "Needs attention", none: "Nothing recorded", unavailable: "Not shown" };

const when = (date) => date.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function inspectionHtml(report, { practiceName = "" } = {}) {
  const { visit, sections, gaps, preparedBy, preparedAt } = report;
  const glance = sections.map((s) => `<tr><td>${esc(s.title)}</td><td><span class="pill ${esc(s.status)}">${esc(STATUS_LABEL[s.status])}</span></td><td>${esc(s.headline)}</td></tr>`).join("");
  const gapList = gaps.length
    ? `<ul>${gaps.map((g) => `<li><strong>${esc(g.section)}:</strong> ${esc(g.text)}</li>`).join("")}</ul>`
    : "<p>Nothing is flagged. Every area above with records is in date.</p>";
  const detail = sections.map((s) => `
    <section class="area">
      <h3>${esc(s.title)} <span class="pill ${esc(s.status)}">${esc(STATUS_LABEL[s.status])}</span></h3>
      <p>${esc(s.headline)}</p>
      ${s.rows.length ? `<table class="rows"><tbody>${s.rows.map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`).join("")}</tbody></table>` : ""}
    </section>`).join("");
  const outside = (visit.outside || []).map((o) => `<li>${esc(o)}</li>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${esc(visit.label)} - evidence summary</title>
<style>
@page{size:A4;margin:14mm}
body{font-family:Arial,system-ui,sans-serif;color:#0f172a;font-size:11.5px;line-height:1.4}
h1{font-size:20px;margin:0}
h2{font-size:14px;margin:16px 0 6px;border-bottom:1px solid #94a3b8;padding-bottom:3px}
h3{font-size:13px;margin:0 0 4px}
.meta{color:#475569;margin:4px 0 10px}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#e2e8f0}
.num{width:30%;font-weight:700}
.rows td:first-child{width:70%}
.pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:10px;font-weight:700;border:1px solid #94a3b8}
.pill.ok{background:#dcfce7;border-color:#16a34a;color:#14532d}
.pill.attention{background:#fee2e2;border-color:#dc2626;color:#7f1d1d}
.pill.none{background:#fef3c7;border-color:#d97706;color:#78350f}
.pill.unavailable{background:#f1f5f9;color:#475569}
.area{break-inside:avoid;page-break-inside:avoid;margin:0 0 10px}
.note{color:#475569;font-size:10.5px;margin-top:14px}
ul{margin:4px 0 4px 18px;padding:0}
@media print{.no-print{display:none}}
</style></head><body>
<p class="no-print">If nothing prints automatically, press Ctrl+P and choose Save as PDF as the printer.</p>
<h1>${esc(visit.label)}: evidence summary</h1>
<p class="meta">${practiceName ? `${esc(practiceName)} &middot; ` : ""}Prepared ${esc(when(preparedAt))}${preparedBy ? ` by ${esc(preparedBy)}` : ""} from Primovex records. Covers the last 12 months unless a line says otherwise.</p>

<h2>At a glance</h2>
<table><thead><tr><th>Area</th><th>Status</th><th>What the records show</th></tr></thead><tbody>${glance}</tbody></table>

<h2>To put right before the visit</h2>
${gapList}

<h2>The detail</h2>
${detail}

<h2>Held outside Primovex (bring separately)</h2>
<ul>${outside}</ul>

<p class="note">This is a summary of what Primovex holds, to show that checks are happening. The full records (who checked what, when, and the readings) are in Primovex. Concerns, subject access requests and significant events are shown as counts only. "Evidence in place" means records exist and are in date against the usual frequency (weekly fire tests, monthly water checks, cleaning in the last week, and so on); it is not a statement of compliance.</p>
</body></html>`;
}
