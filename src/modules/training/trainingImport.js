// Reading a practice's training matrix spreadsheet (the NHS "Staff Training Matrix Toolkit" layout and the practice's own versions of
// it) into courses, people and records. Pure: it is given each sheet as { name, rows: [{ r, cells: { columnNumber: value } }] }
// (see readWorkbook.js), so it can be tested with made-up sheets and never needs the real file or any real names.
//
// What the sheets look like:
//   - a header row naming the courses (the one with "Information Governance"), a row above it saying how often each repeats
//     ("3 Yearly (ONLINE)", "Once only"), and a row above that with the group titles ("ALL STAFF MANDATORY TRAINING")
//   - a course is either a pair of columns (DATE OBTAINED and DATE DUE), or one column: a date it runs out ("EXP 2 yearly") or,
//     with no EXP in its name, the date it was done (once-only)
//   - the two columns before the first course hold first and last name; the job role is further left
//   - dates are Excel day numbers; the red/amber/green colours in the sheet are not read, the lights are worked out from the dates
// Cells that are not a sensible date ("Frb 29", 730) are not imported and are listed so a person can check them.

import { addMonths, fromExcelSerial } from "./training.js";
import { nameIndex, nameKey } from "./mergePeople.js";

const norm = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const keyOf = (text) => norm(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
const slug = (text) => norm(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const LEGEND = /^(key|red|amber|green|purple|blue)\b|traffic light/i;
const IGNORED_SHEET = /introduction|past staff|^old\b|training matrix in department|^training matrix$/i;

// sheets that are probably the live ones (not the toolkit's examples, old staff or the instructions)
export const likelyLiveSheet = (name) => !IGNORED_SHEET.test(norm(name));

export function guessGroup(jobRole) {
  const role = norm(jobRole).toLowerCase();
  if (/caretaker|cleaner|domestic|maintenance|estates/.test(role)) return "support";
  if (/\b(gp|doctor|partner|registrar)\b|practitioner|nurse|\bnp\b|\banp\b|\bhca\b|physio|\bmhp\b|\bap\b|paramedic|pharmac|clinical|phlebot|dispenser/.test(role)) return "clinical";
  return "admin";
}

function intervalFromText(text) {
  const t = norm(text).toLowerCase();
  if (!t) return null;
  if (/once|one off|one-off/.test(t)) return 0;
  if (/annual|every year|1 year|1 yearly|yearly(?!\s*\d)/.test(t) && !/\d\s*year/.test(t.replace(/1\s*year/, ""))) return 12;
  const m = /(\d+)\s*(?:year|yr)/.exec(t);
  if (m) return Number(m[1]) * 12;
  return null;
}

const modeFromText = (text) => (/face/i.test(text) ? "face-to-face" : /online/i.test(text) ? "online" : "");

// the name of a course without the words about the date columns or how often it repeats
function baseName(header) {
  return norm(header)
    .replace(/\b(date obtained|data obtained|date due|refresher due|date obtain\w*)\b/gi, "")
    .replace(/\bEXP\b.*$/i, "")
    .replace(/\(\s*\d*\s*yearly[^)]*\)/gi, "")
    .replace(/\s+level\s+level\b/i, " Level")
    .replace(/[=\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DBS_NOTE = /\bdbs\b/i;
const textCells = (row) => Object.entries(row?.cells || {}).filter(([, v]) => typeof v === "string" && norm(v));

// the course columns of one sheet
function readColumns(rows) {
  const headerRow = rows.find((row) => textCells(row).length >= 3 && textCells(row).some(([, v]) => /information governance/i.test(v)));
  if (!headerRow) return null;
  const rowAt = (r) => rows.find((row) => row.r === r);
  const intervalRow = rowAt(headerRow.r - 1);
  const header = Object.fromEntries(textCells(headerRow).map(([c, v]) => [Number(c), norm(v)]));
  const courseCols = Object.keys(header).map(Number).filter((c) => c > 1 && !/^(job role|employee name)$/i.test(header[c])).sort((a, b) => a - b);
  if (!courseCols.length) return null;
  // titles above the header (the groups) apply to the columns from where they start up to the next title
  const titles = rows.filter((row) => row.r < headerRow.r).flatMap((row) => textCells(row).map(([c, v]) => ({ col: Number(c), text: norm(v) }))).filter((t) => /training|staff|group/i.test(t.text) && t.text === t.text.toUpperCase());
  const groupOf = (col) => {
    const left = titles.filter((t) => t.col <= col).sort((a, b) => b.col - a.col)[0];
    return left ? left.text.replace(/\s+/g, " ").replace(/\bTRAINING\b/, "").trim().toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase()) || "General" : "General";
  };
  const hintAt = (col) => norm(intervalRow?.cells?.[col] ?? intervalRow?.cells?.[col - 1] ?? "");

  const columns = [];
  for (let i = 0; i < courseCols.length; i += 1) {
    const col = courseCols[i];
    const next = courseCols[i + 1];
    const base = baseName(header[col]);
    if (!base) continue;
    const pair = next === col + 1 && keyOf(baseName(header[next])) === keyOf(base);
    if (pair) {
      columns.push({ kind: "pair", name: base, obtainedCol: col, dueCol: next, intervalHint: intervalFromText(hintAt(col)) ?? intervalFromText(hintAt(next)), mode: modeFromText(`${hintAt(col)} ${header[col]}`), category: groupOf(col) });
      i += 1;
    } else {
      const exp = /EXP\w*\s*(\d+)?\s*(?:year|yr)/i.exec(header[col]);
      const expMonths = exp ? Number(exp[1] || 1) * 12 : null;
      const hint = intervalFromText(hintAt(col));
      if (/(date due|refresher due)\s*$/i.test(header[col]) && columns.length && columns[columns.length - 1].kind === "single" && keyOf(columns[columns.length - 1].name) === keyOf(base)) continue;
      columns.push({ kind: "single", name: base, col, expiry: expMonths !== null || /(date due|refresher due)/i.test(header[col]), intervalHint: expMonths ?? hint, mode: modeFromText(`${hintAt(col)} ${header[col]}`), category: groupOf(col) });
    }
  }
  const firstCol = Math.min(...courseCols);
  return { headerRow, columns, firstCol, firstNameCol: firstCol - 2, lastNameCol: firstCol - 1 };
}

const monthsBetween = (fromKey, toKey) => {
  const a = new Date(`${fromKey}T00:00:00`);
  const b = new Date(`${toKey}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (30.4375 * 86400000));
};
const nearest = (months) => [12, 24, 36, 60].reduce((best, v) => (Math.abs(v - months) < Math.abs(best - months) ? v : best), 12);
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function parseTrainingSheets(sheets) {
  const courses = new Map(); // key -> course
  const people = new Map();
  const records = new Map();
  const warnings = [];
  const read = [];

  for (const sheet of sheets) {
    const layout = readColumns(sheet.rows);
    if (!layout) { warnings.push({ sheet: sheet.name, person: "", course: "", text: "No training header row was found on this sheet, so it was skipped." }); continue; }
    const { columns, firstNameCol, lastNameCol, headerRow } = layout;

    // a note such as "open DBS" where the surname should be means this sheet's names sit one column to the left
    const shift = sheet.rows.some((row) => row.r > headerRow.r && DBS_NOTE.test(norm(row.cells[lastNameCol]))) ? 1 : 0;

    // the staff rows
    const staffRows = sheet.rows.filter((row) => row.r > headerRow.r).map((row) => {
      const first = norm(row.cells[firstNameCol - shift]);
      const last = norm(row.cells[lastNameCol - shift]);
      const roleCells = [1, 2].filter((c) => c < firstNameCol - shift).map((c) => norm(row.cells[c])).filter((v) => v && Number.isNaN(Number(v)));
      const jobRole = roleCells.length > 1 ? roleCells[roleCells.length - 1] : roleCells[0] || "";
      return { row, first, last, jobRole, name: [first, last].filter(Boolean).join(" ") };
    }).filter((s) => s.name && Number.isNaN(Number(s.first)) && Number.isNaN(Number(s.last)) && !LEGEND.test(s.name) && !LEGEND.test(norm(s.row.cells[1])) && !LEGEND.test(norm(s.row.cells[2])));

    // each course's interval: the hint above it, else what the dates show
    const resolved = columns.map((column) => {
      let months = column.intervalHint;
      if (months === null || months === undefined) {
        if (column.kind === "pair") {
          const gaps = [];
          for (const s of staffRows) {
            const done = fromExcelSerial(s.row.cells[column.obtainedCol]);
            const due = fromExcelSerial(s.row.cells[column.dueCol]);
            if (done && due) gaps.push(monthsBetween(done, due));
          }
          months = gaps.length ? nearest(median(gaps)) : 0;
        } else months = /\b20\d\d\b/.test(column.name) ? 12 : 0;
      }
      return { ...column, months };
    });

    for (const column of resolved) {
      const id = `c-${slug(column.name)}`;
      if (!courses.has(id)) courses.set(id, { id, name: column.name, category: column.category, intervalMonths: column.months, mode: column.mode, order: courses.size });
    }

    for (const s of staffRows) {
      const personKey = keyOf(s.name);
      if (!people.has(personKey)) people.set(personKey, { id: `p-${slug(s.name)}`, name: s.name, jobRole: s.jobRole, group: guessGroup(s.jobRole), active: true });
      const person = people.get(personKey);
      if (!person.jobRole && s.jobRole) { person.jobRole = s.jobRole; person.group = guessGroup(s.jobRole); }

      for (const column of resolved) {
        const course = courses.get(`c-${slug(column.name)}`);
        const cellValue = (c) => s.row.cells[c];
        let completedOn = "";
        let dueOn = "";
        const bad = [];
        const asDate = (value) => {
          if (value === undefined || value === "") return "";
          const date = fromExcelSerial(value);
          if (!date) bad.push(value);
          return date;
        };
        if (column.kind === "pair") {
          completedOn = asDate(cellValue(column.obtainedCol));
          dueOn = asDate(cellValue(column.dueCol));
        } else if (column.expiry) {
          dueOn = asDate(cellValue(column.col));
          if (dueOn && column.months) completedOn = addMonths(dueOn, -column.months);
        } else {
          completedOn = asDate(cellValue(column.col));
        }
        if (bad.length) warnings.push({ sheet: sheet.name, person: s.name, course: column.name, text: `"${bad.join('", "')}" is not a usable date, so it was not imported.` });
        if (!completedOn && !dueOn) continue;
        const key = `${person.id}_${course.id}`;
        const existing = records.get(key);
        const latest = dueOn || completedOn;
        if (!existing || latest > (existing.dueOn || existing.completedOn)) records.set(key, { personId: person.id, courseId: course.id, completedOn, dueOn: column.kind === "pair" || column.expiry ? dueOn : "" });
      }
    }
    read.push({ sheet: sheet.name, people: staffRows.length, courses: resolved.length });
  }

  return { courses: [...courses.values()], people: [...people.values()], records: [...records.values()], warnings, read };
}

// What an import would do given what is already there. Nothing is ever removed or overwritten with older information:
//   courses and people already on file keep their own settings (a renamed course, a corrected group, a linked account);
//   a record is written when it is new, or its date is later than the one on file; "not required" and "away" marks are never replaced.
//   existing: { courses, people, records } as they are in the database now
export function planImport(parsedIn, existing = {}) {
  // A spreadsheet name that is one a person is known by (the other name left after two people were joined, or a nickname recorded
  // for them) belongs to that person, not to a new one.
  const byName = nameIndex(existing.people || []);
  const idFor = (p) => (byName.get(nameKey(p.name)) || {}).id || p.id;
  const idMap = new Map(parsedIn.people.map((p) => [p.id, idFor(p)]));
  const parsed = {
    ...parsedIn,
    people: [...new Map(parsedIn.people.map((p) => [idMap.get(p.id), { ...p, id: idMap.get(p.id) }])).values()],
    records: parsedIn.records.map((r) => ({ ...r, personId: idMap.get(r.personId) || r.personId })),
  };
  const haveCourse = new Set((existing.courses || []).map((c) => c.id));
  const havePerson = new Map((existing.people || []).map((p) => [p.id, p]));
  const haveRecord = new Map((existing.records || []).map((r) => [`${r.personId}_${r.courseId}`, r]));
  const newPeople = parsed.people.filter((p) => !havePerson.has(p.id));
  const personOf = (id) => havePerson.get(id) || newPeople.find((p) => p.id === id);
  const writes = [];
  let unchanged = 0;
  let kept = 0;
  for (const record of parsed.records) {
    const person = personOf(record.personId);
    if (!person) continue;
    const current = haveRecord.get(`${record.personId}_${record.courseId}`);
    if (current && (current.status === "not-required" || current.status === "on-leave")) { kept += 1; continue; }
    const incoming = record.dueOn || record.completedOn;
    const onFile = current ? current.dueOn || current.completedOn : "";
    if (current && incoming <= onFile) { unchanged += 1; continue; }
    writes.push({ ...record, group: person.group, ownerUid: person.uid || "" });
  }
  return {
    newCourses: parsed.courses.filter((c) => !haveCourse.has(c.id)),
    newPeople,
    records: writes,
    unchanged,
    kept,
    existingPeople: parsed.people.length - newPeople.length,
    existingCourses: parsed.courses.length - parsed.courses.filter((c) => !haveCourse.has(c.id)).length,
  };
}

// Matching people to Primovex accounts by name: exact on "first last" ignoring case, punctuation and extra spaces; one match only.
//   staff: [{ id, label }] from the staff directory. Returns [{ personId, uid, label }]: suggestions only, nothing is linked here.
export function suggestAccountLinks(people, staff) {
  const clean = (text) => String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const byName = new Map();
  for (const s of staff || []) {
    const key = clean(s.label);
    byName.set(key, [...(byName.get(key) || []), s]);
  }
  const taken = new Set(people.filter((p) => p.uid).map((p) => p.uid));
  const suggestions = [];
  for (const person of people) {
    if (person.uid || person.active === false) continue;
    const matches = byName.get(clean(person.name)) || [];
    if (matches.length === 1 && !taken.has(matches[0].id)) { suggestions.push({ personId: person.id, uid: matches[0].id, label: matches[0].label }); taken.add(matches[0].id); }
  }
  return suggestions;
}
