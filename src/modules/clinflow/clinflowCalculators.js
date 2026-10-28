// Clinical calculators that work only from what a letter itself says. Each one is a SUGGESTION for the coder: it shows its working and the words it came
// from, appears only when every figure it needs is in the letter (nothing is guessed or assumed), and says "at least" where a score is built from
// conditions the letter may simply not mention. A calculator is skipped if the letter already states its own answer. Pure (no screens).
//
// The scores and equations are the published ones, stated plainly in each function; they are decision support, not a replacement for the record.

const num = (value) => Number(String(value).replace(",", "."));
const round1 = (value) => Math.round(value * 10) / 10;
const clip = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const GAP = String.raw`[^\d\n]{0,14}?`; // the words between a name and its number ("creatinine was", "BP:")

// ---- what the letter says: facts with the words they came from ----
const first = (source, regex) => { const m = regex.exec(source); return m ? m : null; };
const fact = (m, value) => (m ? { value, quote: clip(m[0]) } : null);

// age at the time of the letter, from "aged 72", "72 year old", or a date of birth and the letter's date
export function findAge(text, patient = {}) {
  const source = String(text ?? "");
  const m = first(source, /\b(?:aged?|age:)\s*(\d{1,3})\b/i) || first(source, /\b(\d{1,3})[\s-]*(?:year|yr)s?[\s-]*old\b/i) || first(source, /\b(\d{1,3})\s*(?:y\/o|yo)\b/i);
  if (m && num(m[1]) >= 18 && num(m[1]) <= 110) return fact(m, num(m[1]));
  const birth = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(patient.birthDate ?? ""));
  const on = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(patient.letterDate ?? "")) || /^(\d{4})-(\d{2})-(\d{2})/.exec(new Date().toISOString());
  if (birth && on) {
    let age = Number(on[1]) - Number(birth[1]);
    if (Number(on[2]) < Number(birth[2]) || (Number(on[2]) === Number(birth[2]) && Number(on[3]) < Number(birth[3]))) age -= 1;
    if (age >= 18 && age <= 110) return { value: age, quote: `date of birth ${patient.birthDate}` };
  }
  return null;
}

export function findSex(text, patient = {}) {
  if (patient.gender === 10) return { value: "male", quote: "sex recorded as male" };
  if (patient.gender === 20) return { value: "female", quote: "sex recorded as female" };
  const m = first(String(text ?? ""), /\b(Mrs|Ms|Miss|Mr|female|woman|lady|male|man|gentleman)\b/i);
  if (!m) return null;
  return { value: /^(mrs|ms|miss|female|woman|lady)$/i.test(m[1]) ? "female" : "male", quote: clip(m[0]) };
}

const reading = (source, name, unit, low, high, extra = "") => {
  const m = first(source, new RegExp(String.raw`\b(?:${name})\b${GAP}(\d{1,4}(?:[.,]\d+)?)\s*${unit}${extra}`, "i"));
  if (!m) return null;
  const value = num(m[1]);
  return value >= low && value <= high ? { value, quote: clip(m[0]) } : null;
};
const UMOL = String.raw`(?:[µμu]mol\s*\/\s*l|micromol\w*\/l)?`;

export function findLabs(text) {
  const s = String(text ?? "");
  const creatinineMg = first(s, new RegExp(String.raw`\bcreatinine\b${GAP}(\d(?:[.,]\d+)?)\s*mg\s*\/\s*dl`, "i"));
  const creatinine = creatinineMg ? { value: round1(num(creatinineMg[1]) * 88.4), quote: clip(creatinineMg[0]) } : reading(s, "creatinine|creat", UMOL, 20, 1500);
  return {
    creatinine, // µmol/L
    urea: reading(s, "urea", String.raw`(?:mmol\s*\/\s*l)?`, 1, 80),
    albumin: reading(s, "albumin|alb", String.raw`(?:g\s*\/\s*l)?`, 10, 60),
    calcium: reading(s, "calcium|ca", String.raw`(?:mmol\s*\/\s*l)?`, 1.2, 4),
    ast: reading(s, "AST", String.raw`(?:u\s*\/\s*l|iu\s*\/\s*l)?`, 5, 5000),
    alt: reading(s, "ALT", String.raw`(?:u\s*\/\s*l|iu\s*\/\s*l)?`, 5, 5000),
    platelets: reading(s, "platelets?|plts?", String.raw`(?:\s*x?\s*10\^?9\s*\/\s*l)?`, 10, 1500),
    statedCorrectedCalcium: /\b(?:corrected|adjusted)\s+calcium\b/i.test(s),
  };
}

export function findVitals(text) {
  const s = String(text ?? "");
  const pairs = [...s.matchAll(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/g)].filter((m) => Number(m[1]) >= 60 && Number(m[1]) <= 300 && Number(m[2]) >= 30 && Number(m[2]) <= 160 && Number(m[1]) > Number(m[2]));
  const bp = pairs.length === 1 ? { systolic: Number(pairs[0][1]), diastolic: Number(pairs[0][2]), quote: clip(pairs[0][0]) } : null;
  const temp = first(s, new RegExp(String.raw`\b(?:temp(?:erature)?)\b${GAP}(3\d(?:[.,]\d)?)`, "i")) || first(s, /\b(3[4-9](?:[.,]\d)|4[0-2](?:[.,]\d))\s*°?\s*C\b/);
  const spo2 = first(s, new RegExp(String.raw`\b(?:spo2|sats?|oxygen saturations?)\b${GAP}(\d{2,3})\s*%?`, "i")) || first(s, /\b(\d{2,3})\s*%\s*(?:on\s+)?(?:RA|room air|air|oxygen|O2)\b/i);
  const air = /\b(?:on\s+)?(?:room air|RA|air)\b/i.test(s) ? "air" : /\bon\s+(?:\d+\s*L|oxygen|O2|supplemental)/i.test(s) ? "oxygen" : null;
  const level = /\b(?:confus(?:ed|ion)|disorient\w*|drowsy|unresponsive|responds? to (?:voice|pain)|reduced (?:GCS|consciousness))\b/i.exec(s) ? "reduced" : /\balert\b/i.test(s) ? "alert" : null;
  return {
    bp,
    pulse: reading(s, "HR|heart rate|pulse", "(?:bpm)?", 20, 250),
    respiratoryRate: reading(s, "RR|resp(?:iratory)? rate", "(?:\\/min|breaths)?", 4, 70),
    spo2: spo2 ? { value: num(spo2[1]), quote: clip(spo2[0]) } : null,
    oxygen: air,
    temperature: temp ? { value: num(temp[1]), quote: clip(temp[0]) } : null,
    consciousness: level,
  };
}

// a condition the letter mentions and does not rule out ("no diabetes", "denies chest pain")
const NEGATION = /\b(?:no|not|nil|denies|denied|without|negative for|free of|excluded|ruled out)\b[^.;\n]{0,25}$/i;
export function mentions(text, regex) {
  const s = String(text ?? "");
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  for (const m of s.matchAll(re)) {
    if (!NEGATION.test(s.slice(Math.max(0, m.index - 40), m.index))) return { value: true, quote: clip(m[0]) };
  }
  return null;
}
const history = (text, regex) => {
  // "previous stroke", "history of TIA": a condition in the past, not "to reduce the risk of stroke"
  const s = String(text ?? "");
  const re = new RegExp(regex.source, "gi");
  for (const m of s.matchAll(re)) {
    const before = s.slice(Math.max(0, m.index - 30), m.index);
    if (/\b(?:previous|prior|history of|h\/o|past|had a|suffered|known|recurrent|old)\b[^.;\n]*$/i.test(before) && !NEGATION.test(before)) return { value: true, quote: clip(s.slice(Math.max(0, m.index - 30), m.index + m[0].length)) };
  }
  return null;
};

// ---- the calculators; each returns a result or null ----
const points = (n) => `${n} point${n === 1 ? "" : "s"}`;
const result = (r) => ({ conceptId: null, notes: [], ...r });

// eGFR by the CKD-EPI creatinine equation (2009, without an ethnicity adjustment, as NICE advises): 141 × min(Scr/κ,1)^α × max(Scr/κ,1)^-1.209 × 0.993^age × 1.018 if female
export function calculateEgfr(ctx) {
  if (/\be?GFR\b[^\d\n]{0,12}\d/i.test(ctx.text)) return null; // the letter states it
  const { creatinine } = ctx.labs; const { age, sex } = ctx;
  if (!creatinine || !age || !sex) return null;
  const female = sex.value === "female";
  const kappa = female ? 0.7 : 0.9; const alpha = female ? -0.329 : -0.411;
  const scr = creatinine.value / 88.4;
  const egfr = 141 * Math.min(scr / kappa, 1) ** alpha * Math.max(scr / kappa, 1) ** -1.209 * 0.993 ** age.value * (female ? 1.018 : 1);
  const value = Math.round(egfr);
  const stage = value >= 90 ? "G1" : value >= 60 ? "G2" : value >= 45 ? "G3a" : value >= 30 ? "G3b" : value >= 15 ? "G4" : "G5";
  return result({
    kind: "egfr", label: "eGFR (calculated)", term: "Estimated glomerular filtration rate using creatinine Chronic Kidney Disease Epidemiology Collaboration equation", searchTerm: "estimated glomerular filtration rate using creatinine chronic kidney disease epidemiology collaboration equation",
    value: String(value), unit: "mL/min/1.73m2", display: `${value} mL/min/1.73m2`,
    working: `CKD-EPI creatinine equation: creatinine ${creatinine.value} µmol/L (${round1(scr)} mg/dL), age ${age.value}, ${sex.value} → ${value} mL/min/1.73 m²`,
    from: [creatinine.quote, age.quote, sex.quote],
    notes: [`That is in category ${stage}. A single result does not make a diagnosis of kidney disease.`, "The laboratory's own eGFR, if it reported one, takes priority."],
  });
}

// Creatinine clearance by Cockcroft-Gault (for drug dosing): (140 − age) × weight × (1.23 male, 1.04 female) ÷ creatinine in µmol/L
export function calculateCockcroftGault(ctx) {
  const { creatinine } = ctx.labs; const { age, sex, weight } = ctx;
  if (!creatinine || !age || !sex || !weight) return null;
  const clearance = ((140 - age.value) * weight.kg * (sex.value === "female" ? 1.04 : 1.23)) / creatinine.value;
  const value = Math.round(clearance);
  return result({
    kind: "crcl", label: "Creatinine clearance, Cockcroft-Gault (calculated)", term: "Estimated creatinine clearance calculated using actual body weight Cockcroft-Gault formula", searchTerm: "estimated creatinine clearance calculated using actual body weight cockcroft gault formula",
    value: String(value), unit: "mL/min", display: `${value} mL/min`,
    working: `(140 − ${age.value}) × ${round1(weight.kg)} kg × ${sex.value === "female" ? "1.04" : "1.23"} ÷ ${creatinine.value} µmol/L = ${value} mL/min`,
    from: [creatinine.quote, age.quote, sex.quote, weight.quote],
    notes: ["Used for drug dosing, with the actual body weight in the letter. Not the same as eGFR."],
  });
}

// Calcium corrected for albumin (UK laboratory convention): calcium + 0.02 × (40 − albumin)
export function calculateCorrectedCalcium(ctx) {
  const { calcium, albumin, statedCorrectedCalcium } = ctx.labs;
  if (!calcium || !albumin || statedCorrectedCalcium) return null;
  const value = Math.round((calcium.value + 0.02 * (40 - albumin.value)) * 100) / 100;
  return result({
    kind: "corrected-calcium", label: "Corrected calcium (calculated)", term: "Corrected serum calcium", searchTerm: "corrected serum calcium", conceptId: "166708003",
    value: value.toFixed(2), unit: "mmol/L", display: `${value.toFixed(2)} mmol/L`,
    working: `${calcium.value} + 0.02 × (40 − ${albumin.value}) = ${value.toFixed(2)} mmol/L`,
    from: [calcium.quote, albumin.quote], notes: ["Uses albumin in g/L and the usual reference albumin of 40 g/L; the laboratory's own corrected value, if given, takes priority."],
  });
}

// FIB-4 liver fibrosis index: (age × AST) ÷ (platelets × √ALT). NICE bands: under 1.3 low, 1.3 to 2.67 indeterminate, over 2.67 high
export function calculateFib4(ctx) {
  const { ast, alt, platelets } = ctx.labs; const { age } = ctx;
  if (/\bFIB-?4\b[^\d\n]{0,10}\d/i.test(ctx.text) || !ast || !alt || !platelets || !age) return null;
  const value = round1((age.value * ast.value) / (platelets.value * Math.sqrt(alt.value)));
  const band = value < 1.3 ? "low risk of advanced fibrosis" : value <= 2.67 ? "indeterminate" : "high risk of advanced fibrosis";
  return result({
    kind: "fib4", label: "FIB-4 index (calculated)", term: "Fibrosis-4 index", searchTerm: "fibrosis 4 index", conceptId: "719873005",
    value: String(value), unit: "score", display: `${value}`,
    working: `(${age.value} × ${ast.value} AST) ÷ (${platelets.value} platelets × √${alt.value} ALT) = ${value}`,
    from: [ast.quote, alt.quote, platelets.quote, age.quote], notes: [`That is ${band} on the NICE bands (under 1.3, 1.3 to 2.67, over 2.67).`],
  });
}

// Mean arterial pressure from a single stated blood pressure: diastolic + (systolic − diastolic) ÷ 3
export function calculateMap(ctx) {
  const bp = ctx.vitals.bp;
  if (!bp || /\b(?:MAP|mean arterial)\b[^\d\n]{0,10}\d/i.test(ctx.text)) return null;
  const map = Math.round(bp.diastolic + (bp.systolic - bp.diastolic) / 3);
  return result({
    kind: "map", label: "Mean arterial pressure (calculated)", term: "Mean arterial pressure", searchTerm: "mean arterial pressure", conceptId: "1285244000",
    value: String(map), unit: "mmHg", display: `${map} mmHg`,
    working: `${bp.diastolic} + (${bp.systolic} − ${bp.diastolic}) ÷ 3 = ${map} mmHg`, from: [bp.quote], notes: [`Pulse pressure is ${bp.systolic - bp.diastolic} mmHg.`],
  });
}

// CHA2DS2-VASc for atrial fibrillation: heart failure 1, hypertension 1, age 75 or over 2 (65 to 74 1), diabetes 1, stroke/TIA/thromboembolism 2, vascular disease 1, female 1.
// Built only from what the letter says, so it is "at least": a condition the letter does not mention is counted as absent.
export function calculateChadsVasc(ctx) {
  const t = ctx.text;
  if (!mentions(t, /\batrial fibrillation\b|\bAF\b|\batrial flutter\b/i) || /\bCHA2?DS2?[-\s]?VASc\b[^\d\n]{0,12}\d/i.test(t) || !ctx.age) return null;
  const items = [];
  const add = (name, points, source) => { if (source) items.push({ name, points, quote: source.quote }); };
  add("heart failure", 1, mentions(t, /heart failure|cardiac failure|\bHFr?EF\b|\bHFpEF\b|\bLVSD\b|left ventricular (?:systolic )?dysfunction|\bCCF\b|\bCHF\b/i));
  add("hypertension", 1, mentions(t, /(?<!pulmonary |portal |ocular )\bhypertension\b|\bhypertensive\b|\bHTN\b/i));
  add("diabetes", 1, mentions(t, /\bdiabetes(?! insipidus)\b|\bT[12]DM\b|\bdiabetic\b/i));
  add("previous stroke, TIA or thromboembolism", 2, history(t, /\bstroke\b|\bTIA\b|transient ischaemic attack|cerebrovascular accident|\bCVA\b|thromboembol\w*|systemic embol\w*/i));
  add("vascular disease", 1, mentions(t, /myocardial infarction|\bNSTEMI\b|\bSTEMI\b|peripheral (?:arterial|vascular) disease|\bPAD\b|aortic plaque|\bCABG\b|\bPCI\b/i));
  if (ctx.age.value >= 75) items.push({ name: `age ${ctx.age.value} (75 or over)`, points: 2, quote: ctx.age.quote });
  else if (ctx.age.value >= 65) items.push({ name: `age ${ctx.age.value} (65 to 74)`, points: 1, quote: ctx.age.quote });
  if (ctx.sex?.value === "female") items.push({ name: "female sex", points: 1, quote: ctx.sex.quote });
  const total = items.reduce((sum, i) => sum + i.points, 0);
  const notes = ["At least this much: a condition the letter does not mention is counted as absent, so check it against the patient's record."];
  if (!ctx.sex) notes.push("The letter does not say the patient's sex, so the point for female sex is not counted.");
  return result({
    kind: "chadsvasc", label: "CHA2DS2-VASc score (calculated)", term: "CHA2DS2-VASc score", searchTerm: "CHA2DS2-VASc score", conceptId: "735259005",
    value: String(total), unit: "points", display: points(total),
    working: items.length ? items.map((i) => `${i.name} ${i.points}`).join(" + ") + ` = ${total}` : `none of the factors is in the letter = 0`,
    from: items.map((i) => i.quote).slice(0, 6), notes,
  });
}

// HAS-BLED bleeding risk for a person on or considered for anticoagulation: uncontrolled hypertension (systolic over 160), abnormal renal (dialysis, transplant, creatinine
// 200 µmol/L or over) or liver function, previous stroke, bleeding history or anaemia, elderly (over 65), drugs (antiplatelets, NSAIDs) or alcohol excess. "At least", as above.
// Labile INR is not counted: a letter rarely gives the time in range.
export function calculateHasBled(ctx) {
  const t = ctx.text;
  if (!mentions(t, /\batrial fibrillation\b|\bAF\b|anticoagul\w*|warfarin|apixaban|rivaroxaban|edoxaban|dabigatran/i) || /\bHAS-?BLED\b[^\d\n]{0,12}\d/i.test(t) || !ctx.age) return null;
  const items = [];
  const add = (name, source) => { if (source) items.push({ name, points: 1, quote: source.quote }); };
  if (ctx.vitals.bp && ctx.vitals.bp.systolic > 160) add("systolic pressure over 160", { quote: ctx.vitals.bp.quote });
  add("uncontrolled hypertension", mentions(t, /uncontrolled hypertension|poorly controlled (?:blood pressure|hypertension)/i));
  if (ctx.labs.creatinine && ctx.labs.creatinine.value >= 200) add("creatinine 200 or over", ctx.labs.creatinine);
  add("renal replacement", mentions(t, /\bdialysis\b|renal transplant|kidney transplant/i));
  add("liver disease", mentions(t, /cirrhosis|\bchronic liver disease\b|hepatic failure/i));
  add("previous stroke", history(t, /\bstroke\b|\bTIA\b|cerebrovascular accident|\bCVA\b/i));
  add("bleeding history or anaemia", mentions(t, /\b(?:GI|gastrointestinal|major|recurrent|intracranial|variceal)\s+(?:bleed\w*|haemorrhage)\b|\bhaemorrhage\b|\banaemia\b|\bbleeding disorder\b/i));
  if (ctx.age.value > 65) items.push({ name: `age ${ctx.age.value} (over 65)`, points: 1, quote: ctx.age.quote });
  add("antiplatelet or NSAID", mentions(t, /\baspirin\b|clopidogrel|ticagrelor|prasugrel|ibuprofen|naproxen|diclofenac|\bNSAIDs?\b/i));
  add("alcohol excess", mentions(t, /\b(?:excess(?:ive)? alcohol|alcohol (?:excess|misuse|dependence)|heavy drinker)\b/i));
  const total = items.length;
  return result({
    kind: "hasbled", label: "HAS-BLED score (calculated)", term: "HAS-BLED score", searchTerm: "HAS-BLED score", conceptId: "704180000",
    value: String(total), unit: "points", display: points(total),
    working: items.length ? `${items.map((i) => i.name).join(" + ")} = ${total}` : "none of the factors is in the letter = 0",
    from: items.map((i) => i.quote).slice(0, 6),
    notes: ["At least this much: factors the letter does not mention are counted as absent, and labile INR is never counted. Check it against the patient's record."],
  });
}

// NEWS2 (scale 1) from the observations in the letter: respiratory rate, SpO2, air or oxygen, systolic pressure, pulse, consciousness, temperature.
// Worked out only when the five measurements are all there; the two that a letter often leaves out (oxygen, consciousness) are said so, and not guessed.
export function calculateNews2(ctx) {
  const v = ctx.vitals;
  if (/\bNEWS\s?2?\b[^\d\n]{0,12}\d/i.test(ctx.text) || !v.bp || !v.pulse || !v.respiratoryRate || !v.spo2 || !v.temperature) return null;
  const band = (value, table) => table.find(([limit]) => value <= limit)[1];
  const rr = band(v.respiratoryRate.value, [[8, 3], [11, 1], [20, 0], [24, 2], [Infinity, 3]]);
  const spo2 = band(v.spo2.value, [[91, 3], [93, 2], [95, 1], [Infinity, 0]]);
  const sbp = band(v.bp.systolic, [[90, 3], [100, 2], [110, 1], [219, 0], [Infinity, 3]]);
  const pulse = band(v.pulse.value, [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2], [Infinity, 3]]);
  const temp = band(v.temperature.value, [[35, 3], [36, 1], [38, 0], [39, 1], [Infinity, 2]]);
  const air = v.oxygen === "oxygen" ? 2 : 0;
  const mind = v.consciousness === "reduced" ? 3 : 0;
  const parts = [["respiratory rate", rr], ["SpO2", spo2], ["systolic pressure", sbp], ["pulse", pulse], ["temperature", temp], ["on oxygen", air], ["consciousness", mind]];
  const total = parts.reduce((sum, [, score]) => sum + score, 0);
  const notes = ["Scale 1 for SpO2 is used; a patient with hypercapnic respiratory failure is scored on scale 2 by a clinician."];
  if (!v.oxygen) notes.push("The letter does not say whether this was on air or oxygen, so no points are counted for oxygen.");
  if (!v.consciousness) notes.push("The letter does not describe consciousness, so it is counted as alert (0 points). Check it.");
  const any3 = parts.some(([, score]) => score === 3);
  if (any3) notes.push("One of the figures scores 3 on its own, which the NEWS2 chart treats as needing an urgent response.");
  return result({
    kind: "news2", label: "NEWS2 score (calculated)", term: "National early warning score 2", searchTerm: "national early warning score 2", conceptId: "1104051000000101",
    value: String(total), unit: "points", display: points(total),
    working: parts.map(([name, score]) => `${name} ${score}`).join(" + ") + ` = ${total}`,
    from: [v.respiratoryRate.quote, v.spo2.quote, v.bp.quote, v.pulse.quote, v.temperature.quote],
    notes,
  });
}

// CURB-65 for a letter about pneumonia: confusion, urea over 7 mmol/L, respiratory rate 30 or over, systolic under 90 or diastolic 60 or under, age 65 or over. "At least".
export function calculateCurb65(ctx) {
  const t = ctx.text;
  if (!mentions(t, /pneumonia|lower respiratory tract infection|\bLRTI\b|chest infection/i) || /\bCURB-?65\b[^\d\n]{0,12}\d/i.test(t) || !ctx.age) return null;
  const items = [];
  if (ctx.vitals.consciousness === "reduced") items.push({ name: "confusion", quote: "confusion mentioned" });
  if (ctx.labs.urea && ctx.labs.urea.value > 7) items.push({ name: `urea ${ctx.labs.urea.value} (over 7)`, quote: ctx.labs.urea.quote });
  if (ctx.vitals.respiratoryRate && ctx.vitals.respiratoryRate.value >= 30) items.push({ name: `respiratory rate ${ctx.vitals.respiratoryRate.value} (30 or over)`, quote: ctx.vitals.respiratoryRate.quote });
  if (ctx.vitals.bp && (ctx.vitals.bp.systolic < 90 || ctx.vitals.bp.diastolic <= 60)) items.push({ name: `blood pressure ${ctx.vitals.bp.systolic}/${ctx.vitals.bp.diastolic}`, quote: ctx.vitals.bp.quote });
  if (ctx.age.value >= 65) items.push({ name: `age ${ctx.age.value} (65 or over)`, quote: ctx.age.quote });
  const total = items.length;
  const band = total <= 1 ? "low risk" : total === 2 ? "intermediate risk" : "high risk";
  return result({
    kind: "curb65", label: "CURB-65 score (calculated)", term: "CURB-65 score", searchTerm: "CURB-65 score", conceptId: "862641000000109",
    value: String(total), unit: "points", display: points(total),
    working: items.length ? `${items.map((i) => i.name).join(" + ")} = ${total}` : "none of the factors is in the letter = 0",
    from: items.map((i) => i.quote).slice(0, 5),
    notes: [`That is ${band} (0 to 1 low, 2 intermediate, 3 or more high).`, "At least this much: a factor the letter does not mention is counted as absent."],
  });
}

export const CALCULATORS = [calculateEgfr, calculateCockcroftGault, calculateCorrectedCalcium, calculateFib4, calculateMap, calculateChadsVasc, calculateHasBled, calculateNews2, calculateCurb65];

// What the letter says, gathered once for every calculator. patient: { birthDate, gender, letterDate } where known.
export function gatherFacts(text, patient = {}, weight = null) {
  return { text: String(text ?? ""), age: findAge(text, patient), sex: findSex(text, patient), labs: findLabs(text), vitals: findVitals(text), weight };
}

// What a letter hints at but does not give enough for: a calculation that has its first ingredient in the letter and is missing the rest is NOT worked out, and the person is
// told, so a missing result is never mistaken for a normal one. Only where the letter clearly points at the calculation (a creatinine, atrial fibrillation, pneumonia,
// liver enzymes, calcium, three or more of the five observations); a letter that never mentions the ingredients is not told anything.
// Returns [{ kind, label, needs: [what is missing] }].
export function calculatorGaps(text, patient = {}, weight = null) {
  const ctx = gatherFacts(text, patient, weight);
  const t = ctx.text;
  const gaps = [];
  const missing = (...pairs) => pairs.filter(([have]) => !have).map(([, what]) => what);
  const add = (kind, label, needs) => { if (needs.length) gaps.push({ kind, label, needs }); };
  if (ctx.labs.creatinine && !/\be?GFR\b[^\d\n]{0,12}\d/i.test(t)) add("egfr", "eGFR", missing([ctx.age, "the patient's age"], [ctx.sex, "the patient's sex"]));
  if (ctx.labs.calcium && !ctx.labs.statedCorrectedCalcium) add("corrected-calcium", "Corrected calcium", missing([ctx.labs.albumin, "an albumin result"]));
  const liver = [ctx.labs.ast, ctx.labs.alt, ctx.labs.platelets].filter(Boolean).length;
  if (liver >= 2 && !/\bFIB-?4\b[^\d\n]{0,10}\d/i.test(t)) add("fib4", "FIB-4 index", missing([ctx.labs.ast, "an AST result"], [ctx.labs.alt, "an ALT result"], [ctx.labs.platelets, "a platelet count"], [ctx.age, "the patient's age"]));
  if (mentions(t, /\batrial fibrillation\b|\bAF\b|\batrial flutter\b/i) && !ctx.age) {
    if (!/\bCHA2?DS2?[-\s]?VASc\b[^\d\n]{0,12}\d/i.test(t)) add("chadsvasc", "CHA2DS2-VASc score", ["the patient's age"]);
    if (!/\bHAS-?BLED\b[^\d\n]{0,12}\d/i.test(t)) add("hasbled", "HAS-BLED score", ["the patient's age"]);
  }
  if (mentions(t, /pneumonia|lower respiratory tract infection|\bLRTI\b|chest infection/i) && !ctx.age && !/\bCURB-?65\b[^\d\n]{0,12}\d/i.test(t)) add("curb65", "CURB-65 score", ["the patient's age"]);
  const v = ctx.vitals;
  const found = [v.bp, v.pulse, v.respiratoryRate, v.spo2, v.temperature].filter(Boolean).length;
  if (found >= 3 && found < 5 && !/\bNEWS\s?2?\b[^\d\n]{0,12}\d/i.test(t)) add("news2", "NEWS2 score", missing([v.bp, "a blood pressure"], [v.pulse, "a pulse"], [v.respiratoryRate, "a respiratory rate"], [v.spo2, "an oxygen saturation"], [v.temperature, "a temperature"]));
  return gaps;
}

// Every calculation the letter supports: [{ kind, label, term, searchTerm, value, unit, display, working, from, notes }]
export function runCalculators(text, patient = {}, weight = null) {
  const ctx = gatherFacts(text, patient, weight);
  return CALCULATORS.map((calculator) => { try { return calculator(ctx); } catch { return null; } }).filter(Boolean);
}
