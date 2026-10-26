// The abbreviations a UK GP letter uses, and what they stand for, so a finding written "CKD", "SOB" or "U&Es" is looked up as the words it means.
//
// TWO SOURCES: a built-in list (below), and a list the practice loads (a plain file of abbreviation and meaning, see parseAbbreviationCsv), which replaces
// the built-in one while it is loaded. The built-in list was compiled from everyday UK general practice usage and the abbreviations SNOMED CT carries as
// synonyms. It is NOT an official NHS list, and a clinician should read it through. If the practice or health board has an approved list, load that.
//
// An abbreviation with ONE meaning is simply written out. One with SEVERAL ("RA" is rheumatoid arthritis, the right atrium and room air) is never
// guessed at: the finding offers a code for each meaning and the person chooses.
// `upper` means it is only an abbreviation when written in capitals ("MS", not "ms", so that ordinary words and titles are left alone).

const one = (abbr, meaning, upper = false) => ({ abbr, meanings: [meaning], upper });
const many = (abbr, meanings) => ({ abbr, meanings, upper: true });

export const BUILT_IN_ABBREVIATIONS = [
  // heart and circulation
  one("af", "atrial fibrillation"), one("afib", "atrial fibrillation"), one("aflutter", "atrial flutter"), one("svt", "supraventricular tachycardia"), one("vt", "ventricular tachycardia", true),
  one("vf", "ventricular fibrillation", true), one("hf", "heart failure"), one("chf", "congestive heart failure"), one("lvf", "left ventricular failure"), one("rvf", "right ventricular failure"),
  one("lvh", "left ventricular hypertrophy"), one("lvsd", "left ventricular systolic dysfunction"), one("lvef", "left ventricular ejection fraction"), one("ihd", "ischaemic heart disease"),
  one("cad", "coronary artery disease"), one("cvd", "cardiovascular disease"), one("acs", "acute coronary syndrome"), one("nstemi", "non-ST elevation myocardial infarction"),
  one("stemi", "ST elevation myocardial infarction"), one("pci", "percutaneous coronary intervention"), one("cabg", "coronary artery bypass graft"), one("pad", "peripheral arterial disease", true),
  one("aaa", "abdominal aortic aneurysm"), one("tia", "transient ischaemic attack"), one("cva", "cerebrovascular accident"), one("dvt", "deep vein thrombosis"), one("htn", "hypertension"),
  one("pnd", "paroxysmal nocturnal dyspnoea"), one("doe", "dyspnoea on exertion"), one("lbbb", "left bundle branch block"), one("rbbb", "right bundle branch block"),
  many("MI", ["myocardial infarction", "mitral insufficiency"]), many("MR", ["mitral regurgitation", "medication review"]), many("MS", ["multiple sclerosis", "mitral stenosis"]),
  many("AR", ["aortic regurgitation", "allergic rhinitis"]), many("AS", ["aortic stenosis", "ankylosing spondylitis"]), many("PE", ["pulmonary embolism", "pleural effusion"]),
  many("CP", ["chest pain", "cerebral palsy"]), many("RA", ["rheumatoid arthritis", "right atrium", "room air"]), many("PD", ["Parkinson's disease", "peritoneal dialysis"]),
  many("HD", ["haemodialysis", "Huntington's disease"]), many("ASD", ["atrial septal defect", "autism spectrum disorder"]), many("CA", ["carcinoma", "calcium"]),
  // lungs and infection
  one("copd", "chronic obstructive pulmonary disease"), one("sob", "shortness of breath"), one("sobar", "shortness of breath at rest"), one("urti", "upper respiratory tract infection"),
  one("lrti", "lower respiratory tract infection"), one("uti", "urinary tract infection"), one("osa", "obstructive sleep apnoea"), one("cpap", "continuous positive airway pressure"),
  one("ards", "acute respiratory distress syndrome"), one("tb", "tuberculosis"), one("pefr", "peak expiratory flow rate"), one("pef", "peak expiratory flow"), one("fev1", "forced expiratory volume in 1 second"),
  one("fvc", "forced vital capacity"), one("abg", "arterial blood gas"), one("o2 sats", "peripheral oxygen saturation"), one("o2 saturation", "peripheral oxygen saturation"), one("o2 saturations", "peripheral oxygen saturation"), one("spo2", "peripheral oxygen saturation"), one("sats", "peripheral oxygen saturation"),
  one("cap", "community acquired pneumonia", true), one("hiv", "human immunodeficiency virus"), one("hbv", "hepatitis b"), one("hcv", "hepatitis c"),
  one("mrsa", "meticillin resistant staphylococcus aureus"), one("sti", "sexually transmitted infection"),
  // kidneys, bladder, prostate
  one("ckd", "chronic kidney disease"), one("aki", "acute kidney injury"), one("esrf", "end stage renal failure"), one("rrt", "renal replacement therapy"), one("egfr", "estimated glomerular filtration rate"),
  one("gfr", "glomerular filtration rate"), one("bph", "benign prostatic hyperplasia"), one("luts", "lower urinary tract symptoms"), one("psa", "prostate specific antigen"),
  // diabetes and hormones
  one("dm", "diabetes mellitus", true), one("t1dm", "type 1 diabetes mellitus"), one("t2dm", "type 2 diabetes mellitus"), one("gdm", "gestational diabetes mellitus"), one("dka", "diabetic ketoacidosis"),
  one("hba1c", "haemoglobin a1c"), one("tsh", "thyroid stimulating hormone"), one("pcos", "polycystic ovary syndrome"),
  // tests and measurements
  one("u&e", "urea and electrolytes"), one("u&es", "urea and electrolytes"), one("fbc", "full blood count"), one("lft", "liver function test"), one("lfts", "liver function tests"),
  one("tft", "thyroid function test"), one("tfts", "thyroid function tests"), one("crp", "c-reactive protein"), one("esr", "erythrocyte sedimentation rate"), one("inr", "international normalised ratio"),
  one("ecg", "electrocardiogram"), one("echo", "echocardiogram"), one("cxr", "chest x-ray"), one("ct", "computed tomography", true), one("mri", "magnetic resonance imaging"),
  one("bp", "blood pressure"), one("bmi", "body mass index"), one("hr", "heart rate", true), one("rr", "respiratory rate", true), one("temp", "body temperature"), one("gcs", "glasgow coma scale"),
  one("news2", "national early warning score 2"), one("ef", "ejection fraction", true),
  // bowel, stomach, liver, bones, mind
  one("gord", "gastro-oesophageal reflux disease"), one("gerd", "gastro-oesophageal reflux disease"), one("ibs", "irritable bowel syndrome"), one("ibd", "inflammatory bowel disease"),
  one("pud", "peptic ulcer disease"), one("hcc", "hepatocellular carcinoma"), one("nafld", "non-alcoholic fatty liver disease"), one("n&v", "nausea and vomiting"), one("d&v", "diarrhoea and vomiting"),
  one("oa", "osteoarthritis", true), one("lbp", "low back pain"), one("adhd", "attention deficit hyperactivity disorder"), one("ocd", "obsessive compulsive disorder"),
  one("ptsd", "post-traumatic stress disorder"), one("gad", "generalised anxiety disorder"), one("mdd", "major depressive disorder"), one("cbt", "cognitive behavioural therapy"),
  one("loc", "loss of consciousness"),
];

// ---- a list the practice loads: a plain file with an abbreviation and its meaning on each line (comma or tab between them) ----
// An abbreviation that appears on several lines has several meanings. Short abbreviations and ones that are ordinary words are only read in capitals.
const COMMON_WORDS = new Set(["cap", "pad", "pet", "bed", "ear", "hip", "sat", "pain", "mass", "cast", "lead", "rest", "stop", "test", "scan", "drug", "mind", "heart", "line", "tube", "bag", "pill"]);

function splitLine(line) {
  const cells = [];
  let cell = ""; let quoted = false;
  const sep = line.includes("\t") ? "\t" : ",";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) { if (ch === '"') { if (line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; } else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === sep) { cells.push(cell); cell = ""; }
    else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.replace(/\s+/g, " ").trim());
}

// Reads the practice's own list. Returns { entries, lines, problems: [{ line, text, why }] }; lines it cannot use are reported, never silently dropped.
export function parseAbbreviationCsv(source) {
  const byAbbr = new Map();
  const problems = [];
  const rows = String(source ?? "").replace(/^﻿/, "").split(/\r?\n/);
  let lines = 0;
  rows.forEach((raw, i) => {
    if (!raw.trim()) return;
    const [abbr, meaning] = splitLine(raw);
    if (i === 0 && /^(abbrev|abbreviation|short|term|acronym)/i.test(abbr || "") ) return; // a heading row
    lines += 1;
    if (!abbr || !meaning) { problems.push({ line: i + 1, text: raw.slice(0, 80), why: "needs an abbreviation and its meaning" }); return; }
    if (abbr.length > 12 || abbr.split(" ").length > 2) { problems.push({ line: i + 1, text: raw.slice(0, 80), why: "that does not look like an abbreviation" }); return; }
    if (meaning.length > 120) { problems.push({ line: i + 1, text: raw.slice(0, 80), why: "the meaning is too long" }); return; }
    const key = abbr.toLowerCase();
    if (!byAbbr.has(key)) byAbbr.set(key, { abbr: abbr.toLowerCase(), meanings: [], upper: false, written: abbr });
    const entry = byAbbr.get(key);
    if (!entry.meanings.some((m) => m.toLowerCase() === meaning.toLowerCase())) entry.meanings.push(meaning);
  });
  const entries = [...byAbbr.values()].map((e) => ({ abbr: e.meanings.length > 1 ? e.written : e.abbr, meanings: e.meanings, upper: e.meanings.length > 1 || e.abbr.length <= 2 || COMMON_WORDS.has(e.abbr) }));
  return { entries, lines, problems, ambiguous: entries.filter((e) => e.meanings.length > 1).length };
}

// ---- which list is in use ----
let active = { entries: BUILT_IN_ABBREVIATIONS, label: "built-in list" };
let compiled = null;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = (e) => new RegExp(`(?<![A-Za-z0-9&])${escape(e.abbr)}(?![A-Za-z0-9&])`, e.upper ? "g" : "gi");
const compile = () => { if (!compiled) compiled = active.entries.map((entry) => ({ entry, regex: pattern(entry) })); return compiled; };

export function setAbbreviationList(entries, label = "loaded list") { active = entries?.length ? { entries, label } : { entries: BUILT_IN_ABBREVIATIONS, label: "built-in list" }; compiled = null; }
export const abbreviationInfo = () => ({ label: active.label, count: active.entries.length, ambiguous: active.entries.filter((e) => e.meanings.length > 1).length, builtIn: active.entries === BUILT_IN_ABBREVIATIONS });

// Writes out the abbreviations that have one meaning, and reports the ones that have several (left as they were):
// { text, ambiguous: [{ abbr, meanings }] }
export function expandAbbreviations(value) {
  let text = String(value ?? "");
  const ambiguous = [];
  for (const { entry, regex } of compile()) {
    regex.lastIndex = 0;
    if (!regex.test(text)) continue;
    regex.lastIndex = 0;
    if (entry.meanings.length > 1) { if (!ambiguous.some((a) => a.abbr.toLowerCase() === entry.abbr.toLowerCase())) ambiguous.push({ abbr: entry.abbr, meanings: entry.meanings }); continue; }
    text = text.replace(regex, ` ${entry.meanings[0]} `);
  }
  return { text: text.replace(/\s+/g, " ").trim(), ambiguous };
}

// the finding with one meaning of an ambiguous abbreviation put in its place
export function withMeaning(value, abbr, meaning) {
  const entry = active.entries.find((e) => e.abbr.toLowerCase() === String(abbr).toLowerCase() && e.meanings.length > 1);
  return entry ? String(value ?? "").replace(pattern(entry), ` ${meaning} `).replace(/\s+/g, " ").trim() : String(value ?? "");
}
