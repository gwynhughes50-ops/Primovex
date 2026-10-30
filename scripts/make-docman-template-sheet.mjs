// Writes the one-page setup sheet for the Docman Intellisense templates that recognise the ClinFlow summary page. Usage: node scripts/make-docman-template-sheet.mjs [output.pdf]
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { DOCMAN_ACTION_NONE, DOCMAN_ACTION_YES, DOCMAN_AVOID, DOCMAN_HEADING, DOCMAN_INTELLISENSE, DOCMAN_URGENT } from "../src/modules/clinflow/clinflowDocmanTemplates.js";

const out = process.argv[2] || "ClinFlow Docman Intellisense templates.pdf";
const pdf = new jsPDF({ unit: "mm", format: "a4" });
const margin = 16, width = 210 - margin * 2;
let y = 18;
const write = (text, { size = 10, bold = false, after = 1.6, indent = 0 } = {}) => {
  pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(0, 0, 0);
  const rows = pdf.splitTextToSize(String(text), width - indent);
  if (y + rows.length * (size * 0.42 + 1.3) > 280) { pdf.addPage(); y = 18; }
  pdf.text(rows, margin + indent, y);
  y += rows.length * (size * 0.42 + 1.3) + after;
};
const box = (label, value) => write(`${label}: ${value}`, { indent: 4, after: 0.8 });

write("ClinFlow summary: Docman Intellisense templates", { size: 16, bold: true, after: 3 });
write("For whoever has Docman administrator rights. Create each template under Settings > Filing > Intellisense templates > add a new one. Docman matches the Keywords against the text of the document while it is being filed, ignoring capitals, and the spelling and spacing must be exactly as below. Keep each keyword on one line.", { after: 4 });

write("What the ClinFlow summary page says", { size: 12, bold: true, after: 2 });
write(`Every summary page starts with the line "${DOCMAN_HEADING}". Under it, once the person has decided whether the practice has anything to do, one more line: "${DOCMAN_ACTION_YES}" or "${DOCMAN_ACTION_NONE}". If it has not been decided there is no line, so no template fires on a guess. A letter marked urgent also has the line "${DOCMAN_URGENT}".`, { after: 4 });

DOCMAN_INTELLISENSE.forEach((tpl, i) => {
  write(`Template ${i + 1}: ${tpl.name}`, { size: 12, bold: true, after: 2 });
  box("Description", tpl.description);
  box("Keywords", tpl.keywords.join("  |  "));
  box("Matching", `Any of the Keywords can match`);
  box("Organisation / Department / Person / Folder", "leave all four blank (see below)");
  box("Start Clinical Coding immediately after filing", tpl.options.startCoding ? "TICK" : "leave UNTICKED");
  box("Add Document link to EmisWeb", tpl.options.emisLink ? "TICK (your choice: tick it if you want every filed summary linked in EMIS)" : "leave unticked");
  box("Clinical Codes", "leave empty");
  box("Notes", tpl.notes);
  y += 3;
});

write("Why the folder, organisation, department, person and codes are left blank", { size: 12, bold: true, after: 2 });
write("A template can only fill in the same value every time. The folder, the organisation and the clinical codes depend on each letter, so they stay for the person filing it to choose, and the codes to add are listed on the summary page for the coder. These two templates save the click that starts clinical coding on letters that need it.", { after: 4 });

write("Do not use these as keywords", { size: 12, bold: true, after: 2 });
write(`${DOCMAN_AVOID.join(", ")}: they are headings on every summary, so a template would fire on all of them. Keep to the lines above.`, { after: 4 });

write("Try it", { size: 12, bold: true, after: 2 });
["File one ClinFlow test summary where the practice has something to do, and one where it has nothing to do.", "At the filing screen, check the first has Start Clinical Coding ticked and the second does not.", "If a template does not fire, check the keyword is typed exactly (including the colon and the single space after it) and that there is a space, not a line break, between the words.", "Docman's screens differ between versions. If a field has a different name on your system, tell us and we will change this sheet."].forEach((line, i) => write(`${i + 1}. ${line}`, { indent: 2, after: 1 }));

writeFileSync(out, Buffer.from(pdf.output("arraybuffer")));
console.log("written", out);
