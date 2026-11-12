// A demo reception rota for demo and training mode: invented people, four weeks already built and a few absences, kept in memory so the whole rota page works (build, change a place, add
// time off, change the rules) without touching any real data. Nothing here is saved anywhere: reloading the page starts again.
import { DAYS, DEFAULT_SETTINGS, DEFAULT_SHIFTS, addDays, mondayOf, newPerson } from "./rotaModel.js";
import { generateWeeks } from "./rotaEngine.js";
import { withNames } from "./rotaWeek.js";

const LATEST = Object.fromEntries(DAYS.map((d) => [d, "18:30"]));
const person = (uid, name, extra = {}) => ({ ...newPerson(`demo-${uid}`, name), ...extra });

export const demoRules = () => ({
  shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
  settings: { ...DEFAULT_SETTINGS },
  people: [
    person("dan", "Dan", { mode: "usual", shift: "desk", coverShifts: ["early1", "early2", "mid", "late"], cannotDo: ["tyelan"] }),
    person("jo", "Jo", { mode: "fixed", shift: "admin2" }),
    person("hana", "Hana", { earliest: { mon: "09:00", tue: "08:00", wed: "08:00", thu: "09:00", fri: "09:00" }, latest: LATEST, maxPerWeek: { late: 1 } }),
    person("eve", "Eve"), person("finn", "Finn"), person("gus", "Gus"), person("ivy", "Ivy"), person("kit", "Kit"),
    person("lena", "Lena", { dayRules: { wed: { shift: "group:early", until: "12:00" } } }),
    person("mia", "Mia", { mode: "only", onlyShifts: ["desk2"], days: ["wed", "thu", "fri"] }),
    person("noor", "Noor", { mode: "only", onlyShifts: ["desk2"], days: ["tue", "wed", "thu"] }),
  ],
});

export function demoAbsences(monday) {
  const d = (week, day) => addDays(monday, 7 * week + day);
  return [
    { id: "demo-a1", uid: "demo-ivy", name: "Ivy", from: d(0, 3), to: d(0, 3), fromTime: "14:00", reason: "other", createdByName: "Demo" },
    { id: "demo-a2", uid: "demo-finn", name: "Finn", from: d(1, 1), to: d(1, 2), reason: "leave", createdByName: "Demo" },
    { id: "demo-a3", uid: "demo-kit", name: "Kit", from: d(1, 0), to: d(1, 0), toTime: "13:00", reason: "other", createdByName: "Demo" },
    { id: "demo-a4", uid: "demo-gus", name: "Gus", from: d(2, 4), to: d(2, 4), reason: "toil", createdByName: "Demo" },
  ];
}

export function demoWeeks(rules, absences, monday) {
  const built = generateWeeks({ rules, firstMonday: monday, weeks: 4, absences });
  return Object.fromEntries(built.map((w) => [w.mondayIso, { ...withNames(w, rules), edited: {} }]));
}

// A small in-memory store with listeners, so the page updates as it would from the database.
let store = null;
export function demoStore() {
  if (store) return store;
  const monday = mondayOf(new Date());
  const rules = demoRules();
  const absences = demoAbsences(monday);
  const state = { rules, weeks: demoWeeks(rules, absences, monday), absences };
  const listeners = { rules: new Set(), weeks: new Set(), absences: new Set() };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const emit = (kind) => listeners[kind].forEach((cb) => cb(clone(state[kind])));
  store = {
    subscribe(kind, cb) { listeners[kind].add(cb); setTimeout(() => cb(clone(state[kind])), 0); return () => listeners[kind].delete(cb); },
    set(kind, value) { state[kind] = clone(value); emit(kind); },
    saveWeek(week) { state.weeks = { ...state.weeks, [week.mondayIso]: clone(week) }; emit("weeks"); },
    removeWeek(mondayIso) { const next = { ...state.weeks }; delete next[mondayIso]; state.weeks = next; emit("weeks"); },
    addAbsence(row) { state.absences = [...state.absences, { id: `demo-${Date.now()}`, createdByName: "Demo", ...clone(row) }].sort((x, y) => String(x.from).localeCompare(String(y.from))); emit("absences"); },
    removeAbsence(id) { state.absences = state.absences.filter((a) => a.id !== id); emit("absences"); },
  };
  return store;
}
