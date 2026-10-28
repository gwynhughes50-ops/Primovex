// Figures a person types in from the clinical record when a letter gives only part of what a calculation needs (the age, an albumin, a temperature). They fill GAPS only: a
// figure the letter itself gives is never replaced. A calculation that uses one says so in its working ("entered from the clinical record") and in a note, and it is still
// only a suggestion for the coder. Pure (no screens): the form and the calculators both use these.

export const ENTERED = " (entered from the clinical record)";

// key, label, unit, lowest and highest believable value (the same limits the letter reader uses), step; or a choice
export const FIELDS = {
  age: { label: "Age", unit: "years", min: 18, max: 110, step: 1 },
  sex: { label: "Sex", choices: [["male", "Male"], ["female", "Female"]] },
  weightKg: { label: "Weight", unit: "kg", min: 20, max: 400, step: 0.1 },
  creatinine: { label: "Creatinine", unit: "µmol/L", min: 20, max: 1500, step: 1 },
  albumin: { label: "Albumin", unit: "g/L", min: 10, max: 60, step: 1 },
  ast: { label: "AST", unit: "U/L", min: 5, max: 5000, step: 1 },
  alt: { label: "ALT", unit: "U/L", min: 5, max: 5000, step: 1 },
  platelets: { label: "Platelets", unit: "x10^9/L", min: 10, max: 1500, step: 1 },
  systolic: { label: "Systolic blood pressure", unit: "mmHg", min: 60, max: 300, step: 1 },
  diastolic: { label: "Diastolic blood pressure", unit: "mmHg", min: 30, max: 160, step: 1 },
  pulse: { label: "Pulse", unit: "bpm", min: 20, max: 250, step: 1 },
  respiratoryRate: { label: "Respiratory rate", unit: "per minute", min: 4, max: 70, step: 1 },
  spo2: { label: "Oxygen saturation", unit: "%", min: 50, max: 100, step: 1 },
  temperature: { label: "Temperature", unit: "°C", min: 30, max: 43, step: 0.1 },
  oxygen: { label: "Breathing", choices: [["air", "Room air"], ["oxygen", "On oxygen"]] },
  consciousness: { label: "Consciousness", choices: [["alert", "Alert"], ["reduced", "Confused or drowsy"]] },
};

// what a calculation needs, by name, and the form fields that supply it (blood pressure is two numbers)
export const INPUT_FIELDS = { age: ["age"], sex: ["sex"], albumin: ["albumin"], ast: ["ast"], alt: ["alt"], platelets: ["platelets"], bp: ["systolic", "diastolic"], pulse: ["pulse"], respiratoryRate: ["respiratoryRate"], spo2: ["spo2"], temperature: ["temperature"], oxygen: ["oxygen"], consciousness: ["consciousness"] };

const filled = (value) => value !== undefined && value !== null && value !== "";

// Checks what was typed: { values, problems }. Only believable figures are kept; blank fields are left out; a bad one is named.
export function cleanEnteredFigures(raw = {}) {
  const values = {};
  const problems = [];
  for (const [key, field] of Object.entries(FIELDS)) {
    if (!filled(raw[key])) continue;
    if (field.choices) {
      if (field.choices.some(([choice]) => choice === raw[key])) values[key] = raw[key]; else problems.push(`${field.label} is not one of the choices.`);
      continue;
    }
    const number = Number(String(raw[key]).replace(",", "."));
    if (!Number.isFinite(number) || number < field.min || number > field.max) problems.push(`${field.label} should be between ${field.min} and ${field.max} ${field.unit}.`);
    else values[key] = number;
  }
  if (filled(values.systolic) !== filled(values.diastolic)) problems.push("Give both blood pressure numbers, or neither.");
  else if (filled(values.systolic) && values.systolic <= values.diastolic) problems.push("The systolic pressure should be higher than the diastolic.");
  return { values: problems.length ? {} : values, problems };
}

// The form fields to show for a set of gaps ([{ inputs, optionalInputs }]): the ones needed, then the ones that only make the result better. Each once.
export function fieldsForGaps(gaps = []) {
  const unique = (keys) => [...new Set(keys)];
  const expand = (names) => unique(names.flatMap((name) => INPUT_FIELDS[name] || []));
  const required = expand(gaps.flatMap((g) => g.inputs || []));
  const optional = expand(gaps.flatMap((g) => g.optionalInputs || [])).filter((key) => !required.includes(key));
  return { required, optional };
}

// A letter's facts with the gaps filled from the entered figures. The letter always wins.
export function fillFromRecord(ctx, entered = {}) {
  const has = (key) => filled(entered[key]);
  const num = (key) => Number(entered[key]);
  const fact = (key, label, unit = "") => ({ value: num(key), quote: `${label} ${num(key)}${unit}${ENTERED}` });
  const labs = { ...ctx.labs };
  const vitals = { ...ctx.vitals };
  const ownLab = (lab, key, label, unit) => { if (!labs[lab] && has(key)) labs[lab] = fact(key, label, unit); };
  ownLab("creatinine", "creatinine", "creatinine", " µmol/L");
  ownLab("albumin", "albumin", "albumin", " g/L");
  ownLab("ast", "ast", "AST", " U/L");
  ownLab("alt", "alt", "ALT", " U/L");
  ownLab("platelets", "platelets", "platelets", " x10^9/L");
  if (!vitals.bp && has("systolic") && has("diastolic")) vitals.bp = { systolic: num("systolic"), diastolic: num("diastolic"), quote: `blood pressure ${num("systolic")}/${num("diastolic")}${ENTERED}` };
  if (!vitals.pulse && has("pulse")) vitals.pulse = fact("pulse", "pulse");
  if (!vitals.respiratoryRate && has("respiratoryRate")) vitals.respiratoryRate = fact("respiratoryRate", "respiratory rate");
  if (!vitals.spo2 && has("spo2")) vitals.spo2 = fact("spo2", "SpO2", "%");
  if (!vitals.temperature && has("temperature")) vitals.temperature = fact("temperature", "temperature");
  if (!vitals.oxygen && has("oxygen")) vitals.oxygen = entered.oxygen;
  if (!vitals.consciousness && has("consciousness")) vitals.consciousness = entered.consciousness;
  return {
    ...ctx, labs, vitals,
    age: ctx.age || (has("age") ? fact("age", "age") : null),
    sex: ctx.sex || (has("sex") ? { value: entered.sex, quote: `sex ${entered.sex}${ENTERED}` } : null),
    weight: ctx.weight || (has("weightKg") ? { kg: num("weightKg"), quote: `weight ${num("weightKg")} kg${ENTERED}` } : null),
  };
}
