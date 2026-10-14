// Builds the printable Primovex how-to guide (PDF) from the Help articles the Orb and the Help page use, so the guide is always
// the same words as the app.
//
//   node scripts/build-help-guide.mjs
//
// Writes docs/handouts/primovex-how-to-guide.html and, where Microsoft Edge is installed, the .pdf beside it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HELP_ARTICLES } from "../src/ai/help/helpArticles.js";
import { CAPABILITY_CATALOG } from "../src/core/identity/capabilities.js";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const OUT_HTML = resolve(ROOT, "docs/handouts/primovex-how-to-guide.html");
const OUT_PDF = resolve(ROOT, "docs/handouts/primovex-how-to-guide.pdf");

// The Help topics are grouped into the sections a person looks for, in this order.
const SECTIONS = [
  { title: "Stock", topics: ["Stock", "Inventory"] },
  { title: "Kits and boxes", topics: ["Kits and boxes"] },
  { title: "Fridges and temperature", topics: ["Fridges", "Temperature"] },
  { title: "Compliance and facilities", topics: ["Compliance", "Facilities"] },
  { title: "SARs, concerns and governance", topics: ["SARs and concerns", "Governance"] },
  { title: "Reports and inspections", topics: ["Reports"] },
  { title: "The Orb", topics: ["The Orb", "Orb"] },
  { title: "People, access and admin", topics: ["People and access", "Admin"] },
  { title: "Security", topics: ["Security"] },
];

const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// the Help text uses "quoted" button names; show them in bold
const rich = (text) => esc(text).replace(/&quot;([^&]+?)&quot;/g, "<b>&ldquo;$1&rdquo;</b>");
const labelOf = (id) => (CAPABILITY_CATALOG || []).find((c) => c.id === id)?.label || id;
const WHERE = { desktop: "On the desktop", phone: "On the phone", both: "Desktop and phone" };

const assigned = new Set();
const sections = SECTIONS.map((section) => {
  const articles = HELP_ARTICLES.filter((a) => section.topics.includes(a.topic));
  articles.forEach((a) => assigned.add(a.id));
  return { ...section, articles };
}).filter((s) => s.articles.length);
// anything with a topic not listed above still goes in, at the end, so nothing is left out of the guide
const leftover = HELP_ARTICLES.filter((a) => !assigned.has(a.id));
if (leftover.length) sections.push({ title: "More", topics: [], articles: leftover });

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const articleHtml = (a) => `
  <article class="art" id="a-${esc(a.id)}">
    <h3>${esc(a.title)}</h3>
    <p class="meta"><span class="where">${WHERE[a.where] || ""}</span>${a.needs ? ` <span class="needs">You need: ${esc(labelOf(a.needs))}</span>` : ""}</p>
    <ol>${a.steps.map((s) => `<li>${rich(s)}</li>`).join("")}</ol>
    ${a.tip ? `<p class="tip"><b>Good to know:</b> ${rich(a.tip)}</p>` : ""}
    ${a.open?.route ? `<p class="open">In the app: ${esc(a.open.label)} (${esc(a.open.route)})</p>` : ""}
  </article>`;

const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><title>Primovex how-to guide</title>
<style>
  @page { size: A4; margin: 15mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #14213d; margin: 0; }
  .cover { min-height: 255mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; break-after: page; }
  .cover img { height: 62px; margin-bottom: 26px; }
  .cover h1 { font-size: 34pt; margin: 0; color: #0b3b7a; }
  .cover .sub { font-size: 14pt; color: #4a5a78; margin-top: 8px; }
  .cover .note { margin-top: 36px; border-left: 4px solid #1fb5a8; padding: 4px 12px; color: #34445f; max-width: 125mm; }
  h2.section { font-size: 18pt; color: #0b3b7a; border-bottom: 3px solid #1fb5a8; padding-bottom: 3px; margin: 0 0 8px; break-before: page; }
  .toc { break-after: page; }
  .toc h2 { font-size: 18pt; color: #0b3b7a; border-bottom: 3px solid #1fb5a8; padding-bottom: 3px; margin: 0 0 8px; }
  .toc h3 { font-size: 11.5pt; margin: 10px 0 2px; color: #0b3b7a; }
  .toc ul { list-style: none; margin: 0; padding: 0; columns: 1; }
  .toc li { margin: 1px 0; font-size: 10pt; }
  .toc a { color: #14213d; text-decoration: none; }
  .art { break-inside: avoid; border: 1px solid #c9d4e8; border-radius: 8px; padding: 8px 12px 8px; margin: 0 0 10px; }
  .art h3 { margin: 0 0 3px; font-size: 12pt; color: #14213d; }
  .meta { margin: 0 0 4px; font-size: 9pt; color: #4a5a78; }
  .where { display: inline-block; background: #e6edf8; color: #0b3b7a; border-radius: 10px; padding: 0 8px; font-weight: 600; }
  .needs { margin-left: 6px; }
  ol { margin: 3px 0 3px 20px; padding: 0; }
  li { margin: 2px 0; }
  .tip { margin: 5px 0 2px; background: #eefaf8; border-radius: 6px; padding: 4px 8px; font-size: 9.8pt; }
  .open { margin: 4px 0 0; font-size: 9pt; color: #4a5a78; }
  .foot { margin-top: 14px; font-size: 9pt; color: #4a5a78; }
</style></head><body>

<section class="cover">
  <img src="../../public/branding/primovex-logo-approved.png" alt="Primovex">
  <h1>How to use Primovex</h1>
  <div class="sub">The step-by-step guide for the desktop and the phone</div>
  <div class="note">${HELP_ARTICLES.length} short guides on every part of Primovex, written from the app's own screens and buttons. Names in <b>&ldquo;quotes&rdquo;</b> are real menu items and buttons. You can also ask the Orb &ldquo;how do I&hellip;&rdquo; at any time, or open <b>Help</b> in the menu.<br><br>Produced ${today}. Never put a patient's name into Primovex: use the EMIS number or initials only.</div>
</section>

<section class="toc">
  <h2>Contents</h2>
  ${sections.map((s) => `<h3>${esc(s.title)}</h3><ul>${s.articles.map((a) => `<li><a href="#a-${esc(a.id)}">${esc(a.title)}</a></li>`).join("")}</ul>`).join("")}
</section>

${sections.map((s) => `<h2 class="section" id="s-${slug(s.title)}">${esc(s.title)}</h2>${s.articles.map(articleHtml).join("")}`).join("\n")}

<p class="foot">This guide is built from the Help in Primovex, so it matches the app. If a screen has changed since ${today}, the Help page in the app is always the latest.</p>
</body></html>`;

mkdirSync(dirname(OUT_HTML), { recursive: true });
writeFileSync(OUT_HTML, html, "utf8");
console.log(`${OUT_HTML}\n${HELP_ARTICLES.length} articles in ${sections.length} sections`);

const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
if (EDGE) {
  try {
    execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", `--print-to-pdf=${OUT_PDF}`, pathToFileURL(OUT_HTML).href], { stdio: "ignore", timeout: 120000 });
    console.log(OUT_PDF);
  } catch (error) {
    console.log("The PDF step failed:", error.message);
  }
} else {
  console.log("Microsoft Edge was not found, so only the HTML was written. Open it and print to PDF.");
}
