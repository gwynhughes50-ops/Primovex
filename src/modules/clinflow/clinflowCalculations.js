// Values a letter implies but does not state, worked out from what it does state: body mass index from a weight and a height, and the average
// of a run of ambulatory or home blood pressure readings. Pure (no screens). Each result carries its working and the words it came from, and is
// offered to the coder like any other suggestion: nothing here is accepted for anyone.

import { calculatorGaps, runCalculators } from "./clinflowCalculators.js";
import { ENTERED } from "./clinflowEnteredFigures.js";

const num = (value) => Number(String(value).replace(",", "."));
const round1 = (value) => Math.round(value * 10) / 10;
const clip = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const SEP = String.raw`\s*(?:is|was|of|=|:|-|–|recorded as|measured|measures)?\s*`;

// ---- weight and height ----
export function findWeight(text) {
  const source = String(text ?? "");
  let m = new RegExp(String.raw`\b(?:weight|wt|weigh\w*)\b${SEP}(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kgs|kilograms?|kilos?)\b`, "i").exec(source);
  if (m) return { kg: num(m[1]), quote: clip(m[0]) };
  m = new RegExp(String.raw`\b(?:weight|wt|weigh\w*)\b${SEP}(\d{1,2})\s*(?:st|stone)\b\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\b)?`, "i").exec(source);
  if (m) return { kg: (num(m[1]) * 14 + (m[2] ? num(m[2]) : 0)) * 0.45359237, quote: clip(m[0]) };
  m = new RegExp(String.raw`\b(?:weight|wt|weigh\w*)\b${SEP}(\d{2,3}(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\b`, "i").exec(source);
  if (m) return { kg: num(m[1]) * 0.45359237, quote: clip(m[0]) };
  return null;
}

export function findHeight(text) {
  const source = String(text ?? "");
  let m = new RegExp(String.raw`\b(?:height|ht)\b${SEP}(\d{3}(?:[.,]\d+)?)\s*cm\b`, "i").exec(source) || /\b(\d{3}(?:[.,]\d+)?)\s*cm\s+tall\b/i.exec(source);
  if (m) return { m: num(m[1]) / 100, quote: clip(m[0]) };
  m = new RegExp(String.raw`\b(?:height|ht)\b${SEP}(\d(?:[.,]\d{1,2})?)\s*(?:m|metres?|meters?)\b`, "i").exec(source) || /\b(\d(?:[.,]\d{1,2})?)\s*(?:m|metres?|meters?)\s+tall\b/i.exec(source);
  if (m) return { m: num(m[1]), quote: clip(m[0]) };
  m = new RegExp(String.raw`\b(?:height|ht)\b${SEP}(\d)\s*(?:ft|feet|foot|')\s*(?:(\d{1,2})\s*(?:in|inches|")?)?`, "i").exec(source);
  if (m) return { m: (num(m[1]) * 12 + (m[2] ? num(m[2]) : 0)) * 0.0254, quote: clip(m[0]) };
  return null;
}

const BMI_BANDS = [[18.5, "below the healthy range (underweight)"], [25, "in the healthy range"], [30, "in the overweight range"], [35, "in the obesity class 1 range"], [40, "in the obesity class 2 range"], [Infinity, "in the obesity class 3 range"]];
export const bmiBand = (bmi) => BMI_BANDS.find(([limit]) => bmi < limit)[1];

// The BMI a letter's weight and height give, or null. If the letter also states a BMI, it is compared, not repeated.
export function calculateBmi(text) {
  const weight = findWeight(text);
  const height = findHeight(text);
  if (!weight || !height) return null;
  if (weight.kg < 20 || weight.kg > 400 || height.m < 0.9 || height.m > 2.5) return null; // not believable: nothing is worked out
  const bmi = round1(weight.kg / (height.m * height.m));
  const stated = /\bBMI\b[^\d]{0,12}(\d{2}(?:[.,]\d+)?)/i.exec(String(text ?? ""));
  const notes = [`That is ${bmiBand(bmi)}.`];
  if (stated) {
    const said = num(stated[1]);
    notes.push(Math.abs(said - bmi) <= 0.5 ? `The letter says BMI ${said}, which agrees.` : `The letter says BMI ${said}, which does not match this (${bmi}). Check the weight and height.`);
  }
  return {
    kind: "bmi", label: "Body mass index (calculated)", term: "Body mass index", conceptId: "60621009", searchTerm: "body mass index",
    value: String(bmi), unit: "kg/m2", display: `${bmi} kg/m2`,
    working: `${round1(weight.kg)} kg ÷ (${round1(height.m * 100) / 100} m × ${round1(height.m * 100) / 100} m) = ${bmi} kg/m2`,
    from: [weight.quote, height.quote], notes,
  };
}

// ---- runs of blood pressure readings ----
const READINGS = /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/g;
const SERIES_WORDS = /\b(abpm|ambulatory blood pressure|24[\s-]?h(?:ou)?r (?:blood pressure|bp|ambulatory|abpm)|home blood pressure|hbpm)\b/i;
const believable = (sys, dia) => sys >= 70 && sys <= 260 && dia >= 40 && dia <= 150 && sys > dia;
const onlyGlue = (gap) => gap.length <= 24 && gap.replace(/\b(?:am|pm|and|then|hrs?|h)\b/gi, "").replace(/[^a-z]/gi, "") === "";

// The average of a run of four or more readings written one after another ("08:00 134/82, 09:00 138/84, ..."), after a mention of ambulatory or home
// monitoring. Returns [systolic, diastolic] results, or [].
export function calculateBloodPressureAverage(text) {
  const source = String(text ?? "");
  const readings = [];
  for (const m of source.matchAll(READINGS)) {
    const sys = Number(m[1]); const dia = Number(m[2]);
    if (believable(sys, dia)) readings.push({ sys, dia, start: m.index, end: m.index + m[0].length });
  }
  const runs = [];
  let run = [];
  for (const r of readings) {
    if (run.length && onlyGlue(source.slice(run.at(-1).end, r.start))) run.push(r);
    else { if (run.length) runs.push(run); run = [r]; }
  }
  if (run.length) runs.push(run);
  const results = [];
  for (const series of runs) {
    if (series.length < 4) continue;
    const before = source.slice(Math.max(0, series[0].start - 400), series[0].start);
    const word = SERIES_WORDS.exec(before);
    if (!word) continue;
    const home = /home|hbpm/i.test(word[0]);
    const day24 = /24/.test(word[0]) || /24[\s-]?h/i.test(before);
    const sys = Math.round(series.reduce((t, r) => t + r.sys, 0) / series.length);
    const dia = Math.round(series.reduce((t, r) => t + r.dia, 0) / series.length);
    const quote = clip(source.slice(series[0].start, series.at(-1).end)).slice(0, 160);
    const how = home ? "home" : day24 ? "24 hour" : "ambulatory";
    const notes = [`The average of ${series.length} ${home ? "home" : "ambulatory"} readings is ${sys}/${dia} mmHg.`];
    if (series.length < 14) notes.push(`NICE advises an average of at least 14 daytime readings; this run has ${series.length}.`);
    const common = { kind: "bp-average", from: [quote], notes, count: series.length, unit: "mmHg", working: `${series.length} readings: systolic ${series.map((r) => r.sys).join(" + ")} ÷ ${series.length} = ${sys}; diastolic ${series.map((r) => r.dia).join(" + ")} ÷ ${series.length} = ${dia}` };
    const prefix = home ? "average home" : day24 ? "average 24 hour" : "average ambulatory";
    const name = home ? "Average home" : day24 ? "Average 24 hour" : "Average ambulatory";
    results.push({ ...common, label: `${name} systolic blood pressure (calculated)`, term: `${name} systolic blood pressure`, searchTerm: `${prefix} systolic blood pressure`, value: String(sys), display: `${sys} mmHg`, how });
    results.push({ ...common, label: `${name} diastolic blood pressure (calculated)`, term: `${name} diastolic blood pressure`, searchTerm: `${prefix} diastolic blood pressure`, value: String(dia), display: `${dia} mmHg`, how });
    break; // one run is worked out; a letter with several is left for the coder
  }
  return results;
}

// Everything that can be worked out from a letter's text. patient: { birthDate, gender, letterDate } where the record has them.
export function calculateFindings(text, patient = {}, entered = {}) {
  const weight = findWeight(text) || (entered.weightKg ? { kg: Number(entered.weightKg), quote: `weight ${Number(entered.weightKg)} kg${ENTERED}` } : null);
  return [calculateBmi(text), ...calculateBloodPressureAverage(text), ...runCalculators(text, patient, weight, entered)].filter(Boolean);
}

// A letter that mentions home or ambulatory blood pressure and gives some readings, but not a run of four or more, gets no average: the person is told.
export function bloodPressureAverageGap(text) {
  const source = String(text ?? "");
  if (!SERIES_WORDS.test(source) || calculateBloodPressureAverage(source).length) return null;
  const any = [...source.matchAll(READINGS)].some((m) => believable(Number(m[1]), Number(m[2])));
  return any ? { kind: "bp-average", label: "Average blood pressure", needs: ["four or more readings written one after another"] } : null;
}

// Every calculation the letter points at but does not give enough for: [{ kind, label, needs }]. See calculatorGaps.
export function calculationGaps(text, patient = {}, entered = {}) {
  const gaps = calculatorGaps(text, patient, findWeight(text), entered);
  const average = bloodPressureAverageGap(text);
  return average ? [...gaps, average] : gaps;
}

// A worked-out value as a suggestion in the same shape as the reader's own, so it is reviewed, accepted and filed the same way.
// `component` makes Docman receive its number and unit separately; the working and the words it came from travel with it.
export function calculatedCandidate(found) {
  return {
    sourceLabel: found.label, sourceValue: found.display, searchTerm: found.searchTerm, component: "calculated",
    conceptId: found.conceptId || null, descriptionId: null, preferredTerm: found.term, assertion: "present",
    scheme: 2, codeSystem: "SNOMED CT UK Edition", status: "calculated_by_clinflow_human_review_required", acceptedByUid: null,
    calculated: { kind: found.kind, working: found.working, from: found.from, notes: found.notes },
  };
}
