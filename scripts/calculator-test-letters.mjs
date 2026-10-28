// Invented letters for testing ClinFlow's calculators, each with the answer worked out here, separately from the calculators' own code: the scores by counting
// the conditions in the letter against the published score, the equations with the published formulas. They are used by scripts/verify-clinflow-calculator-letters.mjs and
// to make the PDFs in the "calculators" test folder. Every patient is invented.

const r1 = (x) => Math.round(x * 10) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// CKD-EPI 2009 creatinine equation without an ethnicity factor: 141 x min(Scr/k,1)^a x max(Scr/k,1)^-1.209 x 0.993^age (x 1.018 if female); Scr in mg/dL = umol/L / 88.4
const ckdEpi = (umol, age, female) => { const ratio = umol / 88.4 / (female ? 0.7 : 0.9); const part = ratio < 1 ? ratio ** (female ? -0.329 : -0.411) : ratio ** -1.209; return Math.round(141 * part * 0.993 ** age * (female ? 1.018 : 1)); };
// Cockcroft-Gault with creatinine in umol/L: (140 - age) x kg x (1.04 female, 1.23 male) / creatinine
const cockcroft = (age, kg, umol, female) => Math.round(((140 - age) * kg * (female ? 1.04 : 1.23)) / umol);
const mapOf = (sys, dia) => Math.round(dia + (sys - dia) / 3);

export const KINDS = {
  bmi: ["Body mass index (calculated)", "kg/m2"],
  "bp-systolic": ["Average blood pressure, systolic (calculated)", "mmHg"],
  "bp-diastolic": ["Average blood pressure, diastolic (calculated)", "mmHg"],
  egfr: ["eGFR (calculated)", "mL/min/1.73m2"],
  crcl: ["Creatinine clearance, Cockcroft-Gault (calculated)", "mL/min"],
  "corrected-calcium": ["Corrected calcium (calculated)", "mmol/L"],
  fib4: ["FIB-4 index (calculated)", ""],
  map: ["Mean arterial pressure (calculated)", "mmHg"],
  chadsvasc: ["CHA2DS2-VASc score (calculated)", "points"],
  hasbled: ["HAS-BLED score (calculated)", "points"],
  news2: ["NEWS2 score (calculated)", "points"],
  curb65: ["CURB-65 score (calculated)", "points"],
};

const ABPM = [[134, 82], [138, 84], [142, 88], [130, 80], [136, 84], [140, 86], [132, 82], [128, 78], [138, 82], [144, 90], [136, 84], [130, 80], [134, 82], [140, 88], [138, 84], [132, 80]];
const HOME = [[142, 90], [138, 88], [146, 92], [140, 86], [144, 90]];
const at = (i) => `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;

// expect: [kind, number] for every calculation the letter should produce, and no others
export const LETTERS = [
  {
    slug: "bmi-metric", tests: "BMI from a weight in kg and a height in cm", from: "Glan Clwyd Hospital", dept: "Bariatric Service", who: "Mr Gareth Pugh", dob: "04 March 1971", nhs: "943 476 6101",
    body: ["Mr Gareth Pugh, aged 52, attended for a weight review.", "Weight 92 kg. Height 175 cm.", "Dietary advice was given and he will be reviewed again in three months."],
    expect: [["bmi", r1(92 / 1.75 ** 2)]], note: "BMI 30.0 is in the obesity class 1 range",
  },
  {
    slug: "bmi-stones-feet", tests: "BMI from stones and pounds, and feet and inches", from: "Ysbyty Gwynedd", dept: "Diabetes Centre", who: "Mrs Rhian Bevan", dob: "31 January 1959", nhs: "943 476 6102",
    body: ["Mrs Rhian Bevan, aged 66, was seen in the diabetes clinic.", "Weight: 14 st 5 lb. Height: 5 ft 10 in.", "She is following the dietary plan."],
    expect: [["bmi", r1((14 * 14 + 5) * 0.45359237 / ((5 * 12 + 10) * 0.0254) ** 2)]], note: "BMI 28.8 is in the overweight range",
  },
  {
    slug: "bmi-disagrees-with-stated", tests: "BMI where the letter's own BMI does not match the weight and height", from: "Wrexham Maelor Hospital", dept: "Endocrinology", who: "Mrs Menna Hughes", dob: "23 October 1975", nhs: "943 476 6103",
    body: ["Mrs Menna Hughes, aged 51, was reviewed.", "Weight 70 kg. Height 165 cm. BMI 31 was recorded at the last visit.", "No change to her plan."],
    expect: [["bmi", r1(70 / 1.65 ** 2)]], note: "ClinFlow should say the letter's BMI 31 does not match 25.7. If the AI has already read the stated BMI, ClinFlow shows that instead and this check does not appear.",
  },
  {
    slug: "bp-average-24-hour", tests: "Average of 16 readings from 24 hour ambulatory blood pressure monitoring", from: "Glan Clwyd Hospital", dept: "Hypertension Clinic", who: "Mr Alun Hall", dob: "04 June 1962", nhs: "943 476 6104",
    body: ["Mr Alun Hall, aged 61. 24 hour ambulatory blood pressure monitoring was completed.", `Daytime readings: ${ABPM.map(([s, d], i) => `${at(i)} ${s}/${d}`).join(", ")}.`, "Please see the average on the monitor report."],
    expect: [["bp-systolic", Math.round(mean(ABPM.map((r) => r[0])))], ["bp-diastolic", Math.round(mean(ABPM.map((r) => r[1])))]], note: "16 readings, so no 'fewer than 14' warning",
  },
  {
    slug: "bp-average-home", tests: "Average of 5 home blood pressure readings, with the 'fewer than 14' warning", from: "Wrexham Maelor Hospital", dept: "Hypertension Clinic", who: "Mrs Menna Hughes", dob: "23 October 1957", nhs: "943 476 6105",
    body: ["Mrs Menna Hughes, aged 66. Home blood pressure monitoring over several days gave these readings:", `${HOME.map(([s, d]) => `${s}/${d}`).join(", ")}.`, "Please continue her current treatment."],
    expect: [["bp-systolic", Math.round(mean(HOME.map((r) => r[0])))], ["bp-diastolic", Math.round(mean(HOME.map((r) => r[1])))]], note: "ClinFlow should warn that NICE advises at least 14 readings",
  },
  {
    slug: "egfr", tests: "eGFR from creatinine, age and sex", from: "Glan Clwyd Hospital", dept: "Renal Medicine", who: "Mr Idris Parry", dob: "11 February 1958", nhs: "943 476 6106",
    body: ["Mr Idris Parry, aged 68, was seen in the renal clinic.", "Creatinine 142 umol/L."],
    expect: [["egfr", ckdEpi(142, 68, false)]], note: "category G3b",
  },
  {
    slug: "creatinine-clearance", tests: "Cockcroft-Gault creatinine clearance (needs a weight), and eGFR from the same figures", from: "Ysbyty Gwynedd", dept: "Care of the Elderly", who: "Mrs Nia Pritchard", dob: "09 September 1951", nhs: "943 476 6107",
    body: ["Mrs Nia Pritchard, aged 74, was seen for a medicines review.", "Weight 62 kg. Creatinine 96 umol/L."],
    expect: [["egfr", ckdEpi(96, 74, true)], ["crcl", cockcroft(74, 62, 96, true)]], note: "both appear: the creatinine clearance is the one for drug doses",
  },
  {
    slug: "corrected-calcium", tests: "Calcium corrected for albumin", from: "Wrexham Maelor Hospital", dept: "Endocrinology", who: "Mr Emrys Lloyd", dob: "14 March 1957", nhs: "943 476 6108",
    body: ["Mr Emrys Lloyd. Bone profile results:", "Calcium 2.31 mmol/L. Albumin 31 g/L."],
    expect: [["corrected-calcium", Math.round((2.31 + 0.02 * (40 - 31)) * 100) / 100]], note: "shown as 2.49 mmol/L",
  },
  {
    slug: "fib4", tests: "FIB-4 liver fibrosis index", from: "Glan Clwyd Hospital", dept: "Hepatology", who: "Mrs Bethan Owen", dob: "28 August 1968", nhs: "943 476 6109",
    body: ["Mrs Bethan Owen, aged 58, was seen in the liver clinic.", "Liver profile: AST 62 U/L, ALT 48 U/L, platelets 140 x10^9/L."],
    expect: [["fib4", r1((58 * 62) / (140 * Math.sqrt(48)))]], note: "3.7 is over 2.67: high risk of advanced fibrosis",
  },
  {
    slug: "map", tests: "Mean arterial pressure from one blood pressure", from: "Wrexham Maelor Hospital", dept: "Urology", who: "Mr Cledwyn Rees", dob: "20 July 1967", nhs: "943 476 6110",
    body: ["Mr Cledwyn Rees, aged 59, attended for review.", "Blood pressure 148/92 today."],
    expect: [["map", mapOf(148, 92)]], note: "pulse pressure 56",
  },
  {
    slug: "chadsvasc-high", tests: "CHA2DS2-VASc with age 75 or over, hypertension, diabetes and a previous stroke (and HAS-BLED from the same letter)", from: "Ysbyty Gwynedd", dept: "Cardiology", who: "Mrs Glenys Davies", dob: "12 April 1948", nhs: "943 476 6111",
    body: ["Mrs Glenys Davies, aged 78, has atrial fibrillation.", "She has hypertension and type 2 diabetes and a previous stroke in 2019. She takes apixaban."],
    // age 75+ 2, hypertension 1, diabetes 1, previous stroke 2, female 1 = 7;  HAS-BLED: previous stroke 1, age over 65 1 = 2
    expect: [["chadsvasc", 7], ["hasbled", 2]], note: "both are 'at least' scores",
  },
  {
    slug: "chadsvasc-heart-failure", tests: "CHA2DS2-VASc with heart failure, hypertension and age 65 to 74, male", from: "Wrexham Maelor Hospital", dept: "Cardiology", who: "Mr Owain Griffiths", dob: "25 February 1956", nhs: "943 476 6112",
    body: ["Mr Owain Griffiths, aged 70, has atrial fibrillation with heart failure (left ventricular systolic dysfunction) and hypertension."],
    // heart failure 1, hypertension 1, age 65 to 74 1, male 0 = 3;  HAS-BLED: age over 65 1
    expect: [["chadsvasc", 3], ["hasbled", 1]], note: "",
  },
  {
    slug: "hasbled-high", tests: "HAS-BLED with high systolic pressure, a previous TIA, aspirin, anaemia and age over 65 (and CHA2DS2-VASc and MAP)", from: "Glan Clwyd Hospital", dept: "Stroke Service", who: "Mr Dylan Pugh", dob: "18 October 1950", nhs: "943 476 6113",
    body: ["Mr Dylan Pugh, aged 76, has atrial fibrillation and takes apixaban.", "Blood pressure 172/94. Previous TIA in 2022. Takes aspirin 75 mg daily. Known anaemia."],
    // HAS-BLED: systolic over 160 1, previous TIA 1, anaemia 1, age over 65 1, aspirin 1 = 5;  CHA2DS2-VASc: TIA 2, age 75+ 2 = 4 (no hypertension is named)
    expect: [["hasbled", 5], ["chadsvasc", 4], ["map", mapOf(172, 94)]], note: "",
  },
  {
    slug: "news2-moderate", tests: "NEWS2 from a full set of observations, on air", from: "Glan Clwyd Hospital", dept: "Acute Medical Unit", who: "Mrs Eirian Jones", dob: "27 May 1955", nhs: "943 476 6114",
    body: ["Mrs Eirian Jones, aged 71, was seen in the acute clinic.", "Observations: respiratory rate 22, SpO2 94% on room air, blood pressure 105/60, pulse 112 bpm, temperature 38.4, alert."],
    // respiratory rate 22 = 2, SpO2 94 = 1, systolic 105 = 1, pulse 112 = 2, temperature 38.4 = 1, air 0, alert 0 = 7
    expect: [["news2", 7], ["map", mapOf(105, 60)]], note: "7 or more is a high clinical risk on the NEWS2 chart",
  },
  {
    slug: "news2-urgent", tests: "NEWS2 on oxygen and confused, where single figures score 3", from: "Wrexham Maelor Hospital", dept: "Acute Medical Unit", who: "Mr Imran Khan", dob: "17 May 1967", nhs: "943 476 6115",
    body: ["Mr Imran Khan, aged 59, was found unwell on the ward and confused.", "Observations: respiratory rate 26, SpO2 89% on 4 L oxygen, blood pressure 88/50, pulse 132, temperature 38.2."],
    // respiratory rate 26 = 3, SpO2 89 = 3, oxygen 2, systolic 88 = 3, pulse 132 = 3, temperature 38.2 = 1, confused 3 = 18
    expect: [["news2", 18], ["map", mapOf(88, 50)]], note: "ClinFlow should say one figure scores 3 on its own, needing an urgent response",
  },
  {
    slug: "curb65-high", tests: "CURB-65 for pneumonia: confusion, urea, respiratory rate, blood pressure and age", from: "Ysbyty Gwynedd", dept: "Respiratory Medicine", who: "Mrs Sian Roberts", dob: "30 September 1944", nhs: "943 476 6116",
    body: ["Mrs Sian Roberts, aged 81, was admitted with community-acquired pneumonia. She was confused.", "Urea 9.2 mmol/L, respiratory rate 32, blood pressure 98/58."],
    // confusion 1, urea over 7 1, respiratory rate 30 or over 1, diastolic 60 or under 1, age 65 or over 1 = 5
    expect: [["curb65", 5], ["map", mapOf(98, 58)]], note: "5 is high risk",
  },
  {
    slug: "NEGATIVE-egfr-already-stated", tests: "NOTHING should be worked out: the letter already states the eGFR", from: "Glan Clwyd Hospital", dept: "Renal Medicine", who: "Mr Dewi Evans", dob: "02 August 1958", nhs: "943 476 6117",
    body: ["Mr Dewi Evans, aged 68.", "Creatinine 142 umol/L, eGFR 43 mL/min."],
    expect: [], note: "ClinFlow must not add its own eGFR when the laboratory gave one",
  },
  {
    slug: "NEGATIVE-missing-age", tests: "NOTHING should be worked out: the age is missing, so there is no eGFR", from: "Wrexham Maelor Hospital", dept: "Renal Medicine", who: "Mr Hywel Thomas", dob: "16 June 1947", nhs: "943 476 6118",
    body: ["Mr Hywel Thomas.", "Creatinine 142 umol/L."],
    expect: [], note: "ClinFlow must not guess an age",
  },
  {
    slug: "NEGATIVE-conditions-ruled-out", tests: "Conditions ruled out must not be counted: no diabetes, no hypertension, no stroke", from: "Ysbyty Gwynedd", dept: "Cardiology", who: "Mr Cledwyn Rees", dob: "20 July 1946", nhs: "943 476 6119",
    body: ["Mr Cledwyn Rees, aged 80, has atrial fibrillation.", "No diabetes, no hypertension and no history of stroke. Not on any anticoagulant."],
    // CHA2DS2-VASc: age 75+ 2 only;  HAS-BLED: age over 65 1 only
    expect: [["chadsvasc", 2], ["hasbled", 1]], note: "the ruled-out conditions add nothing",
  },
  {
    slug: "several-at-once", tests: "One realistic letter that gives several calculations at once", from: "Glan Clwyd Hospital", dept: "Care of the Elderly", who: "Mrs Angharad Vaughan", dob: "03 May 1944", nhs: "943 476 6120",
    body: ["Mrs Angharad Vaughan, aged 82, has atrial fibrillation and takes apixaban. She has hypertension.", "Weight 58 kg. Creatinine 110 umol/L. Blood pressure 138/76."],
    // CHA2DS2-VASc: age 75+ 2, hypertension 1, female 1 = 4;  HAS-BLED: age over 65 1 (creatinine under 200)
    expect: [["egfr", ckdEpi(110, 82, true)], ["crcl", cockcroft(82, 58, 110, true)], ["map", mapOf(138, 76)], ["chadsvasc", 4], ["hasbled", 1]], note: "five calculations from one letter",
  },
];

// Everything on the page, in reading order, as it is printed in the PDF: the letterhead, address and date as well as the body, so a test sees what the OCR reader would
export const LETTER_DATE = "14 October 2026";
export const FOOTER = "SYNTHETIC TEST LETTER - invented patient, not real data";
export const fullTextOf = (letter) => [
  letter.from, letter.dept, `Date: ${LETTER_DATE}`, "Dr A N Other", "Greenfield Surgery", "123 High Street, Mold, CH7 1AB", "Dear Dr Other",
  `Re: ${letter.who}  DOB: ${letter.dob}  NHS number: ${letter.nhs}`, ...letter.body, "Yours sincerely", `Dr B Consultant, ${letter.dept}`, FOOTER,
].join("\n");
