import { LIGHT, STATUS, STATUS_LABEL, tally } from "./training.js";

// The training matrix on paper: one row per person, one column per course, each cell coloured and showing the date it runs out.
// Landscape, small type. Pure (returns HTML) so it can be tested; the page prints it with printHtmlDocument.

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const uk = (key) => (key ? key.split("-").reverse().join("/") : "");
const COLOUR = { green: "#c6efce", amber: "#ffeb9c", red: "#ffc7ce", blue: "#cfe2f3", purple: "#e1d5f0", grey: "#f3f3f3" };
const WORD = { [STATUS.notRequired]: "n/r", [STATUS.onLeave]: "away" };

export function matrixHtml({ matrix, courses, title = "Staff training matrix", printedBy = "", now = new Date() }) {
  const all = tally(matrix.flatMap((row) => row.cells));
  const head = courses.map((c) => `<th><div>${esc(c.name)}</div></th>`).join("");
  const body = matrix.map((row) => `<tr><th class="who">${esc(row.person.name)}<small>${esc(row.person.jobRole)}</small></th>${row.cells.map((cell) => `<td style="background:${COLOUR[LIGHT[cell.status]]}" title="${esc(STATUS_LABEL[cell.status])}">${esc(WORD[cell.status] || (cell.due ? uk(cell.due) : cell.status === STATUS.inDate ? "done" : ""))}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A3 landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 8pt; color: #14213d; }
    h1 { font-size: 15pt; margin: 0 0 2px; } .sub { color: #4a5a78; margin-bottom: 6px; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #b9c6dc; padding: 2px 3px; text-align: center; }
    thead th { background: #e6edf8; vertical-align: bottom; height: 90px; } thead th div { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; margin: 0 auto; }
    th.who { text-align: left; white-space: nowrap; background: #f5f7fb; } th.who small { display: block; color: #4a5a78; font-weight: normal; }
    .key span { display: inline-block; padding: 1px 8px; border: 1px solid #b9c6dc; margin-right: 6px; }
  </style></head><body>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}${printedBy ? ` · printed by ${esc(printedBy)}` : ""} · ${all.dated ? `${all.percentInDate}% of dated entries in date` : "nothing dated yet"}: ${all[STATUS.inDate]} in date, ${all[STATUS.dueSoon]} due soon, ${all[STATUS.overdue]} overdue</div>
  <div class="key">${[STATUS.inDate, STATUS.dueSoon, STATUS.overdue, STATUS.notRequired, STATUS.onLeave, STATUS.none].map((s) => `<span style="background:${COLOUR[LIGHT[s]]}">${esc(STATUS_LABEL[s])}</span>`).join("")} Cells show the date each runs out.</div>
  <table><thead><tr><th class="who">Person</th>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`;
}
