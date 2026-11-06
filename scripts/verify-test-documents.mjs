import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { DOCUMENTS, SAMPLE_FOOTER, emailText, plainText } from "./test-documents.mjs";
import { cleanOptions, datesIn, judgeCheck as serverJudge, norm, verifyExtraction } from "../functions/services/documentIntakeService.js";
import { judgeCheck as appJudge } from "../src/modules/certificates/certificates.js";
import { CERT_TYPES } from "../src/modules/certificates/certificates.js";
import { FIRST_AID_OPTIONS, HAZARD_TYPES, PPE_OPTIONS } from "../src/modules/coshh/coshh.js";
import { intakeOptions } from "../src/modules/documents/documentIntake.js";
import { parseEml, pickAttachment } from "../src/modules/documents/emailParser.js";
import { fileProblem, prepareFile } from "../src/modules/documents/documentIntakeService.js";

let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`); };
const OPTIONS = cleanOptions(intakeOptions());
const withText = DOCUMENTS.filter((d) => (d.blocks || []).length);
const quoteOf = (e) => (typeof e === "string" ? e : e?.quote || "");

await t("there is one test file for each of the cases, with unique names, every one a made-up document", () => {
  assert.equal(new Set(DOCUMENTS.map((d) => d.file)).size, DOCUMENTS.length);
  assert.ok(DOCUMENTS.length >= 20);
  for (const d of DOCUMENTS) assert.ok(d.tests && d.tests.length > 20, `${d.file} says what it tests`);
  assert.match(SAMPLE_FOOTER, /made-up document.*Not a real certificate/);
  const text = withText.map(plainText).join("\n");
  assert.doesNotMatch(text, /Gas Safe Register|NHS England|Care Quality Commission|HSE\b|NICEIC|NAPIT|Ministry/i, "no real body is named");
  assert.ok(withText.filter((d) => d.kind === "certificate").every((d) => /invented/i.test(plainText(d)) || /Mold, CH7 0XX \(invented address\)/.test(plainText(d))), "each says its address is invented");
});

await t("every answer in the answer sheet is really written on the page it belongs to, and every date is read the way the answer says", () => {
  for (const d of withText) {
    const page = norm(plainText(d));
    const e = d.expected || {};
    const check = (what, quote) => assert.ok(quote && page.includes(norm(quote)), `${d.file}: "${quote}" (${what}) is not on the page`);
    if (d.kind === "certificate") {
      check("done by", e.provider);
      check("reference", e.reference);
      check("date done", e.completedOn?.quote);
      assert.ok(datesIn(e.completedOn.quote).includes(e.completedOn.iso), `${d.file}: done date`);
      if (e.expiryDate) { check("expiry", e.expiryDate.quote); assert.ok(datesIn(e.expiryDate.quote).includes(e.expiryDate.iso), `${d.file}: expiry`); }
      else assert.ok(!/next|due|valid until|expir/i.test(plainText(d).replace(/Premises.*/s, "")), `${d.file}: has no expiry written`);
      assert.ok(CERT_TYPES.some((c) => c.key === e.type), `${d.file}: type ${e.type} is a real kind`);
      if (e.engineer) check("engineer", e.engineer.quote);
      for (const c of e.findings || []) { check(`check ${c.label}`, c.quote); assert.ok(norm(c.quote).includes(norm(c.answer)), `${d.file}: the answer ${c.answer} is in its quote`); }
    }
    if (d.kind === "coshh") {
      check("product", e.productName.quote);
      check("supplier", e.supplier.quote);
      for (const list of [e.hazards, e.ppe, e.firstAid]) for (const p of list) check(`pick ${p.key}`, p.quote);
      for (const h of e.hazards) assert.ok(HAZARD_TYPES.some((x) => x.key === h.key), h.key);
      for (const h of e.ppe) assert.ok(PPE_OPTIONS.some((x) => x.key === h.key), h.key);
      for (const h of e.firstAid) assert.ok(FIRST_AID_OPTIONS.some((x) => x.key === h.key), h.key);
      if (e.notHazardous) check("not hazardous", e.notHazardous);
    }
  }
});

await t("a perfect reading of every certificate verifies completely (and the document with conflicting dates is flagged)", () => {
  for (const d of withText.filter((x) => x.kind === "certificate")) {
    const e = d.expected;
    const issuerLine = d.blocks.find((b) => b.t === "title").text;
    const titleLine = d.blocks.find((b) => b.t === "h").text;
    const rowOf = (needle) => d.blocks.find((b) => b.text?.includes(needle))?.text;
    const model = { certificate: {
      type: { value: e.type, evidence: titleLine },
      provider: { value: e.provider, evidence: issuerLine },
      reference: { value: e.reference, evidence: rowOf(e.reference) },
      completedOn: { value: e.completedOn.iso, evidence: e.completedOn.quote },
      expiryDate: e.expiryDate ? { value: e.expiryDate.iso, evidence: e.expiryDate.quote } : { value: null, evidence: null },
      premises: { value: "Main Surgery", evidence: rowOf("Premises") },
      engineer: e.engineer ? { value: e.engineer.value, evidence: e.engineer.quote } : { value: null, evidence: null },
      // the AI is deliberately wrong about 'problem' (the opposite of the truth) to show the rule decides, not the AI
      findings: (e.findings || []).map((c) => ({ label: c.label, answer: c.answer, problem: !c.problem, evidence: c.quote })),
    } };
    const out = verifyExtraction({ parsed: model, ocrText: plainText(d), kind: "certificate", options: OPTIONS });
    const f = out.fields;
    if (e.warning) {
      assert.match(out.warnings[0], new RegExp(e.warning), `${d.file}: warned`);
      assert.equal(f.completedOn.verified, false);
      assert.equal(f.expiryDate.verified, false);
      continue;
    }
    for (const name of ["type", "provider", "reference", "completedOn", "premises"]) assert.equal(f[name].verified, true, `${d.file}: ${name}`);
    if (e.engineer) { assert.equal(f.engineer.value, e.engineer.value, d.file); assert.equal(f.engineer.verified, true, `${d.file}: engineer`); }
    assert.deepEqual(f.findings.map((c) => [c.label, c.answer, c.problem, c.verified]), (e.findings || []).map((c) => [c.label, c.answer, c.problem, true]), `${d.file}: the checks, each judged by the rule and confirmed by its quote`);
    const unsafe = (e.findings || []).some((c) => c.problem);
    assert.equal(out.warnings.some((w) => /failed or unsafe result/.test(w)), unsafe, `${d.file}: warned only when a check is a problem`);
    assert.equal(f.expiryDate.verified, Boolean(e.expiryDate), `${d.file}: expiry`);
    if (!unsafe) assert.deepEqual(out.warnings, [], d.file);
  }
});

await t("the app and the server judge every answer the same way, so a check is a problem on the form exactly when the server said it was", () => {
  const labels = ["Boiler safe to use", "Boiler: safe to use", "Gas supply tightness test", "Panel fault found", "Defects found", "Defects requiring action", "Gas leak found", "Overall assessment", "Carbon monoxide alarm fitted", "Smoke alarm tested", "Flue and ventilation satisfactory", "Appliance", ""];
  const answers = ["Yes", "YES", "No", "NO", "Pass", "Passed", "Fail", "Failed", "Satisfactory", "Satisfactory with advisories", "Unsatisfactory", "Safe", "Unsafe", "Not safe to use", "None", "N/A", "14", "Immediately dangerous", "Potentially dangerous", ""];
  for (const l of labels) for (const a of answers) for (const m of [null, true, false]) assert.equal(appJudge(l, a, m), serverJudge(l, a, m), `${l} / ${a} / ${m}`);
});

await t("a perfect reading of every safety data sheet verifies completely, and the 'not hazardous' sheet is believed only for its own words", () => {
  for (const d of withText.filter((x) => x.kind === "coshh")) {
    const e = d.expected;
    const model = { coshh: {
      productName: { value: e.productName.quote.replace("Product name: ", ""), evidence: e.productName.quote },
      supplier: { value: e.supplier.quote.replace("Supplier: ", ""), evidence: e.supplier.quote },
      hazards: e.hazards.map((p) => ({ key: p.key, evidence: p.quote })),
      notHazardous: e.notHazardous ? { value: true, evidence: e.notHazardous } : { value: false, evidence: null },
      ppe: e.ppe.map((p) => ({ key: p.key, evidence: p.quote })),
      firstAid: e.firstAid.map((p) => ({ key: p.key, evidence: p.quote })),
    } };
    const out = verifyExtraction({ parsed: model, ocrText: plainText(d), kind: "coshh", options: OPTIONS });
    assert.equal(out.fields.productName.verified, true, d.file);
    assert.equal(out.fields.supplier.verified, true, d.file);
    for (const list of ["hazards", "ppe", "firstAid"]) assert.deepEqual(out.fields[list].filter((p) => !p.verified), [], `${d.file}: ${list}`);
    assert.deepEqual(out.fields.hazards.map((h) => h.key), e.hazards.map((h) => h.key), `${d.file}: hazards`);
    assert.equal(out.fields.notHazardous.value, Boolean(e.notHazardous), d.file);
  }
});

// ---------- the files the maker writes ----------
const dir = mkdtempSync(path.join(os.tmpdir(), "primovex-test-docs-"));
const run = spawnSync(process.execPath, ["scripts/make-test-documents.mjs", dir], { encoding: "utf8", timeout: 120000 });
const files = readdirSync(dir);
const read = (name) => readFileSync(path.join(dir, name));
const asFile = (name, type = "") => new File([read(name)], name, { type });

await t("the maker writes every file, the answer sheet and the guide (the photo needs Edge and is skipped without it)", () => {
  assert.equal(run.status, 0, run.stderr);
  for (const d of DOCUMENTS.filter((x) => x.format !== "photo-png")) assert.ok(files.includes(d.file), d.file);
  assert.ok(files.includes("ANSWERS.csv") && files.includes("READ ME FIRST.txt"));
  const csv = read("ANSWERS.csv").toString("utf8");
  assert.equal(csv.trim().split("\r\n").length, DOCUMENTS.length + 1, "one row for each file");
  assert.match(csv, /GSR-48213/);
  assert.match(csv, /2027-10-30/, "the suggested expiry for the file with none written");
  assert.match(read("READ ME FIRST.txt").toString("utf8"), /Document reading > Only me/);
});

await t("the Word, Excel, text and email files contain the answers in their own text, and every file says it is made up", () => {
  const word = unzipSync(read("17-fire-risk-assessment-review-WORD.docx"));
  const wordText = Buffer.from(word["word/document.xml"]).toString("utf8");
  assert.match(wordText, /Date of review: 19 October 2026/);
  assert.match(wordText, /SAMPLE: a made-up document/);
  const sheet = Buffer.from(unzipSync(read("21-emergency-lighting-test-log.xlsx"))["xl/worksheets/sheet1.xml"]).toString("utf8");
  assert.match(sheet, /Certificate number: EL-70555/);
  assert.match(sheet, /SAMPLE: a made-up document/);
  const txt = read("20-pasted-insurance-renewal-2027.txt").toString("utf8");
  assert.match(txt, /Policy end date: 31\/12\/2027/);
  assert.match(txt, /SAMPLE: a made-up document/);
  const eml = read("19-email-text-only-NO-ATTACHMENT.eml").toString("utf8");
  assert.equal(eml, emailText(DOCUMENTS.find((d) => d.file.startsWith("19-"))));
  assert.match(eml, /Next re-inspection due: 12 October 2027/);
});

await t("the email with an attachment gives the lift report and ignores the logo; the text-only email gives its text", async () => {
  const mail = parseEml(read("18-email-from-contractor-WITH-PDF-ATTACHED.eml"));
  assert.deepEqual(mail.attachments.map((a) => a.name), ["company-logo.png", "07-lift-inspection-LOLER.pdf"]);
  assert.equal(pickAttachment(mail.attachments).name, "07-lift-inspection-LOLER.pdf");
  assert.deepEqual(Buffer.from(pickAttachment(mail.attachments).bytes), read("07-lift-inspection-LOLER.pdf"), "the attachment is the report, byte for byte");
  const a = await prepareFile(asFile("18-email-from-contractor-WITH-PDF-ATTACHED.eml"));
  assert.equal(a.how, "email-attachment");
  assert.equal(a.record.name, "07-lift-inspection-LOLER.pdf");
  assert.match(a.note, /Using the attachment "07-lift-inspection-LOLER\.pdf"/);
  const b = await prepareFile(asFile("19-email-text-only-NO-ATTACHMENT.eml"));
  assert.equal(b.how, "email-text");
});

await t("each other kind of file is routed as the guide says, and the old-format file is refused with what to do", async () => {
  assert.equal((await prepareFile(asFile("20-pasted-insurance-renewal-2027.txt"))).how, "text");
  assert.equal((await prepareFile(asFile("07-lift-inspection-LOLER.pdf", "application/pdf"))).how, "pdf");
  const word = await prepareFile(asFile("17-fire-risk-assessment-review-WORD.docx"));
  assert.deepEqual([word.how, word.record], ["office", null]);
  const excel = await prepareFile(asFile("21-emergency-lighting-test-log.xlsx"));
  assert.deepEqual([excel.how, excel.record], ["office", null]);
  assert.match(fileProblem(asFile("22-OLD-FORMAT-should-be-refused.doc")), /cannot read a Word 97-2003 file.*Save as.*PDF/);
  await assert.rejects(prepareFile(asFile("22-OLD-FORMAT-should-be-refused.doc")), /Save as/);
});

console.log(`\n${n} passed`);
