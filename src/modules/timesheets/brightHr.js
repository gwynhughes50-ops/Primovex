// Reading the reports BrightHR exports as CSV, and planning how they update the practice's staff list in Primovex.
// Pure (text in, facts out) so it can be tested with made-up reports and never needs the real files or any real names.
//
// The "Holiday Summary Report" holds one block per unit ("(Hours)" and "(Days)"), each with its own heading, a company line, then a
// header row beginning "First Name" and one row per person, ending at a blank row.

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");

// "10-Aug-2022" -> "2022-08-10" ("" when it isn't a date)
export function brightDate(text) {
  const m = /^(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ](\d{4})$/.exec(clean(text));
  if (!m || !MONTHS[m[2].toLowerCase()]) return "";
  const date = new Date(Number(m[3]), MONTHS[m[2].toLowerCase()] - 1, Number(m[1]));
  return date.getDate() === Number(m[1]) ? `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(Number(m[1]))}` : "";
}

// "\t-20.00" -> -20, "" -> 0
const number = (text) => { const v = Number(clean(text).replace(/,/g, "")); return Number.isFinite(v) ? v : 0; };

// a CSV reader that copes with quoted values (and commas or new lines inside them)
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const COLUMNS = {
  first: /^first name$/i, middle: /^middle name$/i, last: /^last name$/i, teams: /^team/i, jobTitle: /^job title$/i, contractType: /^contract type$/i, payrollNo: /^payroll no/i,
  terminated: /^terminated$/i, startDate: /^start date$/i, yearFrom: /^year start$/i, yearTo: /^year end$/i, entitlement: /^holiday entitlement/i, taken: /^taken$/i,
  upcoming: /^upcoming$/i, awaiting: /^awaiting approval$/i, remaining: /^remaining$/i, carriedOver: /^carried over$/i,
};

// the holiday summary: { asAt, sections: [{ unit: "hours" | "days", people: [...] }], notes: [text] }
export function parseHolidayReport(text) {
  const rows = parseCsv(text);
  const sections = [];
  let asAt = "";
  for (let i = 0; i < rows.length; i += 1) {
    const title = /^Holiday Summary Report \((Hours|Days)\)/i.exec(clean(rows[i][0]));
    if (!title) continue;
    const unit = title[1].toLowerCase();
    let j = i + 1;
    while (j < rows.length && !/^first name$/i.test(clean(rows[j][0]))) {
      if (/^current holiday year/i.test(clean(rows[j][0])) && !asAt) asAt = brightDate(rows[j][1]);
      if (/^holiday summary report/i.test(clean(rows[j][0]))) break;
      j += 1;
    }
    if (j >= rows.length || !/^first name$/i.test(clean(rows[j][0]))) continue;
    const at = {};
    rows[j].forEach((heading, index) => { for (const [key, re] of Object.entries(COLUMNS)) if (re.test(clean(heading)) && at[key] === undefined) at[key] = index; });
    const people = [];
    for (let k = j + 1; k < rows.length && rows[k].some((c) => clean(c)); k += 1) {
      const r = rows[k];
      const get = (key) => (at[key] === undefined ? "" : clean(r[at[key]]));
      const firstName = get("first");
      const lastName = get("last");
      if (!firstName && !lastName) continue;
      people.push({
        name: [firstName, lastName].filter(Boolean).join(" "), middleName: get("middle"),
        teams: get("teams").split(";").map(clean).filter(Boolean), jobTitle: get("jobTitle"), contractType: get("contractType"), payrollNo: get("payrollNo"),
        left: /^yes$/i.test(get("terminated")), startDate: brightDate(get("startDate")),
        leaveYearFrom: brightDate(get("yearFrom")), leaveYearTo: brightDate(get("yearTo")),
        entitlement: number(get("entitlement")), taken: number(get("taken")), upcoming: number(get("upcoming")), awaiting: number(get("awaiting")),
        remaining: number(get("remaining")), carriedOver: number(get("carriedOver")),
      });
    }
    sections.push({ unit, people });
    i = j;
  }
  return { asAt, sections, notes: sections.flatMap(dataNotes) };
}

// things in the report worth a second look (it is never changed silently)
function dataNotes(section) {
  const notes = [];
  const byPayroll = new Map();
  for (const p of section.people) if (p.payrollNo) byPayroll.set(p.payrollNo, [...(byPayroll.get(p.payrollNo) || []), p.name]);
  for (const [no, names] of byPayroll) if (names.length > 1) notes.push(`Payroll number ${no} is on ${names.length} people in the ${section.unit} report (${names.join(", ")}).`);
  const noContract = section.people.filter((p) => !p.contractType).length;
  if (noContract) notes.push(`${noContract} of ${section.people.length} people in the ${section.unit} report have no contract type.`);
  const noPayroll = section.people.filter((p) => !p.payrollNo).length;
  if (noPayroll) notes.push(`${noPayroll} of ${section.people.length} people in the ${section.unit} report have no payroll number.`);
  const odd = section.people.filter((p) => p.leaveYearFrom && !p.leaveYearFrom.endsWith("-04-01")).length;
  if (odd) notes.push(`${odd} people in the ${section.unit} report have a leave year that does not start on 1 April.`);
  const negative = section.people.filter((p) => p.remaining < 0).length;
  if (negative) notes.push(`${negative} people in the ${section.unit} report have taken more leave than they are entitled to.`);
  return notes;
}

// -------- keeping the staff list in step --------------------------------------------------------------------------------

// "Karen Wyn Shaw" and "karen shaw" are the same person: first and last name, ignoring case, spaces, punctuation and a middle name
export const staffKey = (name) => { const words = clean(name).toLowerCase().replace(/[^a-z0-9' -]/g, "").split(/\s+/).filter(Boolean); return words.length > 1 ? `${words[0]} ${words[words.length - 1]}` : words[0] || ""; };
const slug = (text) => clean(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const newStaffId = (name) => `ts-${slug(name) || Date.now()}`;

// What a leave report changes. Only what BrightHR knows is touched: a person's pattern, account link and manager are never
// changed by an import. People already on file are updated; people in the report who are not yet on file are added.
//   people: from one section of parseHolidayReport; existing: [{ id, name, ... }]
export function planStaffImport(people, existing, { unit = "hours", asAt = "" } = {}) {
  const byKey = new Map(existing.map((e) => [staffKey(e.name), e]));
  const usedIds = new Set(existing.map((e) => e.id));
  const added = [];
  const updated = [];
  for (const p of people) {
    const hr = {
      jobTitle: p.jobTitle, teams: p.teams, contractType: p.contractType, payrollNo: p.payrollNo, startDate: p.startDate, active: !p.left,
      leave: { unit, yearFrom: p.leaveYearFrom, yearTo: p.leaveYearTo, entitlement: p.entitlement, taken: p.taken, upcoming: p.upcoming, awaiting: p.awaiting, remaining: p.remaining, carriedOver: p.carriedOver, asAt },
    };
    const found = byKey.get(staffKey(p.name));
    if (found) { updated.push({ id: found.id, name: found.name, hr }); continue; }
    let id = newStaffId(p.name);
    for (let n = 2; usedIds.has(id); n += 1) id = `${newStaffId(p.name)}-${n}`;
    usedIds.add(id);
    byKey.set(staffKey(p.name), { id, name: p.name });
    added.push({ id, name: p.name, hr });
  }
  return { added, updated };
}
