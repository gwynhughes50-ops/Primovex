// The printable result of a stock take (A4): what was counted where, by whom, what differed, and what was done about
// it. Evidence that the practice checks its stock. Pure: printed with printHtmlDocument.

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const KIND = { match: "Matched", difference: "Difference", unexpected: "Found, not recorded here", "not-counted": "Not counted" };

export function stockTakeReportHtml({ take, places, lines, additions, totals, printedBy = "", printedAt = new Date() }) {
  const when = printedAt.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const people = [...new Set(places.map((p) => p.claimedByName).filter(Boolean))];
  const rows = lines.filter((l) => l.kind !== "match").map((l) => `<tr>
      <td>${esc(l.placeName)}</td><td>${esc(l.itemLabel)}</td><td class="n">${l.counted === null ? "-" : esc(l.counted)}</td><td class="n">${esc(l.current)}</td>
      <td class="n">${l.kind === "unexpected" || l.kind === "not-counted" ? "" : `${l.change > 0 ? "+" : ""}${esc(l.change)}`}</td><td>${esc(KIND[l.kind])}${l.big ? " (large)" : ""}</td><td>${l.applied ? "Applied to stock" : "Not applied"}</td></tr>`).join("");
  const adds = additions.map((a) => `<tr><td>${esc(a.placeName)}</td><td>${esc(a.name)}</td><td class="n">${esc(a.quantity)}</td><td>${esc(a.addedByName)}</td><td>${a.status === "created" ? "Added to stock" : a.status === "dismissed" ? "Dismissed" : "Waiting"}</td></tr>`).join("");
  const placeRows = places.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.claimedByName || "-")}</td><td>${p.status === "done" ? "Done" : p.status === "claimed" ? "Being counted" : "Not started"}</td></tr>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Stock take: ${esc(take.title)}</title>
<style>
@page{size:A4;margin:14mm}
body{font-family:Arial,system-ui,sans-serif;color:#0f172a;font-size:11.5px;line-height:1.4}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:16px 0 6px;border-bottom:1px solid #94a3b8;padding-bottom:3px}
.meta{color:#475569;margin:4px 0 10px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e2e8f0}.n{text-align:right;white-space:nowrap}
tr{break-inside:avoid;page-break-inside:avoid}
@media print{.no-print{display:none}}
</style></head><body>
<p class="no-print">If nothing prints automatically, press Ctrl+P and choose Save as PDF as the printer.</p>
<h1>Stock take: ${esc(take.title)}</h1>
<p class="meta">Requested by ${esc(take.createdByName || "unknown")}${take.dueDate ? `, due ${esc(take.dueDate.split("-").reverse().join("/"))}` : ""}. Counted by ${esc(people.join(", ") || "nobody yet")}. Printed ${esc(when)}${printedBy ? ` by ${esc(printedBy)}` : ""}.</p>
<p>${esc(places.length)} places; ${esc(totals.matched)} items matched the records, ${esc(totals.differences)} differed, ${esc(totals.unexpected)} found where not recorded, ${esc(totals.notCounted)} not counted; ${esc(totals.applied)} applied to stock.</p>
<h2>Places</h2>
<table><thead><tr><th>Place</th><th>Counted by</th><th>Status</th></tr></thead><tbody>${placeRows}</tbody></table>
<h2>Differences and findings</h2>
${rows ? `<table><thead><tr><th>Place</th><th>Item</th><th>Counted</th><th>Recorded</th><th>Difference</th><th>Result</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>Every counted item matched the records.</p>"}
${adds ? `<h2>Items found that were not in the system</h2><table><thead><tr><th>Place</th><th>Item</th><th>Quantity</th><th>Found by</th><th>Result</th></tr></thead><tbody>${adds}</tbody></table>` : ""}
</body></html>`;
}
